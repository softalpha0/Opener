import type { CallOutcome } from "../qloo/client";
import { errorEnvelope } from "../qloo/envelope";
import { redact } from "../qloo/redact";
import { toToolArgs, type ToolArgMap, type WorkflowTool } from "../qloo/tools";
import type { QlooEnvelope, ToolArgs } from "../qloo/types";
import type { Evidence, PlanEvent } from "../plan/schema";
import { keyFields } from "./digest";

/** Anything that can make a cached Qloo call (QlooService in production, a fake in tests). */
export interface QlooCaller {
  call(name: string, args: ToolArgs): Promise<CallOutcome>;
}

export interface ToolCall {
  id: string;
  tool: WorkflowTool;
  args: ToolArgs;
  envelope: QlooEnvelope;
}

export interface ToolboxOptions {
  maxCalls: number;
  deadline: number;
  now?: () => number;
}

/**
 * Runs Qloo tools for one plan: assigns evidence IDs, records a redacted evidence entry
 * for every call, streams start/end events, and enforces the per-run call and time budget.
 */
export class Toolbox {
  readonly evidence: Evidence[] = [];
  readonly calls: ToolCall[] = [];
  private seq = 0;
  private deadline: number;
  private readonly now: () => number;

  constructor(
    private readonly qloo: QlooCaller,
    private readonly emit: (event: PlanEvent) => void,
    private readonly options: ToolboxOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.deadline = options.deadline;
  }

  /** Guarantee at least `ms` more time (used so the fallback planner is never starved). */
  ensureTime(ms: number): void {
    this.deadline = Math.max(this.deadline, this.now() + ms);
  }

  get used(): number {
    return this.seq;
  }

  remainingCalls(): number {
    return Math.max(0, this.options.maxCalls - this.seq);
  }

  timeLeftMs(): number {
    return this.deadline - this.now();
  }

  canCall(n = 1): boolean {
    return this.remainingCalls() >= n && this.timeLeftMs() > 2_000;
  }

  async call<T extends WorkflowTool>(
    tool: T,
    args: ToolArgMap[T],
    purpose: string,
  ): Promise<ToolCall> {
    return this.callRaw(tool, toToolArgs(tool, args), purpose);
  }

  /** Call with arguments that came from the model (already schema-checked by the server). */
  async callRaw(tool: WorkflowTool, args: ToolArgs, purpose: string): Promise<ToolCall> {
    if (!this.canCall()) {
      return {
        id: "",
        tool,
        args,
        envelope: errorEnvelope(
          "BUDGET",
          "The run reached its Qloo call or time budget.",
          false,
          "The plan uses the results gathered so far.",
        ),
      };
    }
    const id = `ev${++this.seq}`;
    const inputRedacted = redact(args) as Record<string, unknown>;
    this.emit({ type: "tool", phase: "start", evidence: { id, tool, purpose, inputRedacted } });
    const started = this.now();
    const outcome = await this.qloo.call(tool, args);
    const { envelope } = outcome;
    const entry: Evidence = {
      id,
      tool,
      purpose,
      inputRedacted,
      status: envelope.status,
      summary: envelope.summary,
      resultCount: envelope.result_count,
      fetchedAt: outcome.fetchedAt,
      cached: outcome.cached,
      durationMs: Math.max(0, this.now() - started),
      keyFields: redact(keyFields(tool, envelope, args)),
      warnings: envelope.warnings.slice(0, 5),
      ...(envelope.error ? { errorCode: envelope.error.code } : {}),
    };
    this.evidence.push(entry);
    const call: ToolCall = { id, tool, args, envelope };
    this.calls.push(call);
    this.emit({ type: "tool", phase: "end", evidence: entry });
    return call;
  }

  byTool(tool: WorkflowTool): ToolCall[] {
    return this.calls.filter((c) => c.tool === tool);
  }

  get(id: string): ToolCall | undefined {
    return this.calls.find((c) => c.id === id);
  }
}
