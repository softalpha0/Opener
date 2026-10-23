import { asArray, asRecord } from "./envelope";
import type { QlooEnvelope } from "./types";

/** Entity as returned (compacted) by qloo_describe / qloo_recommend / qloo_rank. */
export interface QlooEntity {
  id: string;
  name: string;
  type?: string;
  subtype?: string;
  popularity?: number;
  affinity?: number;
  image?: string;
  description?: string;
  explainability?: unknown;
}

export interface Candidate {
  id: string;
  name: string;
  type?: string;
  popularity?: number;
  description?: string;
  releaseYear?: number;
}

export interface ResolutionIssue {
  input: string;
  kind: string;
  field?: string;
  candidates: Candidate[];
}

export interface HeatPoint {
  lat: number;
  lng: number;
  geohash?: string;
  affinity: number;
  affinityRank?: number;
  popularity?: number;
}

export interface Demographics {
  age: Array<{ bucket: string; value: number }>;
  gender: Array<{ bucket: string; value: number }>;
}

export interface TrendPoint {
  date: string;
  percentile?: number;
  rank?: number;
  rankVelocity?: number;
  percentDelta?: number;
}

export interface TrendSeries {
  entityId?: string;
  name?: string;
  points: TrendPoint[];
}

export interface QlooTag {
  id: string;
  name: string;
  type?: string;
  affinity?: number;
}

export interface CompareItem {
  id?: string;
  name: string;
  type?: string;
  score?: number;
}

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

function imageUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https:\/\//.test(value)) return value;
  const record = asRecord(value);
  const url = record?.url;
  return typeof url === "string" && /^https:\/\//.test(url) ? url : undefined;
}

export function parseEntity(value: unknown): QlooEntity | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = str(record.entity_id) ?? str(record.id);
  const name = str(record.name);
  if (!id || !name) return undefined;
  const properties = asRecord(record.properties) ?? {};
  const query = asRecord(record.query);
  const image = imageUrl(properties.image) ?? imageUrl(record.image);
  const description =
    str(properties.short_description) ?? str(properties.description) ?? str(record.description);
  const type = str(record.type);
  const subtype = str(record.subtype);
  const popularity = num(record.popularity);
  const affinity = num(record.affinity) ?? num(query?.affinity);
  return {
    id,
    name,
    ...(type ? { type } : {}),
    ...(subtype ? { subtype } : {}),
    ...(popularity !== undefined ? { popularity } : {}),
    ...(affinity !== undefined ? { affinity } : {}),
    ...(image ? { image } : {}),
    ...(description ? { description: description.slice(0, 280) } : {}),
    ...(record.explainability !== undefined ? { explainability: record.explainability } : {}),
  };
}

export function parseEntities(results: unknown): QlooEntity[] {
  return asArray(results)
    .map(parseEntity)
    .filter((e): e is QlooEntity => e !== undefined);
}

function parseCandidate(value: unknown): Candidate | undefined {
  const record = asRecord(value);
  const id = str(record?.id) ?? str(record?.entity_id);
  const name = str(record?.name);
  if (!record || !id || !name) return undefined;
  const type = str(record.type);
  const popularity = num(record.popularity);
  const description = str(record.description);
  const releaseYear = num(record.release_year);
  return {
    id,
    name,
    ...(type ? { type } : {}),
    ...(popularity !== undefined ? { popularity } : {}),
    ...(description ? { description } : {}),
    ...(releaseYear !== undefined ? { releaseYear } : {}),
  };
}

/** Candidates the harness returns with `needs_input` (resolution.issues[].candidates). */
export function parseResolutionIssues(envelope: QlooEnvelope): ResolutionIssue[] {
  return asArray(asRecord(envelope.resolution)?.issues).flatMap((value) => {
    const issue = asRecord(value);
    if (!issue) return [];
    const field = str(issue.field);
    return [
      {
        input: str(issue.input) ?? "",
        kind: str(issue.kind) ?? "ambiguous",
        ...(field ? { field } : {}),
        candidates: asArray(issue.candidates)
          .map(parseCandidate)
          .filter((c): c is Candidate => c !== undefined),
      },
    ];
  });
}

/** Other plausible matches the harness noted when it resolved a name. */
export function parseAlternatives(envelope: QlooEnvelope): Candidate[] {
  const outcomes = asArray(asRecord(envelope.resolution)?.outcomes);
  return outcomes.flatMap((value) =>
    asArray(asRecord(value)?.alternatives)
      .map(parseCandidate)
      .filter((c): c is Candidate => c !== undefined),
  );
}

