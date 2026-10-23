import { possessive } from "../plan/format";
import { distanceKm } from "../geo/cities";
import { hasResults } from "../qloo/envelope";
import {
  parseCompare,
  parseDemographics,
  parseEntities,
  parseHeatmap,
  parseTags,
  parseTrendSeries,
  type Candidate,
  type QlooEntity,
} from "../qloo/parse";
import { routeOrder } from "../plan/cities";
import { computeMomentum } from "../plan/momentum";
import type { AgentDraft, Opener, Stop, TourPlan } from "../plan/schema";
import {
  CROSSOVER,
  cityDemand,
  cityLabel,
  heatCalls,
  openerPool,
  type AreaDemand,
  type ArtistRef,
} from "./gather";
import type { Toolbox } from "./toolbox";

export const MAX_STOPS = 8;
const OPENERS_PER_STOP = 3;

export interface ComposeContext {
  box: Toolbox;
  artist: QlooEntity;
  describeId: string;
  alternatives: Candidate[];
  query: TourPlan["query"];
  draft: AgentDraft | null;
  mode: TourPlan["mode"];
  model?: string;
  extraNotices?: TourPlan["notices"];
  now: Date;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Demand = AreaDemand;
type Pool = ReturnType<typeof openerPool>;

export const LIMITATIONS = [
  "Qloo heatmap affinity is relative to this query. It shows where the audience over-indexes, not ticket demand or venue capacity.",
  "Cities are derived by Opener from Qloo heat cells using a bundled GeoNames table; cells more than 90 km from a listed city are left out.",
  "Demographic values are relative affinities (above or below average), not shares of fans.",
  "Dates, drive times, venue availability and capacity are not modelled yet.",
];

function matchDemand(demand: Demand[], city: string, country: string): Demand | undefined {
  const c = fold(city);
  const k = fold(country);
  const sameCountry = (d: Demand) =>
    !k ||
    fold(d.city.c) === k ||
    fold(d.city.cc) === k ||
    fold(d.city.c).includes(k) ||
    k.includes(fold(d.city.c));
  return (
    demand.find((d) => fold(d.city.n) === c && sameCountry(d)) ??
    demand.find((d) => fold(d.city.n) === c)
  );
}

function stopReason(artist: string, d: Demand, multiArea: boolean): string {
  const cells = d.cells > 1 ? ` across ${d.cells} nearby heat cells` : "";
  if (multiArea) {
    return `Strong audience affinity for ${artist} within ${d.area}: the top cell near ${d.city.n} scored ${d.affinity.toFixed(2)} on Qloo's ${d.area} heatmap${cells}.`;
  }
  return `Strong audience affinity for ${artist}: Qloo's heatmap scored ${d.affinity.toFixed(2)} at the top cell near ${d.city.n}${cells}.`;
}

/**
 * Next cities to add. With one area, take the global heatmap order. With several areas,
 * heatmap scores are relative to each area and can't be compared, so take each area's
 * strongest remaining city in turn (in the order the areas were searched).
 */
function pickExtras(
  demand: Demand[],
  areas: string[],
  count: number,
  taken: (d: Demand) => boolean,
): Demand[] {
  const remaining = demand.filter((d) => !taken(d));
  if (areas.length <= 1) return remaining.slice(0, count);
  const queues = areas.map((area) =>
    remaining.filter((d) => d.area === area).sort((a, b) => a.areaRank - b.areaRank),
  );
  const out: Demand[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const q of queues) {
      const next = q.shift();
      if (next && out.length < count) out.push(next);
    }
  }
  return out;
}

/** Route order: nearest-neighbour, kept country by country when several areas were searched. */
function orderRoute(stops: Demand[], areas: string[]): Demand[] {
  const nn = (list: Demand[]) =>
    routeOrder(
      list.map((d) => ({ d, lat: d.city.lat, lng: d.city.lng })),
      (a, b) => distanceKm(a.lat, a.lng, b.lat, b.lng),
    ).map((x) => x.d);
  if (areas.length <= 1) return nn(stops);
  return areas.flatMap((area) =>
    nn(stops.filter((d) => d.area === area).sort((a, b) => a.areaRank - b.areaRank)),
  );
}

