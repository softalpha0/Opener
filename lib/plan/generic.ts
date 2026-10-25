import { CITIES, cityKey, countryCodeFor, distanceKm, findCity, type City } from "../geo/cities";
import { MERGE_KM, citiesFromHeat, compareDemand, type CityDemand } from "./cities";
import type { TourPlan } from "./schema";

/**
 * "Without Qloo vs with Qloo". The generic tour is what you get with no taste data: either a
 * plain LLM answering from its own knowledge (no tools, no Qloo results in the prompt) or,
 * when no LLM is configured, the biggest cities by population. The comparison then looks
 * each generic city up in the Qloo heatmap rankings that the plan already fetched.
 */

export interface GenericStop {
  city: string;
  country: string;
  why?: string;
}

export interface GenericTour {
  source: "llm" | "population";
  model?: string;
  generatedAt: string;
  stops: GenericStop[];
  /** Why the population baseline was used instead of the LLM, when it was. */
  note?: string;
}

/** One city's place in Qloo's heatmap ranking for the area it belongs to. */
export interface QlooCityRank {
  key: string;
  city: string;
  country: string;
  area: string;
  rank: number;
  of: number;
  affinity: number;
  cells: number;
  evidenceId: string;
}

export interface ComparisonRow {
  city: string;
  country: string;
  why?: string;
  /** Position in Opener's route, when Opener also picked this city. */
  openerOrder?: number;
  /** Qloo's in-area rank, when the city appears in the heatmap at all. */
  qloo?: QlooCityRank;
  /** Not in the countries Opener searched, so Qloo has no heatmap for it in this plan. */
  outsideSearch: boolean;
}

export interface TourComparison {
  generic: GenericTour;
  rows: ComparisonRow[];
  /** Opener stops the generic tour missed, with their Qloo rank. */
  openerOnly: Array<{ order: number; city: string; country: string; qloo?: QlooCityRank }>;
  overlap: number;
  /** Generic cities inside the searched countries with no cell in Qloo's top heatmap results. */
  noSignal: number;
  /** Generic cities that Qloo ranks in the top 3 of their area. */
  qlooTop3: number;
}

const MAX_GENERIC = 8;

/** Rank every city in the plan's heat data, per searched area (scores are relative per area). */
export function qlooRankings(plan: TourPlan): Map<string, QlooCityRank> {
  const areaById = new Map<string, string>();
  for (const e of plan.evidence) {
    const within = e.inputRedacted.within;
    if (e.tool === "qloo_where_popular" && typeof within === "string") areaById.set(e.id, within);
  }
  const groups = new Map<string, typeof plan.heat>();
  for (const point of plan.heat) {
    const list = groups.get(point.evidenceId) ?? [];
    list.push(point);
    groups.set(point.evidenceId, list);
  }
  const out = new Map<string, QlooCityRank>();
  for (const [evidenceId, points] of groups) {
    const area = areaById.get(evidenceId) ?? plan.query.within[0] ?? "";
    const ranked: CityDemand[] = citiesFromHeat(points, countryCodeFor(area)).sort(compareDemand);
    ranked.forEach((d, i) => {
      const key = cityKey(d.city);
      const current = out.get(key);
      if (current && current.affinity >= d.affinity) return;
      out.set(key, {
        key,
        city: d.city.n,
        country: d.city.c,
        area,
        rank: i + 1,
        of: ranked.length,
        affinity: d.affinity,
        cells: d.cells,
        evidenceId,
      });
    });
  }
  return out;
}

/** Biggest cities by population, taken round-robin across the searched countries. */
export function populationBaseline(within: string[], count: number): GenericStop[] {
  const perCountry = within.map((area) => {
    const cc = countryCodeFor(area);
    if (!cc) return [];
    // Skip boroughs and suburbs of a bigger city already listed (Brooklyn is New York City).
    const kept: City[] = [];
    for (const c of CITIES.filter((x) => x.cc === cc).sort((a, b) => b.pop - a.pop)) {
      if (!kept.some((k) => distanceKm(k.lat, k.lng, c.lat, c.lng) < MERGE_KM)) kept.push(c);
    }
    return kept;
  });
  const picked: City[] = [];
  for (let i = 0; picked.length < count && perCountry.some((list) => list.length > i); i++) {
    for (const list of perCountry) {
      const city = list[i];
      if (city && picked.length < count) picked.push(city);
    }
  }
  return picked.map((c) => ({
    city: c.n,
    country: c.c,
    why: `One of the largest cities in ${c.c} (population ${Math.round(c.pop / 1000).toLocaleString("en-US")}k).`,
  }));
}

