import { citiesFromHeat } from "../plan/cities";
import { hasResults } from "../qloo/envelope";
import {
  parseCompare,
  parseDemographics,
  parseEntities,
  parseHeatmap,
  parseResolutionIssues,
  parseTags,
  parseTrendSeries,
} from "../qloo/parse";
import type { QlooEnvelope } from "../qloo/types";

const round = (n: number | undefined, places = 3) =>
  n === undefined ? undefined : Math.round(n * 10 ** places) / 10 ** places;

/**
 * Compact, model- and human-readable view of a tool result. Used for the evidence panel's
 * key fields and as the tool_result text the agent reads. Never includes raw provenance.
 */
export function keyFields(tool: string, envelope: QlooEnvelope): unknown {
  if (envelope.status === "needs_input") {
    return {
      choices: parseResolutionIssues(envelope).map((issue) => ({
        input: issue.input,
        kind: issue.kind,
        candidates: issue.candidates
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name, description: c.description?.slice(0, 120) })),
      })),
    };
  }
  if (!hasResults(envelope)) return undefined;
  switch (tool) {
    case "qloo_describe":
    case "qloo_recommend":
    case "qloo_rank":
      return parseEntities(envelope.results)
        .slice(0, 12)
        .map((e) => ({
          id: e.id,
          name: e.name,
          affinity: round(e.affinity),
          popularity: round(e.popularity),
        }));
    case "qloo_where_popular": {
      const points = parseHeatmap(envelope.results);
      return {
        top_cells: points.slice(0, 5).map((p) => ({
          lat: round(p.lat, 3),
          lng: round(p.lng, 3),
          affinity: round(p.affinity),
          popularity: round(p.popularity),
        })),
        cities_derived_by_opener: citiesFromHeat(points)
          .slice(0, 12)
          .map((c) => ({
            city: c.city.n,
            region: c.city.a,
            country: c.city.c,
            max_affinity: round(c.affinity),
            cells: c.cells,
          })),
      };
    }
    case "qloo_audience_demographics":
      return parseDemographics(envelope.results);
    case "qloo_entity_tags":
    case "qloo_find_tags":
      return parseTags(envelope.results)
        .slice(0, 12)
        .map((t) => ({ id: t.id, name: t.name, affinity: round(t.affinity) }));
    case "qloo_trends":
      return parseTrendSeries(envelope.results).map((s) => ({
        name: s.name,
        points: s.points.slice(-12).map((p) => ({
          date: p.date,
          percentile: round(p.percentile, 2),
          delta: round(p.percentDelta, 3),
        })),
      }));
    case "qloo_compare_audiences":
      return parseCompare(envelope.results)
        .slice(0, 12)
        .map((c) => ({ name: c.name, type: c.type, score: round(c.score) }));
    default:
      return undefined;
  }
}

/** The tool_result text handed back to the model. */
export function digestForModel(evidenceId: string, tool: string, envelope: QlooEnvelope): string {
  return JSON.stringify({
    evidence_id: evidenceId,
    status: envelope.status,
    summary: envelope.summary,
    ...(envelope.warnings.length ? { warnings: envelope.warnings.slice(0, 3) } : {}),
    ...(envelope.error
      ? {
          error: {
            code: envelope.error.code,
            recovery: envelope.error.recovery,
            retryable: envelope.error.retryable,
          },
        }
      : {}),
    data: keyFields(tool, envelope) ?? null,
  });
}
