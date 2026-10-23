import { hasResults } from "../qloo/envelope";
import { parseEntities, parseHeatmap } from "../qloo/parse";
import { isoDaysAgo, type InsightsType } from "../qloo/tools";
import { citiesFromHeat, type CityDemand } from "../plan/cities";
import type { ToolCall, Toolbox } from "./toolbox";

export interface ArtistRef {
  id: string;
  name: string;
}

const same = (a: unknown, b: string) =>
  typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
const mentions = (value: unknown, ...needles: string[]) =>
  (Array.isArray(value) ? value : [value]).some((v) => needles.some((n) => same(v, n)));

/** Crossover categories: Qloo target type → label shown in the UI. */
export const CROSSOVER: Array<{
  type: Exclude<InsightsType, "artist" | "person" | "place">;
  label: string;
  limit: number;
}> = [
  { type: "brand", label: "Brands", limit: 8 },
  { type: "tv_show", label: "TV", limit: 6 },
  { type: "movie", label: "Film", limit: 6 },
  { type: "podcast", label: "Podcasts", limit: 6 },
];

export function heatCalls(box: Toolbox, artist: ArtistRef): ToolCall[] {
  return box
    .byTool("qloo_where_popular")
    .filter((c) => mentions(c.args.entity, artist.id, artist.name) && hasResults(c.envelope));
}

/** Cities derived from every successful heatmap call, each tagged with its evidence ID. */
export function cityDemand(
  box: Toolbox,
  artist: ArtistRef,
): Array<CityDemand & { evidenceId: string }> {
  const merged = new Map<string, CityDemand & { evidenceId: string }>();
  for (const call of heatCalls(box, artist)) {
    for (const demand of citiesFromHeat(parseHeatmap(call.envelope.results))) {
      const key = `${demand.city.n}|${demand.city.cc}`;
      const current = merged.get(key);
      if (!current || demand.affinity > current.affinity)
        merged.set(key, { ...demand, evidenceId: call.id });
    }
  }
  return [...merged.values()].sort((a, b) => b.affinity - a.affinity || b.cells - a.cells);
}

export async function ensureHeat(box: Toolbox, artist: ArtistRef, within: string[]): Promise<void> {
  const queried = box
    .byTool("qloo_where_popular")
    .filter((c) => mentions(c.args.entity, artist.id, artist.name));
  const missing = within.filter((area) => !queried.some((c) => same(c.args.within, area)));
  await Promise.all(
    missing.map((area) =>
      box.call(
        "qloo_where_popular",
        { entity: artist.id, entity_type: "artist", within: area, limit: 20 },
        `Map where ${artist.name}'s audience affinity is strongest in ${area}`,
      ),
    ),
  );
}

export function cityLabel(demand: CityDemand): string {
  return `${demand.city.n}, ${demand.city.c}`;
}

/** Artist recommendations for the headliner's audience: one broad call plus location-scoped calls. */
export async function ensureOpeners(
  box: Toolbox,
  artist: ArtistRef,
  cities: CityDemand[],
): Promise<void> {
  const recs = box
    .byTool("qloo_recommend")
    .filter(
      (c) => same(c.args.target_type, "artist") && mentions(c.args.signals, artist.id, artist.name),
    );
  const jobs: Array<Promise<unknown>> = [];
  if (!recs.some((c) => c.args.signal_location === undefined)) {
    jobs.push(
      box.call(
        "qloo_recommend",
        { target_type: "artist", signals: [artist.id], limit: 15 },
        `Artists with strong affinity among ${artist.name}'s audience (opener pool)`,
      ),
    );
  }
  for (const demand of cities.slice(0, 3)) {
    const label = cityLabel(demand);
    if (recs.some((c) => same(c.args.signal_location, label))) continue;
    if (!box.canCall(jobs.length + 1)) break;
    jobs.push(
      box.call(
        "qloo_recommend",
        { target_type: "artist", signals: [artist.id], signal_location: label, limit: 8 },
        `Opener candidates for ${artist.name}'s audience with a ${demand.city.n} location signal`,
      ),
    );
  }
  await Promise.all(jobs);
}

