import type { Evidence, TourPlan } from "./schema";

export const TOOL_LABELS: Record<string, string> = {
  qloo_describe: "Resolve artist",
  qloo_where_popular: "Where popular",
  qloo_recommend: "Recommend",
  qloo_rank: "Rank",
  qloo_compare_audiences: "Compare audiences",
  qloo_entity_tags: "Entity tags",
  qloo_audience_demographics: "Demographics",
  qloo_trends: "Trends",
  qloo_find_tags: "Find tags",
};

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? tool.replace(/^qloo_/, "").replace(/_/g, " ");
}

export function formatAffinity(value: number | undefined): string {
  return value === undefined ? "–" : value.toFixed(2);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) +
        " UTC";
}

export function evidenceIndex(plan: TourPlan): Map<string, Evidence> {
  return new Map(plan.evidence.map((e) => [e.id, e]));
}

/** Friendly copy for error codes that reach the UI. */
export function errorCopy(
  code: string,
  message: string,
  recovery: string,
): { title: string; body: string } {
  switch (code) {
    case "QLOO_AUTH":
    case "QLOO_NOT_INSTALLED":
      return {
        title: "Opener's Qloo connection is unavailable",
        body: "The live taste data service isn't configured on this server right now. A saved plan is below if one is available.",
      };
    case "QLOO_RATE_LIMIT":
    case "RATE_LIMIT":
    case "rate_limited":
      return {
        title: "Qloo is rate limiting us",
        body:
          message || "Too many requests right now. Try again in a minute, or open a saved plan.",
      };
    case "TIMEOUT":
    case "TRANSPORT":
      return { title: "Qloo is slow to answer", body: recovery || "Try again in a moment." };
    default:
      return {
        title: "The plan didn't finish",
        body: [message, recovery].filter(Boolean).join(" "),
      };
  }
}