/** How the harness matched the entity (identifier, exact, semantic). */
export function parseMatchKind(envelope: QlooEnvelope): string | undefined {
  const entity = asRecord(asRecord(envelope.interpretation)?.entity);
  return str(entity?.match);
}

export function parseHeatmap(results: unknown): HeatPoint[] {
  return asArray(results).flatMap((value) => {
    const record = asRecord(value);
    const location = asRecord(record?.location);
    const query = asRecord(record?.query);
    const lat = num(location?.latitude) ?? num(location?.lat);
    const lng = num(location?.longitude) ?? num(location?.lng) ?? num(location?.lon);
    const affinity = num(query?.affinity) ?? num(record?.affinity);
    if (lat === undefined || lng === undefined || affinity === undefined) return [];
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const geohash = str(location?.geohash);
    const affinityRank = num(query?.affinity_rank);
    const popularity = num(query?.popularity);
    return [
      {
        lat,
        lng,
        affinity,
        ...(geohash ? { geohash } : {}),
        ...(affinityRank !== undefined ? { affinityRank } : {}),
        ...(popularity !== undefined ? { popularity } : {}),
      },
    ];
  });
}

const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "24 and under",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

function buckets(
  value: unknown,
  labels: Record<string, string> = {},
): Array<{ bucket: string; value: number }> {
  const record = asRecord(value);
  if (!record) return [];
  return Object.entries(record).flatMap(([key, v]) => {
    const n = num(v);
    return n === undefined ? [] : [{ bucket: labels[key] ?? key.replace(/_/g, " "), value: n }];
  });
}

/** Demographic affinities are relative (positive = above average), not shares of fans. */
export function parseDemographics(results: unknown): Demographics | undefined {
  const first = asRecord(asArray(results)[0]);
  const query = asRecord(first?.query) ?? first;
  if (!query) return undefined;
  const age = buckets(query.age, AGE_LABELS);
  const gender = buckets(query.gender);
  return age.length || gender.length ? { age, gender } : undefined;
}

export function parseTrendSeries(results: unknown): TrendSeries[] {
  return asArray(results).flatMap((value) => {
    const record = asRecord(value);
    if (!record) return [];
    const entity = asRecord(record.entity);
    const points = asArray(record.points ?? record.trending).flatMap((p) => {
      const point = asRecord(p);
      const date = str(point?.date);
      if (!point || !date) return [];
      const percentile = num(point.population_percentile);
      const rank = num(point.population_rank);
      const rankVelocity = num(point.population_rank_velocity);
      const percentDelta = num(point.population_percent_delta);
      return [
        {
          date,
          ...(percentile !== undefined ? { percentile } : {}),
          ...(rank !== undefined ? { rank } : {}),
          ...(rankVelocity !== undefined ? { rankVelocity } : {}),
          ...(percentDelta !== undefined ? { percentDelta } : {}),
        },
      ];
    });
    const entityId = str(entity?.entityId) ?? str(entity?.entity_id);
    const name = str(entity?.name);
    return [
      {
        ...(entityId ? { entityId } : {}),
        ...(name ? { name } : {}),
        points: points.sort((a, b) => a.date.localeCompare(b.date)),
      },
    ];
  });
}

export function parseTags(results: unknown): QlooTag[] {
  return asArray(results).flatMap((value) => {
    const record = asRecord(value);
    const id = str(record?.id) ?? str(record?.tag_id);
    const name = str(record?.name);
    if (!record || !id || !name) return [];
    const type = str(record.type) ?? str(record.subtype);
    const affinity = num(record.affinity) ?? num(asRecord(record.query)?.affinity);
    return [
      { id, name, ...(type ? { type } : {}), ...(affinity !== undefined ? { affinity } : {}) },
    ];
  });
}

/**
 * qloo_compare_audiences passes the raw /v2/analysis/compare results through, whose shape
 * varies by target type. Collect any named items it contains, with a score when one exists.
 */
export function parseCompare(results: unknown): CompareItem[] {
  const pools: unknown[] = Array.isArray(results)
    ? results
    : Object.values(asRecord(results) ?? {}).flatMap((v) => (Array.isArray(v) ? v : []));
  return pools.flatMap((value) => {
    const record = asRecord(value);
    const name = str(record?.name);
    if (!record || !name) return [];
    const query = asRecord(record.query);
    const id = str(record.tag_id) ?? str(record.entity_id) ?? str(record.id);
    const type = str(record.subtype) ?? str(record.type);
    const score =
      num(query?.affinity) ?? num(record.affinity) ?? num(record.score) ?? num(query?.score);
    return [
      {
        name,
        ...(id ? { id } : {}),
        ...(type ? { type } : {}),
        ...(score !== undefined ? { score } : {}),
      },
    ];
  });
}
