import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { log } from "../log";

export interface LlmToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LoopParams {
  system: string;
  prompt: string;
  tools: LlmToolSpec[];
  /** Runs one tool call and returns the text handed back to the model. */
  execute(name: string, input: unknown): Promise<{ text: string; isError?: boolean }>;
  maxToolCalls: number;
  deadline: number;
}

export interface LoopResult {
  text: string;
  toolCalls: number;
  turns: number;
  stopReason: string;
}

/** Small provider seam so another vendor (e.g. LLM_PROVIDER=openai) can be added later. */
export interface LlmProvider {
  id: string;
  model: string;
  runLoop(params: LoopParams): Promise<LoopResult>;
  complete(system: string, prompt: string, deadline: number): Promise<string>;
}

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TURNS = 12;
const WRAP_UP_MS = 15_000;

class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";
  private readonly client: Anthropic;
  private readonly fallbacks: boolean;

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1 });
    // Server-side refusal fallback ("default" routing) on models that support it.
    this.fallbacks =
      process.env.OPENER_LLM_FALLBACKS !== "off" &&
      /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
  }

  private request(params: {
    system: string;
    messages: BetaMessageParam[];
    tools?: BetaToolUnion[];
    toolChoiceNone?: boolean;
    deadline: number;
  }) {
    const timeout = Math.max(5_000, params.deadline - Date.now());
    return this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: 8000,
        system: params.system,
        messages: params.messages,
        ...(params.tools ? { tools: params.tools } : {}),
        ...(params.tools && params.toolChoiceNone
          ? { tool_choice: { type: "none" as const } }
          : {}),
        output_config: { effort: "low" },
        ...(this.fallbacks
          ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { timeout },
    );
  }

  async runLoop(p: LoopParams): Promise<LoopResult> {
    const tools: BetaToolUnion[] = p.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as BetaTool.InputSchema,
    }));
    const messages: BetaMessageParam[] = [{ role: "user", content: p.prompt }];
    let toolCalls = 0;
    let wrapUp = false;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const response = await this.request({
        system: p.system,
        messages,
        tools,
        toolChoiceNone: wrapUp,
        deadline: p.deadline + WRAP_UP_MS,
      });
      const text = response.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content as BetaContentBlockParam[] });
        continue;
      }
      if (response.stop_reason !== "tool_use") {
        return { text, toolCalls, turns: turn, stopReason: response.stop_reason ?? "unknown" };
      }

      messages.push({ role: "assistant", content: response.content as BetaContentBlockParam[] });
      const uses = response.content.filter(
        (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
      );
      const results: BetaToolResultBlockParam[] = await Promise.all(
        uses.map(async (use) => {
          if (toolCalls >= p.maxToolCalls || Date.now() > p.deadline) {
            return {
              type: "tool_result" as const,
              tool_use_id: use.id,
              is_error: true,
              content: "Tool budget reached. Do not call more tools.",
            };
          }
          toolCalls++;
          try {
            const out = await p.execute(use.name, use.input);
            return {
              type: "tool_result" as const,
              tool_use_id: use.id,
              content: out.text,
              ...(out.isError ? { is_error: true } : {}),
            };
          } catch (error) {
            log("warn", "agent tool execution failed", {
              tool: use.name,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              type: "tool_result" as const,
              tool_use_id: use.id,
              is_error: true,
              content: "The tool failed to run.",
            };
          }
        }),
      );
      wrapUp =
        toolCalls >= p.maxToolCalls ||
        Date.now() > p.deadline - WRAP_UP_MS ||
        turn >= MAX_TURNS - 1;
      const content: BetaContentBlockParam[] = [...results];
      if (wrapUp)
        content.push({
          type: "text",
          text: "Budget reached. Do not call more tools. Write the final JSON object now.",
        });
      messages.push({ role: "user", content });
    }
    return { text: "", toolCalls, turns: MAX_TURNS, stopReason: "max_turns" };
  }

  async complete(system: string, prompt: string, deadline: number): Promise<string> {
    const response = await this.request({
      system,
      messages: [{ role: "user", content: prompt }],
      deadline,
    });
    if (response.stop_reason === "refusal") throw new Error("The model declined this request.");
    return response.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}

/** Returns null when no LLM is configured; Opener then runs its deterministic planner. */
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider | null {
  const provider = (env.LLM_PROVIDER || "anthropic").toLowerCase();
  const model = env.LLM_MODEL || DEFAULT_MODEL;
  if (provider === "anthropic") {
    return env.ANTHROPIC_API_KEY ? new AnthropicProvider(model, env.ANTHROPIC_API_KEY) : null;
  }
  log("warn", `LLM_PROVIDER=${provider} is not implemented yet; using the deterministic planner`);
  return null;
}
