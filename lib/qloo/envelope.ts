import { QLOO_STATUSES, type QlooEnvelope, type QlooError, type QlooStatus } from "./types";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : undefined;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isStatus(value: unknown): value is QlooStatus {
  return typeof value === "string" && (QLOO_STATUSES as readonly string[]).includes(value);
}

function toError(value: unknown, fallbackSummary: string): QlooError {
  const record = asRecord(value) ?? {};
  return {
    code: typeof record.code === "string" ? record.code : "UNKNOWN",
    ...(typeof record.layer === "string" ? { layer: record.layer } : {}),
    retryable: record.retryable === true,
    recovery:
      typeof record.recovery === "string" && record.recovery
        ? record.recovery
        : fallbackSummary || "Try again later.",
  };
}

/** Build an `error` envelope for failures that happen outside Qloo (transport, timeouts). */
export function errorEnvelope(
  code: string,
  summary: string,
  retryable: boolean,
  recovery?: string,
): QlooEnvelope {
  return {
    status: "error",
    summary,
    results: [],
    result_count: 0,
    warnings: [],
    error: { code, retryable, recovery: recovery ?? summary },
  };
}

/**
 * Turn an MCP `callTool` result into a well-formed envelope.
 * Mirrors the hackathon kit: prefer `structuredContent`, fall back to a JSON text block,
 * and treat a missing status as an error rather than guessing.
 */
export function normalizeEnvelope(callResult: unknown): QlooEnvelope {
  const result = asRecord(callResult) ?? {};
  let raw = asRecord(result.structuredContent);
  if (!raw) {
    const text = asArray(result.content)
      .map(asRecord)
      .find((block) => block?.type === "text" && typeof block.text === "string")?.text;
    if (typeof text === "string") {
      try {
        raw = asRecord(JSON.parse(text));
      } catch {
        return errorEnvelope(
          "INVALID_RESULT",
          text.slice(0, 300),
          false,
          "The Qloo tool returned an unreadable result.",
        );
      }
    }
  }
  if (!raw) {
    return errorEnvelope("INVALID_RESULT", "The Qloo tool returned no result.", false);
  }

  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const warnings = asArray(raw.warnings).filter((w): w is string => typeof w === "string");

  if (!isStatus(raw.status) || result.isError === true) {
    return {
      ...errorEnvelope("UNKNOWN", summary || "The Qloo tool returned an error.", false),
      error: toError(raw.error, summary),
      warnings,
    };
  }

  // qloo_trends returns its data under `series`; expose it as `results` for uniform handling.
  const results =
    raw.results !== undefined ? raw.results : raw.series !== undefined ? raw.series : [];
  const count =
    typeof raw.result_count === "number"
      ? raw.result_count
      : Array.isArray(results)
        ? results.length
        : results && typeof results === "object"
          ? 1
          : 0;

  const execution = asRecord(raw.execution);
  return {
    status: raw.status,
    summary: summary || defaultSummary(raw.status, count),
    ...(typeof raw.operation === "string" ? { operation: raw.operation } : {}),
    results,
    result_count: count,
    warnings,
    ...(raw.interpretation !== undefined ? { interpretation: raw.interpretation } : {}),
    ...(raw.resolution !== undefined ? { resolution: raw.resolution } : {}),
    ...(raw.provenance !== undefined ? { provenance: raw.provenance } : {}),
    ...(execution
      ? {
          execution: {
            ...(typeof execution.transport === "string" ? { transport: execution.transport } : {}),
            ...(typeof execution.correlation_id === "string"
              ? { correlation_id: execution.correlation_id }
              : {}),
            ...(typeof execution.duration_ms === "number"
              ? { duration_ms: execution.duration_ms }
              : {}),
          },
        }
      : {}),
    ...(raw.status === "error" ? { error: toError(raw.error, summary) } : {}),
  };
}

function defaultSummary(status: QlooStatus, count: number): string {
  switch (status) {
    case "ok":
      return `${count} result${count === 1 ? "" : "s"}.`;
    case "empty":
      return "No matching Qloo results.";
    case "needs_input":
      return "Qloo needs a choice before it can continue.";
    case "partial":
      return "Some results came back.";
    case "degraded":
      return "Results came back with reduced quality.";
    case "error":
      return "The Qloo tool returned an error.";
  }
}

/** Statuses that carry renderable results. */
export function hasResults(envelope: QlooEnvelope): boolean {
  return (
    envelope.status === "ok" || envelope.status === "partial" || envelope.status === "degraded"
  );
}

/** Statuses worth caching: deterministic answers, never transient errors. */
export function isCacheable(envelope: QlooEnvelope): boolean {
  return envelope.status !== "error";
}
