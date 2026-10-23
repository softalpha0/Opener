import type { ToolArgs } from "./types";

/** Entity types accepted by Insights-backed tools (recommend, rank, trends, compare). */
export type InsightsType =
  "artist" | "book" | "brand" | "movie" | "person" | "place" | "podcast" | "tv_show" | "videogame";

/** Entity types accepted by search-backed tools (describe, where_popular, tags, demographics). */
export type SearchType = InsightsType | "locality" | "actor" | "album" | "author" | "director";

// Argument shapes mirror docs/qloo-tool-schemas.json (harness 0.1.26). Keep them in sync.
export interface DescribeArgs {
  entity: string;
  type?: SearchType;
}
export interface WherePopularArgs {
  entity: string;
  entity_type?: SearchType;
  within: string;
  limit?: number;
}
export interface RecommendArgs {
  target_type: InsightsType;
  signals?: string[];
  signal_tags?: string[];
  signal_tags_operator?: "union" | "intersection";
  signal_location?: string;
  demographic?: string;
  filter_location?: string;
  include_tags?: string[];
  include_tags_operator?: "union" | "intersection";
  exclude_tags?: string[];
  exclude_tags_operator?: "union" | "intersection";
  explain?: boolean;
  limit?: number;
}
export interface RankArgs {
  options: string[];
  option_type: InsightsType;
  signals?: string[];
  signal_location?: string;
  demographic?: string;
  include_tags?: string[];
  exclude_tags?: string[];
}
export interface CompareAudiencesArgs {
  group_a: string[];
  group_b: string[];
  target_type?: InsightsType;
  limit?: number;
}
export interface EntityTagsArgs {
  entities: string[];
  entity_type?: SearchType;
  limit?: number;
}
export interface DemographicsArgs {
  entity: string;
  entity_type?: SearchType;
  limit?: number;
}
export interface TrendsArgs {
  entities: string[];
  entity_type: InsightsType;
  start_date: string;
  end_date: string;
  limit?: number;
}
export interface FindTagsArgs {
  query: string;
  semantic?: boolean;
  limit?: number;
}

export interface ToolArgMap {
  qloo_describe: DescribeArgs;
  qloo_where_popular: WherePopularArgs;
  qloo_recommend: RecommendArgs;
  qloo_rank: RankArgs;
  qloo_compare_audiences: CompareAudiencesArgs;
  qloo_entity_tags: EntityTagsArgs;
  qloo_audience_demographics: DemographicsArgs;
  qloo_trends: TrendsArgs;
  qloo_find_tags: FindTagsArgs;
}
export type WorkflowTool = keyof ToolArgMap;

export const WORKFLOW_TOOLS: WorkflowTool[] = [
  "qloo_describe",
  "qloo_where_popular",
  "qloo_recommend",
  "qloo_rank",
  "qloo_compare_audiences",
  "qloo_entity_tags",
  "qloo_audience_demographics",
  "qloo_trends",
  "qloo_find_tags",
];

export function isWorkflowTool(name: string): name is WorkflowTool {
  return (WORKFLOW_TOOLS as string[]).includes(name);
}

const clampLimit = (limit: number | undefined) =>
  limit === undefined ? undefined : Math.max(1, Math.min(20, Math.round(limit)));

/** Clamp and copy arguments into the plain shape sent over MCP. */
export function toToolArgs<T extends WorkflowTool>(tool: T, args: ToolArgMap[T]): ToolArgs {
  const copy: Record<string, unknown> = { ...args };
  if ("limit" in copy) copy.limit = clampLimit(copy.limit as number | undefined);
  for (const key of [
    "signals",
    "options",
    "entities",
    "group_a",
    "group_b",
    "include_tags",
    "exclude_tags",
    "signal_tags",
  ]) {
    const value = copy[key];
    if (Array.isArray(value)) copy[key] = value.slice(0, tool === "qloo_trends" ? 5 : 10);
  }
  return copy as ToolArgs;
}

/** ISO date (YYYY-MM-DD) `days` before `from`. */
export function isoDaysAgo(days: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
