import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  ThinkingLevel,
  type Content,
  type FunctionDeclaration,
  type Part,
} from "@google/genai";
import { log } from "../log";
import type { LlmProvider, LoopParams, LoopResult } from "./llm";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
/** Tried in order when the current model is overloaded (503) or rate limited (429). All have a free tier. */
export const DEFAULT_GEMINI_FALLBACKS = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];
const MAX_TURNS = 12;
const WRAP_UP_MS = 15_000;
/** One slow response must not eat the whole run's time budget. */
const TURN_TIMEOUT_MS = 60_000;
/** An overloaded free-tier model often hangs instead of returning 503; move on quickly on the first turn. */
const FIRST_TURN_TIMEOUT_MS = 25_000;
/** Waits before retrying the same model when it is busy mid-conversation. */
const BUSY_RETRY_DELAYS_MS = [3_000, 6_000];

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

const userText = (text: string): Content => ({ role: "user", parts: [{ text }] });

/** Quota or rate limit (429 / RESOURCE_EXHAUSTED): retrying the same model soon won't help. */
export function isQuotaError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /RESOURCE_EXHAUSTED|exceeded your current quota|"code":\s*429/i.test(message);
}

/** Overload, rate-limit and transient server errors are worth trying on another model. */
export function isBusyError(error: unknown): boolean {
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number" && [429, 500, 503, 504].includes(status)) return true;
  const message = error instanceof Error ? error.message : String(error);
  const name = (error as { name?: unknown })?.name;
  if (name === "AbortError" || name === "TimeoutError") return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|aborted|timed? ?out|"code":\s*(429|503)/i.test(
    message,
  );
}

/**
 * Gemini via `models.generateContent` with function calling. The model's content
 * (including thought signatures) is sent back unchanged each turn.
 */
export class GeminiProvider implements LlmProvider {
  readonly id = "gemini";
  private readonly client: GoogleGenAI;
  private readonly models: string[];
  private active = 0;

  constructor(model: string, apiKey: string, fallbacks: string[] = DEFAULT_GEMINI_FALLBACKS) {
    this.client = new GoogleGenAI({ apiKey });
    this.models = [model, ...fallbacks.filter((m) => m && m !== model)];
  }

  /** The model currently in use (changes if a fallback took over). */
  get model(): string {
    return this.models[this.active] ?? this.models[0] ?? DEFAULT_GEMINI_MODEL;
  }

  /**
   * Call the current model; on a busy error, move to the next model. Switching is only
   * allowed before the model has produced any turn, because thought signatures in the
   * history belong to the model that wrote them.
   */
  private async withFallback<T>(
    canSwitch: boolean,
    deadline: number,
    call: (model: string) => Promise<T>,
  ): Promise<T> {
    let retries = 0;
    for (;;) {
      try {
        return await call(this.model);
      } catch (error) {
        if (!isBusyError(error)) throw error;
        const hasNext = this.active < this.models.length - 1;
        if (isQuotaError(error) && !canSwitch) {
          // Waiting won't restore a spent quota. Fail this run (the deterministic planner takes
          // over) and start the next run on the next model, which has its own quota.
          if (hasNext) {
            log(
              "warn",
              `Gemini model ${this.model} is out of quota; next run uses ${this.models[this.active + 1]}`,
            );
            this.active++;
          }
          throw error;
        }
        if (canSwitch && hasNext) {
          log("warn", `Gemini model ${this.model} is busy; trying ${this.models[this.active + 1]}`);
          this.active++;
          continue;
        }
        // Mid-conversation the history is tied to this model, so wait and retry it instead.
        if (
          !canSwitch &&
          retries < BUSY_RETRY_DELAYS_MS.length &&
          Date.now() + (BUSY_RETRY_DELAYS_MS[retries] ?? 0) < deadline
        ) {
          const delay = BUSY_RETRY_DELAYS_MS[retries++] ?? 0;
          log("warn", `Gemini model ${this.model} is busy; retrying in ${delay / 1000}s`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  }

  private async turn(
    system: string,
    contents: Content[],
    declarations: FunctionDeclaration[] | undefined,
    noTools: boolean,
    deadline: number,
  ) {
    const canSwitch = !contents.some((c) => c.role === "model");
    const limit = canSwitch ? FIRST_TURN_TIMEOUT_MS : TURN_TIMEOUT_MS;
    const timeout = Math.max(5_000, Math.min(limit, deadline - Date.now()));
    const response = await this.withFallback(canSwitch, deadline, (model) =>
      this.client.models.generateContent({
        model,
        contents: [...contents],
        config: {
          systemInstruction: system,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          httpOptions: { timeout },
          ...(declarations
            ? {
                tools: [{ functionDeclarations: declarations }],
                toolConfig: {
                  functionCallingConfig: {
                    mode: noTools ? FunctionCallingConfigMode.NONE : FunctionCallingConfigMode.AUTO,
                  },
                },
              }
            : {}),
        },
      }),
    );
    const content = response.candidates?.[0]?.content;
    if (!content) {
      throw new Error(
        `Gemini returned no content (${response.promptFeedback?.blockReason ?? "no candidates"})`,
      );
    }
    // Read text parts directly: the SDK's `response.text` logs a warning when tool calls are present.
    const text = (content.parts ?? [])
      .filter((part) => typeof part.text === "string" && !part.thought)
      .map((part) => part.text)
      .join("");
    return { content, calls: response.functionCalls ?? [], text };
  }

  async runLoop(p: LoopParams): Promise<LoopResult> {
    const declarations: FunctionDeclaration[] = p.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parametersJsonSchema: cleanSchema(t.inputSchema),
    }));
    const contents: Content[] = [userText(p.prompt)];
    let toolCalls = 0;
    let wrapUp = false;

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
      const { content, calls, text } = await this.turn(
        p.system,
        contents,
        declarations,
        wrapUp,
        p.deadline + WRAP_UP_MS,
      );
      contents.push(content);
      if (!calls.length) return { text, toolCalls, turns: turn, stopReason: "stop" };

      const parts: Part[] = await Promise.all(
        calls.map(async (call): Promise<Part> => {
          const name = call.name ?? "";
          const respond = (output: string, isError = false): Part => ({
            functionResponse: {
              ...(call.id ? { id: call.id } : {}),
              name,
              response: isError ? { error: output } : { output },
            },
          });
          if (toolCalls >= p.maxToolCalls || Date.now() > p.deadline) {
            return respond("Tool budget reached. Do not call more tools.", true);
          }
          toolCalls++;
          try {
            const out = await p.execute(name, call.args ?? {});
            return respond(out.text, out.isError);
          } catch (error) {
            log("warn", "agent tool execution failed", {
              tool: name,
              error: error instanceof Error ? error.message : String(error),
            });
            return respond("The tool failed to run.", true);
          }
        }),
      );
      wrapUp =
        toolCalls >= p.maxToolCalls ||
        Date.now() > p.deadline - WRAP_UP_MS ||
        turn >= MAX_TURNS - 1;
      if (wrapUp)
        parts.push({
          text: "Budget reached. Do not call more tools. Write the final JSON object now.",
        });
      contents.push({ role: "user", parts });
    }
    return { text: "", toolCalls, turns: MAX_TURNS, stopReason: "max_turns" };
  }

  async complete(system: string, prompt: string, deadline: number): Promise<string> {
    return (await this.turn(system, [userText(prompt)], undefined, false, deadline)).text;
  }
}