export async function ensureAudience(box: Toolbox, artist: ArtistRef, today: Date): Promise<void> {
  const jobs: Array<Promise<unknown>> = [];
  if (!box.byTool("qloo_audience_demographics").length) {
    jobs.push(
      box.call(
        "qloo_audience_demographics",
        { entity: artist.id, entity_type: "artist" },
        `Age and gender affinity of ${artist.name}'s audience`,
      ),
    );
  }
  if (!box.byTool("qloo_entity_tags").length && box.canCall(jobs.length + 1)) {
    jobs.push(
      box.call(
        "qloo_entity_tags",
        { entities: [artist.id], entity_type: "artist", limit: 10 },
        `Tags that characterise ${artist.name}`,
      ),
    );
  }
  if (!box.byTool("qloo_trends").length && box.canCall(jobs.length + 1)) {
    jobs.push(
      box.call(
        "qloo_trends",
        {
          entities: [artist.id],
          entity_type: "artist",
          start_date: isoDaysAgo(365, today),
          end_date: isoDaysAgo(1, today),
          limit: 20,
        },
        `Popularity trend for ${artist.name} over the last year`,
      ),
    );
  }
  await Promise.all(jobs);
}

export async function ensureCrossover(
  box: Toolbox,
  artist: ArtistRef,
  topCity: CityDemand | undefined,
): Promise<void> {
  const recs = box.byTool("qloo_recommend");
  const jobs: Array<Promise<unknown>> = [];
  for (const category of CROSSOVER) {
    if (recs.some((c) => same(c.args.target_type, category.type))) continue;
    if (!box.canCall(jobs.length + 1)) break;
    jobs.push(
      box.call(
        "qloo_recommend",
        { target_type: category.type, signals: [artist.id], limit: category.limit },
        `${category.label} with strong affinity among ${artist.name}'s audience`,
      ),
    );
  }
  if (
    topCity &&
    !recs.some((c) => same(c.args.target_type, "place")) &&
    box.canCall(jobs.length + 1)
  ) {
    jobs.push(
      box.call(
        "qloo_recommend",
        {
          target_type: "place",
          signals: [artist.id],
          filter_location: cityLabel(topCity),
          limit: 6,
        },
        `Places in ${topCity.city.n} with strong affinity among ${artist.name}'s audience`,
      ),
    );
  }
  await Promise.all(jobs);
}

/** Opener candidates from recommend/rank results, keyed by entity ID, with the calls that support them. */
export function openerPool(box: Toolbox, artist: ArtistRef) {
  const pool = new Map<
    string,
    {
      id: string;
      name: string;
      image?: string;
      affinity?: number;
      evidenceIds: string[];
      locations: string[];
    }
  >();
  const calls = [
    ...box.byTool("qloo_recommend").filter((c) => same(c.args.target_type, "artist")),
    ...box.byTool("qloo_rank").filter((c) => same(c.args.option_type, "artist")),
  ];
  for (const call of calls) {
    if (!hasResults(call.envelope)) continue;
    const location =
      typeof call.args.signal_location === "string" ? call.args.signal_location : undefined;
    for (const entity of parseEntities(call.envelope.results)) {
      if (entity.id === artist.id || same(entity.name, artist.name)) continue;
      const current = pool.get(entity.id) ?? {
        id: entity.id,
        name: entity.name,
        ...(entity.image ? { image: entity.image } : {}),
        evidenceIds: [],
        locations: [],
      };
      if (!current.evidenceIds.includes(call.id)) current.evidenceIds.push(call.id);
      if (location && !current.locations.includes(location)) current.locations.push(location);
      if (entity.affinity !== undefined && !location) current.affinity = entity.affinity;
      pool.set(entity.id, current);
    }
  }
  return pool;
}

export async function ensureCompare(
  box: Toolbox,
  artist: ArtistRef,
  opener: { id: string; name: string } | undefined,
): Promise<void> {
  if (!opener || box.byTool("qloo_compare_audiences").length || !box.canCall()) return;
  await box.call(
    "qloo_compare_audiences",
    { group_a: [artist.id], group_b: [opener.id], limit: 10 },
    `Compare ${artist.name}'s audience with ${opener.name}'s`,
  );
}