function generalOpeners(pool: Pool) {
  return [...pool.values()]
    .filter((o) => o.locations.length === 0 || o.affinity !== undefined)
    .sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0));
}

function openerFrom(
  pool: Pool,
  id: string,
  artist: string,
  d: Demand | undefined,
  note?: string,
  ids?: string[],
): Opener | undefined {
  const o = pool.get(id);
  if (!o) return undefined;
  const label = d ? cityLabel(d) : undefined;
  const local = label !== undefined && o.locations.includes(label);
  const evidenceIds = (ids ?? []).filter((e) => o.evidenceIds.includes(e));
  return {
    id: o.id,
    name: o.name,
    ...(o.image ? { image: o.image } : {}),
    ...(o.affinity !== undefined ? { affinity: o.affinity } : {}),
    overlapNote:
      note ??
      (local
        ? `Qloo recommends ${o.name} for ${possessive(artist)} audience, using ${d?.city.n} as the location signal.`
        : `Qloo recommends ${o.name} for ${possessive(artist)} audience${o.affinity !== undefined ? ` (affinity ${o.affinity.toFixed(2)})` : ""}.`),
    evidenceIds: evidenceIds.length ? evidenceIds : o.evidenceIds,
  };
}

function fillOpeners(
  existing: Opener[],
  pool: Pool,
  artist: string,
  d: Demand,
  used: Set<string>,
): Opener[] {
  const out = [...existing];
  const label = cityLabel(d);
  const local = [...pool.values()].filter((o) => o.locations.includes(label));
  const ranked = [
    ...local,
    ...generalOpeners(pool).filter((o) => !used.has(o.id)),
    ...generalOpeners(pool),
  ];
  for (const candidate of ranked) {
    if (out.length >= OPENERS_PER_STOP) break;
    if (out.some((o) => o.id === candidate.id)) continue;
    const opener = openerFrom(pool, candidate.id, artist, d);
    if (opener) {
      out.push(opener);
      used.add(opener.id);
    }
  }
  return out;
}

function toStop(
  d: Demand,
  order: number,
  demandRank: number,
  reason: string,
  evidenceIds: string[],
  openers: Opener[],
  multiArea: boolean,
): Stop {
  return {
    order,
    demandRank,
    ...(multiArea && d.area ? { area: d.area } : {}),
    city: d.city.n,
    region: d.city.a,
    country: d.city.c,
    countryCode: d.city.cc,
    lat: d.city.lat,
    lng: d.city.lng,
    affinityScore: Math.round(d.affinity * 1000) / 1000,
    heatCells: d.cells,
    reason,
    evidenceIds: [...new Set([d.evidenceId, ...evidenceIds])],
    openers,
  };
}

function routeStops(stops: Stop[], areas: string[]): Stop[] {
  const nn = (list: Stop[]) =>
    routeOrder(
      list.map((s) => ({ s, lat: s.lat ?? 0, lng: s.lng ?? 0 })),
      (a, b) => distanceKm(a.lat, a.lng, b.lat, b.lng),
    ).map((x) => x.s);
  const groups = areas.length
    ? [
        ...areas.map((area) =>
          stops.filter((s) => s.area === area).sort((a, b) => a.demandRank - b.demandRank),
        ),
        stops.filter((s) => !s.area || !areas.includes(s.area)),
      ]
    : [stops];
  return groups.flatMap(nn).map((s, i) => ({ ...s, order: i + 1 }));
}