export const GENERIC_SYSTEM =
  "You are a tour booker with no audience data, no tools and no web access. Answer from general knowledge only. Reply with JSON only.";

export function genericPrompt(
  artist: string,
  regionLabel: string,
  within: string[],
  count: number,
) {
  return [
    `Suggest ${count} cities for a headline tour by the artist "${artist}" in ${regionLabel}.`,
    `Only pick cities in these countries: ${within.join(", ")}.`,
    `Reply with a JSON array, best city first, like:`,
    `[{"city": "City", "country": "Country", "why": "one short sentence"}]`,
  ].join("\n");
}

/** Pull the JSON array out of a model reply (tolerates code fences and stray prose). */
export function parseGenericReply(text: string): GenericStop[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const stops: GenericStop[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { city, country, why } = item as Record<string, unknown>;
    if (typeof city !== "string" || typeof country !== "string") continue;
    const name = city.trim().slice(0, 80);
    const key = `${name}|${country}`.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    stops.push({
      city: name,
      country: country.trim().slice(0, 80),
      ...(typeof why === "string" && why.trim() ? { why: why.trim().slice(0, 200) } : {}),
    });
    if (stops.length >= MAX_GENERIC) break;
  }
  return stops;
}

/** Common names the bundled GeoNames table spells differently. */
const ALIASES: Record<string, string> = {
  "new york": "New York City",
  "washington, d.c.": "Washington",
  "washington dc": "Washington",
  "washington d.c.": "Washington",
  frankfurt: "Frankfurt am Main",
  nyc: "New York City",
  "ciudad de méxico": "Mexico City",
};

function lookup(stop: GenericStop): City | undefined {
  const name = ALIASES[stop.city.toLowerCase()] ?? stop.city;
  return findCity(name, stop.country) ?? findCity(name);
}

function lookupKey(stop: GenericStop): string | undefined {
  const city = lookup(stop);
  return city ? cityKey(city) : undefined;
}

function inSearch(stop: GenericStop, within: string[]): boolean {
  const cc = lookup(stop)?.cc ?? countryCodeFor(stop.country);
  return within.some((area) => {
    const areaCc = countryCodeFor(area);
    return areaCc ? areaCc === cc : area.toLowerCase() === stop.country.toLowerCase();
  });
}

export function compareTours(plan: TourPlan, generic: GenericTour): TourComparison {
  const ranks = qlooRankings(plan);
  const stopKeys = new Map<string, number>();
  for (const s of plan.stops) {
    const city = findCity(s.city, s.countryCode ?? s.country) ?? findCity(s.city);
    if (city) stopKeys.set(cityKey(city), s.order);
  }

  const rows: ComparisonRow[] = generic.stops.map((g) => {
    const key = lookupKey(g);
    const qloo = key ? ranks.get(key) : undefined;
    const openerOrder = key ? stopKeys.get(key) : undefined;
    return {
      city: g.city,
      country: g.country,
      ...(g.why ? { why: g.why } : {}),
      ...(openerOrder !== undefined ? { openerOrder } : {}),
      ...(qloo ? { qloo } : {}),
      outsideSearch: !inSearch(g, plan.query.within),
    };
  });

  const genericKeys = new Set(generic.stops.map(lookupKey).filter(Boolean));
  const openerOnly = plan.stops.flatMap((s) => {
    const city = findCity(s.city, s.countryCode ?? s.country) ?? findCity(s.city);
    const key = city ? cityKey(city) : undefined;
    if (key && genericKeys.has(key)) return [];
    const qloo = key ? ranks.get(key) : undefined;
    return [{ order: s.order, city: s.city, country: s.country, ...(qloo ? { qloo } : {}) }];
  });

  return {
    generic,
    rows,
    openerOnly,
    overlap: rows.filter((r) => r.openerOrder !== undefined).length,
    noSignal: rows.filter((r) => !r.qloo && !r.outsideSearch).length,
    qlooTop3: rows.filter((r) => r.qloo && r.qloo.rank <= 3).length,
  };
}
