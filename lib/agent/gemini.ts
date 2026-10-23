import { GoogleGenAI, type GoogleGenAIInteraction } from "@google/genai";
import { log } from "../log";
import type { LlmProvider, LoopParams, LoopResult } from "./llm";

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const MAX_TURNS = 12;
const WRAP_UP_MS = 15_000;

type Step = GoogleGenAIInteraction["steps"][number];
type FunctionCall = Extract<Step, { type: "function_call" }>;

/** JSON Schema keywords Gemini's function declarations don't accept; everything else passes through. */
const UNSUPPORTED_KEYS = new Set(["$schema", "examples", "default"]);

function cleanSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanSchema);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !UNSUPPORTED_KEYS.has(key))
        .map(([key, v]) => [key, cleanSchema(v)]),
    );
  }
  return value;
}

function userText(text: string): Step {
  return { type: "user_input", content: [{ type: "text", text }] };
}

/**
 * Gemini via Google's Interactions API, stateless (`store: false`): the full step history,
 * including thought steps, is sent back each turn.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    readonly model: string,
    apiKey: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async turn(
    system: string,
    input: Step[],
    tools: LoopParams["tools"] | undefined,
    noTools: boolean,
    deadline: number,
  ) {
    const interaction = await this.client.interactions.create(
      {
        model: this.model,
        system_instruction: system,
        input: [...input],
        store: false,
        ...(tools
          ? {
              tools: tools.map((t) => ({
                type: "function" as const,
                name: t.name,
                description: t.description,
                parameters: cleanSchema(t.inputSchema),
              })),
            }
          : {}),
        generation_config: {
          thinking_level: "low",
          ...(tools && noTools ? { tool_choice: "none" as const } : {}),
        },
      },
      { timeout_ms: Math.max(5_000, deadline - Date.now()) },
    );
    if (interaction.status === "failed" || interaction.status === "cancelled") {
      throw new Error(`Gemini interaction ${interaction.status}`);
    }
    return interaction;
  }

  async runLoop(p: LoopParams): Promise<LoopResult> {
    const history: Step[] = [userText(p.prompt)];
    let toolCalls = 0;
    let wrapUp = false;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const interaction = await this.turn(
        p.system,
        history,
        p.tools,
        wrapUp,
        p.deadline + WRAP_UP_MS,
      );
      const steps = interaction.steps ?? [];
      history.push(...steps);
      const calls = steps.filter((s): s is FunctionCall => s.type === "function_call");
      if (!calls.length) {
        return {
          text: interaction.output_text ?? "",
          toolCalls,
          turns: turn,
          stopReason: interaction.status,
        };
      }

      const results: Step[] = await Promise.all(
        calls.map(async (call): Promise<Step> => {
          if (toolCalls >= p.maxToolCalls || Date.now() > p.deadline) {
            return {
              type: "function_result",
              call_id: call.id,
              name: call.name,
              is_error: true,
              result: "Tool budget reached. Do not call more tools.",
            };
          }
          toolCalls++;
          try {
            const out = await p.execute(call.name, call.arguments);
            return {
              type: "function_result",
              call_id: call.id,
              name: call.name,
              result: out.text,
              ...(out.isError ? { is_error: true } : {}),
            };
          } catch (error) {
            log("warn", "agent tool execution failed", {
              tool: call.name,
              error: error instanceof Error ? error.message : String(error),
            });
            return {
              type: "function_result",
              call_id: call.id,
              name: call.name,
              is_error: true,
              result: "The tool failed to run.",
            };
          }
        }),
      );
      history.push(...results);
      wrapUp =
        toolCalls >= p.maxToolCalls ||
        Date.now() > p.deadline - WRAP_UP_MS ||
        turn >= MAX_TURNS - 1;
      if (wrapUp)
        history.push(
          userText("Budget reached. Do not call more tools. Write the final JSON object now."),
        );
    }
    return { text: "", toolCalls, turns: MAX_TURNS, stopReason: "max_turns" };
  }

  async complete(system: string, prompt: string, deadline: number): Promise<string> {
    const interaction = await this.turn(system, [userText(prompt)], undefined, false, deadline);
    return interaction.output_text ?? "";
  }
}