function buildStops(
  ctx: ComposeContext,
  demand: Demand[],
  pool: Pool,
  notices: TourPlan["notices"],
  limitations: string[],
): Stop[] {
  const artist = ctx.artist.name;
  const areas = ctx.query.within;
  const multiArea = areas.length > 1;
  const validIds = new Set(ctx.box.evidence.map((e) => e.id));
  const rankOf = (d: Demand) =>
    multiArea
      ? d.areaRank
      : demand.findIndex((x) => x.city.n === d.city.n && x.city.cc === d.city.cc) + 1;
  const used = new Set<string>();
  const stops: Stop[] = [];

  if (ctx.draft) {
    let dropped = 0;
    for (const draftStop of ctx.draft.stops) {
      const d = matchDemand(demand, draftStop.city, draftStop.country);
      if (!d || stops.some((s) => s.city === d.city.n && s.countryCode === d.city.cc)) {
        dropped++;
        continue;
      }
      const openers = draftStop.openers
        .map((o) => openerFrom(pool, o.id, artist, d, o.overlapNote, o.evidenceIds))
        .filter((o): o is Opener => o !== undefined);
      openers.forEach((o) => used.add(o.id));
      stops.push(
        toStop(
          d,
          stops.length + 1,
          rankOf(d),
          draftStop.reason,
          draftStop.evidenceIds.filter((id) => validIds.has(id)),
          fillOpeners(openers, pool, artist, d, used),
          multiArea,
        ),
      );
      if (stops.length >= MAX_STOPS) break;
    }
    if (dropped) {
      limitations.push(
        `${dropped} agent-proposed stop${dropped === 1 ? " was" : "s were"} dropped because no Qloo heatmap result supported ${dropped === 1 ? "it" : "them"}.`,
      );
    }
  }

  const target = Math.min(MAX_STOPS, Math.max(stops.length, demand.length));
  if (stops.length < target) {
    const extra = pickExtras(demand, areas, target - stops.length, (d) =>
      stops.some((s) => s.city === d.city.n && s.countryCode === d.city.cc),
    );
    const routed = stops.length ? extra : orderRoute(extra, areas);
    if (ctx.draft && extra.length) {
      notices.push({
        level: "info",
        message: `Added ${extra.length} stop${extra.length === 1 ? "" : "s"} from the heatmap ranking to complete the route.`,
      });
    }
    for (const d of routed) {
      stops.push(
        toStop(
          d,
          stops.length + 1,
          rankOf(d),
          stopReason(artist, d, multiArea),
          [],
          fillOpeners([], pool, artist, d, used),
          multiArea,
        ),
      );
    }
  }
  // The model's stop order is often poor geography, so the server routes the stops itself:
  // country by country (in search order) with short hops within each country.
  if (ctx.draft) return routeStops(stops, multiArea ? areas : []);
  return stops;
}

function crossover(ctx: ComposeContext): TourPlan["crossover"] {
  const recs = ctx.box.byTool("qloo_recommend");
  const out: TourPlan["crossover"] = [];
  const categories = [...CROSSOVER, { type: "place" as const, label: "Places", limit: 6 }];
  for (const category of categories) {
    const call = recs.find((c) => c.args.target_type === category.type && hasResults(c.envelope));
    if (!call) continue;
    const items = parseEntities(call.envelope.results)
      .filter((e) => e.id !== ctx.artist.id)
      .slice(0, category.limit)
      .map((e) => ({ id: e.id, name: e.name, ...(e.image ? { image: e.image } : {}) }));
    if (!items.length) continue;
    const where =
      typeof call.args.filter_location === "string"
        ? ` in ${call.args.filter_location.split(",")[0]}`
        : "";
    out.push({
      category: category.type,
      label: `${category.label}${where}`,
      items,
      evidenceId: call.id,
    });
  }
  return out;
}

function spotlight(ctx: ComposeContext, pool: Pool): TourPlan["openerSpotlight"] {
  const call = ctx.box.byTool("qloo_compare_audiences").find((c) => hasResults(c.envelope));
  if (!call) return null;
  const groupB = Array.isArray(call.args.group_b) ? call.args.group_b : [];
  const openerId = typeof groupB[0] === "string" ? groupB[0] : "";
  const opener = pool.get(openerId);
  const shared = parseCompare(call.envelope.results)
    .slice(0, 6)
    .map((c) => ({
      name: c.name,
      ...(c.type ? { type: c.type.replace(/^urn:(tag:)?/, "") } : {}),
    }));
  if (!opener || !shared.length) return null;
  const draft = ctx.draft?.openerSpotlight;
  const note =
    draft && draft.openerId === opener.id
      ? draft.note
      : `Qloo's audience comparison of ${ctx.artist.name} and ${opener.name} surfaced these taste signals.`;
  return {
    openerId: opener.id,
    openerName: opener.name,
    note,
    shared,
    evidenceIds: [...new Set([call.id, ...opener.evidenceIds])],
  };
}

