import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create };
  },
}));

const { GeminiProvider } = await import("@/lib/agent/gemini");
const { createLlmProvider } = await import("@/lib/agent/llm");

beforeEach(() => create.mockReset());

describe("GeminiProvider", () => {
  it("runs a tool-calling loop and returns the final text", async () => {
    create
      .mockResolvedValueOnce({
        status: "requires_action",
        steps: [
          { type: "thought", signature: "sig" },
          {
            type: "function_call",
            id: "c1",
            name: "qloo_where_popular",
            arguments: { entity: "x", within: "Canada" },
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "completed",
        steps: [{ type: "model_output" }],
        output_text: '{"summary":"ok"}',
      });
    const execute = vi.fn().mockResolvedValue({ text: '{"evidence_id":"ev2"}' });

    const provider = new GeminiProvider("gemini-3.8-flash", "key");
    const out = await provider.runLoop({
      system: "sys",
      prompt: "plan",
      tools: [
        {
          name: "qloo_where_popular",
          description: "d",
          inputSchema: {
            type: "object",
            examples: [1],
            properties: { entity: { type: "string", default: "a" } },
          },
        },
      ],
      execute,
      maxToolCalls: 5,
      deadline: Date.now() + 60_000,
    });

    expect(out).toMatchObject({ text: '{"summary":"ok"}', toolCalls: 1, turns: 2 });
    expect(execute).toHaveBeenCalledWith("qloo_where_popular", { entity: "x", within: "Canada" });
    const first = create.mock.calls[0]![0];
    expect(first).toMatchObject({
      model: "gemini-3.8-flash",
      system_instruction: "sys",
      store: false,
    });
    expect(first.tools[0].parameters).toEqual({
      type: "object",
      properties: { entity: { type: "string" } },
    });
    const secondInput = create.mock.calls[1]![0].input;
    expect(secondInput.map((s: { type: string }) => s.type)).toEqual([
      "user_input",
      "thought",
      "function_call",
      "function_result",
    ]);
    expect(secondInput[3]).toMatchObject({
      call_id: "c1",
      name: "qloo_where_popular",
      result: '{"evidence_id":"ev2"}',
    });
  });

  it("stops granting tools once the budget is spent", async () => {
    create
      .mockResolvedValueOnce({
        status: "requires_action",
        steps: [
          { type: "function_call", id: "a", name: "t", arguments: {} },
          { type: "function_call", id: "b", name: "t", arguments: {} },
        ],
      })
      .mockResolvedValueOnce({ status: "completed", steps: [], output_text: "{}" });
    const execute = vi.fn().mockResolvedValue({ text: "r" });
    await new GeminiProvider("m", "k").runLoop({
      system: "",
      prompt: "",
      tools: [{ name: "t", description: "", inputSchema: {} }],
      execute,
      maxToolCalls: 1,
      deadline: Date.now() + 60_000,
    });
    expect(execute).toHaveBeenCalledTimes(1);
    const second = create.mock.calls[1]![0];
    expect(second.generation_config.tool_choice).toBe("none");
    expect(second.input.at(-1).type).toBe("user_input");
  });

  it("throws on a failed interaction so the runner can fall back", async () => {
    create.mockResolvedValueOnce({ status: "failed", steps: [] });
    await expect(
      new GeminiProvider("m", "k").complete("s", "p", Date.now() + 10_000),
    ).rejects.toThrow(/failed/);
  });
});

describe("createLlmProvider", () => {
  it("picks the provider from whichever key is present", () => {
    expect(createLlmProvider({ GEMINI_API_KEY: "g" })?.id).toBe("gemini");
    expect(createLlmProvider({ GEMINI_API_KEY: "g" })?.model).toBe("gemini-3.8-flash");
    expect(createLlmProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })?.id).toBe(
      "anthropic",
    );
    expect(
      createLlmProvider({ LLM_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })
        ?.id,
    ).toBe("gemini");
    expect(createLlmProvider({})).toBeNull();
  });

  it("ignores an LLM_MODEL that belongs to the other provider", () => {
    expect(createLlmProvider({ GEMINI_API_KEY: "g", LLM_MODEL: "claude-sonnet-5-5" })?.model).toBe(
      "gemini-3.8-flash",
    );
    expect(createLlmProvider({ GEMINI_API_KEY: "g", LLM_MODEL: "gemini-3.6-flash" })?.model).toBe(
      "gemini-3.6-flash",
    );
  });
});
