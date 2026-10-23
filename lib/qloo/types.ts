/** Statuses every Qloo workflow envelope can carry (see qloo_capabilities result_schema). */
export const QLOO_STATUSES = [
  "ok",
  "empty",
  "needs_input",
  "partial",
  "degraded",
  "error",
] as const;
export type QlooStatus = (typeof QLOO_STATUSES)[number];

export interface QlooError {
  code: string;
  layer?: string;
  retryable: boolean;
  recovery: string;
}

/** Normalized result envelope shared by every `qloo mcp` workflow tool. */
export interface QlooEnvelope {
  status: QlooStatus;
  summary: string;
  operation?: string;
  results: unknown;
  result_count: number;
  warnings: string[];
  interpretation?: unknown;
  resolution?: unknown;
  provenance?: unknown;
  execution?: { transport?: string; correlation_id?: string; duration_ms?: number };
  error?: QlooError;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ToolArgs = Record<string, JsonValue | undefined>;

/** Tool names exposed by `qloo mcp` (harness 0.1.26). */
export const QLOO_TOOL_NAMES = [
  "qloo_capabilities",
  "qloo_recommend",
  "qloo_rank",
  "qloo_describe",
  "qloo_where_popular",
  "qloo_compare_audiences",
  "qloo_entity_tags",
  "qloo_audience_demographics",
  "qloo_trends",
  "qloo_find_tags",
] as const;
export type QlooToolName = (typeof QLOO_TOOL_NAMES)[number];

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