function merchIdeas(
  ctx: ComposeContext,
  cross: TourPlan["crossover"],
  tags: Array<{ id: string; name: string }>,
  tagsId: string | undefined,
): TourPlan["merchIdeas"] {
  const validIds = new Set(ctx.box.evidence.map((e) => e.id));
  if (ctx.draft?.merchIdeas.length) {
    const ideas = ctx.draft.merchIdeas
      .map((m) => ({ ...m, evidenceIds: m.evidenceIds.filter((id) => validIds.has(id)) }))
      .filter((m) => m.evidenceIds.length > 0);
    if (ideas.length) return ideas;
  }
  const ideas: TourPlan["merchIdeas"] = [];
  const brands = cross.find((c) => c.category === "brand");
  if (brands && brands.items.length >= 2) {
    const [a, b] = brands.items;
    ideas.push({
      idea: `A merch capsule that nods to the look of ${a?.name} and ${b?.name}, which over-index with this audience.`,
      basedOn: [a?.name ?? "", b?.name ?? ""],
      evidenceIds: [brands.evidenceId],
    });
  }
  // Mood boards only make sense with music and media tags, not place tags like "Hotel".
  const moodTags = tags.filter((t) => /^urn:tag:[^:]+:(music|media)(:|$)/.test(t.id));
  if (moodTags.length >= 2 && tagsId) {
    const picked = moodTags.slice(0, 3).map((t) => t.name);
    ideas.push({
      idea: `Use ${picked.join(", ")} as the mood board for tour posters and social copy.`,
      basedOn: picked,
      evidenceIds: [tagsId],
    });
  }
  const podcasts = cross.find((c) => c.category === "podcast");
  if (podcasts?.items[0]) {
    ideas.push({
      idea: `Pitch an interview or ad read on ${podcasts.items[0].name} ahead of on-sale.`,
      basedOn: [podcasts.items[0].name],
      evidenceIds: [podcasts.evidenceId],
    });
  }
  const places = cross.find((c) => c.category === "place");
  if (places?.items[0]) {
    ideas.push({
      idea: `Scout ${places.items[0].name} for a pre-show listening party or poster drop.`,
      basedOn: [places.items[0].name],
      evidenceIds: [places.evidenceId],
    });
  }
  return ideas;
}

function deterministicSummary(
  ctx: ComposeContext,
  stops: Stop[],
  momentum: TourPlan["momentum"],
): string {
  if (!stops.length) {
    return `Qloo did not return enough location signal for ${ctx.artist.name} in ${ctx.query.regionLabel} to build a route. Try a wider region.`;
  }
  const trend =
    momentum.direction === "unknown"
      ? ""
      : ` Qloo's trend data reads as ${momentum.direction} over the past year.`;
  if (ctx.query.within.length > 1) {
    const leaders = ctx.query.within.flatMap((area) => {
      const top = stops
        .filter((s) => s.area === area)
        .sort((a, b) => a.demandRank - b.demandRank)[0];
      return top ? [`${top.city} (${area})`] : [];
    });
    const list =
      leaders.length > 1
        ? `${leaders.slice(0, -1).join(", ")} and ${leaders[leaders.length - 1]}`
        : leaders[0];
    return `Within each country searched, ${possessive(ctx.artist.name)} audience affinity peaks around ${list}. Qloo's heatmap scores are relative within each country, so the route takes the strongest cities country by country rather than ranking countries against each other, with openers drawn from artists that over-index with the same audience.${trend}`;
  }
  const byDemand = [...stops]
    .sort((a, b) => a.demandRank - b.demandRank)
    .slice(0, 3)
    .map((s) => s.city);
  const list =
    byDemand.length > 1
      ? `${byDemand.slice(0, -1).join(", ")} and ${byDemand[byDemand.length - 1]}`
      : byDemand[0];
  return `${possessive(ctx.artist.name)} strongest audience affinity in ${ctx.query.regionLabel} clusters around ${list}. The route below starts with the strongest market and follows a short-hop order, with openers drawn from artists that over-index with the same audience.${trend}`;
}

