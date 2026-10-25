import { beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  FunctionCallingConfigMode: { AUTO: "AUTO", NONE: "NONE" },
  ThinkingLevel: { LOW: "LOW" },
}));

const { GeminiProvider } = await import("@/lib/agent/gemini");
const { createLlmProvider } = await import("@/lib/agent/llm");

const reply = (parts: unknown[], functionCalls?: unknown[], text = "") => ({
  candidates: [{ content: { role: "model", parts } }],
  functionCalls,
  text,
});

beforeEach(() => generateContent.mockReset());

describe("GeminiProvider", () => {
  it("runs a tool-calling loop and returns the final text", async () => {
    const call = { id: "c1", name: "qloo_where_popular", args: { entity: "x", within: "Canada" } };
    generateContent
      .mockResolvedValueOnce(reply([{ functionCall: call, thoughtSignature: "sig" }], [call]))
      .mockResolvedValueOnce(reply([{ text: '{"summary":"ok"}' }], undefined, '{"summary":"ok"}'));
    const execute = vi.fn().mockResolvedValue({ text: '{"evidence_id":"ev2"}' });

    const out = await new GeminiProvider("gemini-3.8-flash", "key").runLoop({
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
    const first = generateContent.mock.calls[0]![0];
    expect(first.model).toBe("gemini-3.8-flash");
    expect(first.config.systemInstruction).toBe("sys");
    expect(first.config.httpOptions.timeout).toBeLessThanOrEqual(45_000);
    expect(first.config.tools[0].functionDeclarations[0].parametersJsonSchema).toEqual({
      type: "object",
      properties: { entity: { type: "string" } },
    });
    const second = generateContent.mock.calls[1]![0].contents;
    expect(second.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    expect(second[1].parts[0].thoughtSignature).toBe("sig");
    expect(second[2].parts[0].functionResponse).toEqual({
      id: "c1",
      name: "qloo_where_popular",
      response: { output: '{"evidence_id":"ev2"}' },
    });
  });

  it("stops granting tools once the budget is spent", async () => {
    const a = { id: "a", name: "t", args: {} };
    const b = { id: "b", name: "t", args: {} };
    generateContent
      .mockResolvedValueOnce(reply([{ functionCall: a }, { functionCall: b }], [a, b]))
      .mockResolvedValueOnce(reply([{ text: "{}" }], undefined, "{}"));
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
    const second = generateContent.mock.calls[1]![0];
    expect(second.config.toolConfig.functionCallingConfig.mode).toBe("NONE");
    const lastParts = second.contents.at(-1).parts;
    expect(lastParts[1].functionResponse.response).toEqual({
      error: "Tool budget reached. Do not call more tools.",
    });
    expect(lastParts.at(-1).text).toMatch(/final JSON/);
  });

  it("throws when Gemini returns no content so the runner can fall back", async () => {
    generateContent.mockResolvedValueOnce({
      candidates: [],
      promptFeedback: { blockReason: "SAFETY" },
    });
    await expect(
      new GeminiProvider("m", "k").complete("s", "p", Date.now() + 10_000),
    ).rejects.toThrow(/SAFETY/);
  });
});

describe("busy-model fallback", () => {
  const busy = () =>
    Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });

  it("moves to the next model when the first one is overloaded", async () => {
    generateContent
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(reply([{ text: "OK" }], undefined, "OK"));
    const provider = new GeminiProvider("gemini-3.6-flash", "k");
    expect(await provider.complete("s", "p", Date.now() + 10_000)).toBe("OK");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      "gemini-3.6-flash",
      "gemini-3.8-flash",
    ]);
    expect(provider.model).toBe("gemini-3.8-flash");
  });

  it("gives up after the last fallback", async () => {
    generateContent.mockRejectedValueOnce(busy()).mockRejectedValueOnce(busy());
    const error = await new GeminiProvider("a", "k", ["b"])
      .complete("s", "p", Date.now() + 10_000)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(String(error)).toMatch(/503/);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["a", "b"]);
  });

  it("treats a first-turn timeout as busy and moves on", async () => {
    generateContent
      .mockRejectedValueOnce(
        Object.assign(new Error("This operation was aborted"), { name: "AbortError" }),
      )
      .mockResolvedValueOnce(reply([{ text: "OK" }], undefined, "OK"));
    const provider = new GeminiProvider("a", "k", ["b"]);
    expect(await provider.complete("s", "p", Date.now() + 60_000)).toBe("OK");
    expect(generateContent.mock.calls[0]![0].config.httpOptions.timeout).toBeLessThanOrEqual(
      25_000,
    );
    expect(provider.model).toBe("b");
  });

  it("retries the same model (never switches) when it is busy mid-conversation", async () => {
    const call = { id: "c1", name: "t", args: {} };
    generateContent
      .mockResolvedValueOnce(reply([{ functionCall: call }], [call]))
      .mockRejectedValueOnce(busy())
      .mockResolvedValueOnce(reply([{ text: "{}" }], undefined, "{}"));
    const out = await new GeminiProvider("a", "k", ["b"]).runLoop({
      system: "",
      prompt: "",
      tools: [{ name: "t", description: "", inputSchema: {} }],
      execute: async () => ({ text: "r" }),
      maxToolCalls: 5,
      deadline: Date.now() + 60_000,
    });
    expect(out.text).toBe("{}");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["a", "a", "a"]);
  }, 10_000);

  it("does not retry a spent quota mid-conversation, and starts the next run on the next model", async () => {
    const call = { id: "c1", name: "t", args: {} };
    const quota = Object.assign(new Error("You exceeded your current quota"), { status: 429 });
    generateContent
      .mockResolvedValueOnce(reply([{ functionCall: call }], [call]))
      .mockRejectedValueOnce(quota)
      .mockResolvedValueOnce(reply([{ text: "OK" }], undefined, "OK"));
    const provider = new GeminiProvider("a", "k", ["b"]);
    const loop = provider.runLoop({
      system: "",
      prompt: "",
      tools: [{ name: "t", description: "", inputSchema: {} }],
      execute: async () => ({ text: "r" }),
      maxToolCalls: 5,
      deadline: Date.now() + 60_000,
    });
    const error = await loop.then(
      () => null,
      (e: unknown) => e,
    );
    expect(String(error)).toMatch(/quota/);
    expect(provider.model).toBe("b");
    expect(await provider.complete("s", "p", Date.now() + 10_000)).toBe("OK");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["a", "a", "b"]);
  });

  it("does not retry non-busy errors", async () => {
    generateContent.mockReset();
    generateContent.mockRejectedValueOnce(
      Object.assign(new Error("API key not valid"), { status: 400 }),
    );
    await expect(
      new GeminiProvider("a", "k", ["b"]).complete("s", "p", Date.now() + 10_000),
    ).rejects.toThrow(/key/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});

describe("createLlmProvider", () => {
  it("picks the provider from whichever key is present", () => {
    expect(createLlmProvider({ GEMINI_API_KEY: "g" })?.id).toBe("gemini");
    expect(createLlmProvider({ GEMINI_API_KEY: "g" })?.model).toBe("gemini-3.6-flash");
    expect(createLlmProvider({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })?.id).toBe(
      "anthropic",
    );
    expect(
      createLlmProvider({ LLM_PROVIDER: "gemini", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" })
        ?.id,
    ).toBe("gemini");
    expect(createLlmProvider({})).toBeNull();
  });

  it("reads extra fallback models from GEMINI_FALLBACK_MODELS", async () => {
    const busy = Object.assign(new Error("busy"), { status: 503 });
    generateContent
      .mockRejectedValueOnce(busy)
      .mockResolvedValueOnce(reply([{ text: "OK" }], undefined, "OK"));
    const llm = createLlmProvider({ GEMINI_API_KEY: "g", GEMINI_FALLBACK_MODELS: " x , y " });
    expect(await llm?.complete("s", "p", Date.now() + 10_000)).toBe("OK");
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual(["gemini-3.6-flash", "x"]);
  });

  it("ignores an LLM_MODEL that belongs to the other provider", () => {
    expect(createLlmProvider({ GEMINI_API_KEY: "g", LLM_MODEL: "claude-sonnet-5-5" })?.model).toBe(
      "gemini-3.6-flash",
    );
    expect(createLlmProvider({ GEMINI_API_KEY: "g", LLM_MODEL: "gemini-3.8-flash" })?.model).toBe(
      "gemini-3.8-flash",
    );
  });
});
