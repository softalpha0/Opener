import type { Evidence, Stop, TourPlan } from "./schema";

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

/** What each harness tool asks Qloo, in plain words (shown in "Under the hood"). */
export const TOOL_ASKS: Record<string, string> = {
  qloo_describe: "Looks the name up in Qloo's entity catalogue and returns the matching artist.",
  qloo_where_popular:
    "Asks Qloo's Insights heatmap where this artist's audience over-indexes inside one country.",
  qloo_recommend:
    "Asks Qloo's Insights API for entities (artists, brands, shows…) that the same audience likes, optionally near one city.",
  qloo_rank: "Asks Qloo to score a fixed list of options against the artist's audience.",
  qloo_compare_audiences:
    "Asks Qloo's Insights compare workflow what two artists' audiences share.",
  qloo_entity_tags:
    "Asks Qloo's Insights API for the tags (genres, moods) that describe the artist.",
  qloo_audience_demographics:
    "Asks Qloo's Insights API how the audience skews by age and gender, relative to the baseline.",
  qloo_trends: "Asks Qloo for the artist's weekly popularity percentile over the past year.",
  qloo_find_tags: "Searches Qloo's tag ontology for a concept.",
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

/** English possessive: "Phoebe Bridgers" → "Phoebe Bridgers'", "Khruangbin" → "Khruangbin's". */
export function possessive(name: string): string {
  return /s$/i.test(name.trim()) ? `${name}’` : `${name}’s`;
}

/** "Why this city": the Qloo signals behind a stop, in plain words. */
export function whyThisCity(stop: Stop, index: Map<string, Evidence>): string[] {
  const lines: string[] = [];
  const area = stop.area ?? stop.country;
  const of = stop.areaCities ? ` of ${stop.areaCities} cities` : "";
  lines.push(`Ranked #${stop.demandRank}${of} in Qloo's audience heatmap for ${area}.`);
  if (stop.affinityScore !== undefined && stop.areaCities !== undefined && stop.areaCities < 3) {
    lines.push(
      `Only ${stop.areaCities} cit${stop.areaCities === 1 ? "y" : "ies"} came out of Qloo's heatmap for ${area}, so the affinity score (${stop.affinityScore.toFixed(2)}) only compares ${stop.areaCities === 1 ? "that one" : "those"}.`,
    );
  } else if (stop.affinityScore !== undefined) {
    lines.push(
      `Strongest heat cell near ${stop.city} scored ${stop.affinityScore.toFixed(2)} for audience affinity (Qloo scores 0 to 1, relative within ${area}).`,
    );
  }
  if (stop.heatCells && stop.heatCells > 1) {
    lines.push(`${stop.heatCells} of Qloo's top heat cells fall in and around the city.`);
  }
  const local = stop.openers.length
    ? stop.openers
        .flatMap((o) => o.evidenceIds)
        .map((id) => index.get(id))
        .find(
          (e) =>
            e?.tool === "qloo_recommend" && typeof e.inputRedacted.signal_location === "string",
        )
    : undefined;
  if (stop.openers.length) {
    lines.push(
      `${stop.openers.length} opener${stop.openers.length === 1 ? "" : "s"} picked from artists Qloo recommends to the same audience${local ? ` near ${String(local.inputRedacted.signal_location)}` : ""}.`,
    );
  }
  return lines;
}