export function composePlan(ctx: ComposeContext): TourPlan {
  const { box } = ctx;
  const ref: ArtistRef = { id: ctx.artist.id, name: ctx.artist.name };
  const notices: TourPlan["notices"] = [...(ctx.extraNotices ?? [])];
  const limitations = [...LIMITATIONS, `Searched within: ${ctx.query.within.join(", ")}.`];
  if (ctx.query.within.length > 1) {
    limitations.push(
      "Heatmap scores are relative within each country searched, so cities in different countries are not ranked against each other.",
    );
    notices.push({
      level: "info",
      message: `Qloo scores each country's heatmap on its own scale, so Opener picks the strongest cities in each country (${ctx.query.within.join(", ")}) instead of ranking countries against each other.`,
    });
  }

  const demand = cityDemand(box, ref);
  const pool = openerPool(box, ref);
  const stops = buildStops(ctx, demand, pool, notices, limitations);

  const heat = heatCalls(box, ref)
    .flatMap((call) =>
      parseHeatmap(call.envelope.results).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        affinity: p.affinity,
        evidenceId: call.id,
      })),
    )
    .slice(0, 120);

  const tagsCall = box.byTool("qloo_entity_tags").find((c) => hasResults(c.envelope));
  const tags = tagsCall ? parseTags(tagsCall.envelope.results).slice(0, 10) : [];

  const demoCall = box.byTool("qloo_audience_demographics").find((c) => hasResults(c.envelope));
  const demo = demoCall ? parseDemographics(demoCall.envelope.results) : undefined;

  const trendCall = box.byTool("qloo_trends").find((c) => hasResults(c.envelope));
  const series = trendCall ? parseTrendSeries(trendCall.envelope.results)[0] : undefined;
  const m = computeMomentum(series?.points ?? []);
  const momentum: TourPlan["momentum"] = trendCall
    ? { direction: m.direction, note: m.note, evidenceId: trendCall.id, series: m.series }
    : {
        direction: "unknown",
        note: "No Qloo trend data was available for this run.",
        evidenceId: null,
        series: [],
      };

  const cross = crossover(ctx);

  for (const e of box.evidence) {
    if (e.status === "partial" || e.status === "degraded") {
      notices.push({ level: e.status, message: `${e.purpose}: ${e.summary}`, evidenceId: e.id });
    } else if (e.status === "error") {
      const recovery = box.get(e.id)?.envelope.error?.recovery;
      notices.push({
        level: "degraded",
        message: `${e.purpose} did not complete${recovery ? `: ${recovery}` : "."}`,
        evidenceId: e.id,
      });
    }
  }

  return {
    version: 1,
    generatedAt: ctx.now.toISOString(),
    mode: ctx.mode,
    ...(ctx.model ? { model: ctx.model } : {}),
    query: ctx.query,
    artist: {
      id: ctx.artist.id,
      name: ctx.artist.name,
      ...(ctx.artist.image ? { image: ctx.artist.image } : {}),
      ...(ctx.artist.description ? { description: ctx.artist.description } : {}),
      tags: tags.map((t) => ({ id: t.id, name: t.name })),
      alternatives: ctx.alternatives.slice(0, 4).map((a) => ({
        id: a.id,
        name: a.name,
        ...(a.description ? { description: a.description.slice(0, 160) } : {}),
      })),
      evidenceIds: [ctx.describeId, ...(tagsCall ? [tagsCall.id] : [])],
    },
    summary: ctx.draft?.summary ?? deterministicSummary(ctx, stops, momentum),
    momentum,
    demographics: {
      items: demo
        ? [
            ...demo.age.map((a) => ({ group: "age" as const, label: a.bucket, value: a.value })),
            ...demo.gender.map((g) => ({
              group: "gender" as const,
              label: g.bucket,
              value: g.value,
            })),
          ]
        : [],
      evidenceId: demoCall?.id ?? null,
    },
    stops,
    heat,
    openerSpotlight: spotlight(ctx, pool),
    crossover: cross,
    merchIdeas: merchIdeas(ctx, cross, tags, tagsCall?.id),
    evidence: box.evidence,
    notices,
    limitations,
  };
}

/** Which opener to justify with qloo_compare_audiences: the strongest pick for the top city. */
export function spotlightCandidate(
  box: Toolbox,
  artist: ArtistRef,
): { id: string; name: string } | undefined {
  const pool = openerPool(box, artist);
  const top = cityDemand(box, artist)[0];
  const local = top
    ? [...pool.values()].find((o) => o.locations.includes(cityLabel(top)))
    : undefined;
  const pick = local ?? generalOpeners(pool)[0];
  return pick ? { id: pick.id, name: pick.name } : undefined;
}
