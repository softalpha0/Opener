import { describe, expect, it } from "vitest";
import { distanceKm, findCity, nearestCity } from "@/lib/geo/cities";
import { citiesFromHeat, routeOrder } from "@/lib/plan/cities";
import { computeMomentum } from "@/lib/plan/momentum";
import { parseCompare, parseDemographics, parseHeatmap } from "@/lib/qloo/parse";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { extractJson } from "@/lib/agent/prompt";
import { whyThisCity } from "@/lib/plan/format";
import { audienceTags } from "@/lib/agent/compose";
import type { Evidence, Stop } from "@/lib/plan/schema";

describe("geo", () => {
  it("maps a heat cell to the nearest touring city", () => {
    expect(nearestCity(41.85, -87.68)?.city.n).toBe("Chicago");
    expect(nearestCity(0, -140)).toBeUndefined();
    expect(findCity("Montréal", "Canada")?.cc).toBe("CA");
    expect(Math.round(distanceKm(51.5, -0.12, 48.85, 2.35))).toBeGreaterThan(330);
  });

  it("aggregates cells per city by strongest affinity", () => {
    const points = parseHeatmap([
      { location: { latitude: 41.88, longitude: -87.63 }, query: { affinity: 0.9 } },
      { location: { latitude: 41.8, longitude: -87.7 }, query: { affinity: 0.95 } },
      { location: { latitude: 40.71, longitude: -74.0 }, query: { affinity: 0.92 } },
      { bad: true },
    ]);
    const cities = citiesFromHeat(points);
    expect(cities.map((c) => c.city.n)).toEqual(["Chicago", "New York City"]);
    expect(cities[0]?.cells).toBe(2);
    expect(cities[0]?.affinity).toBe(0.95);
  });

  it("routes greedily from the first stop", () => {
    const stops = [
      { id: "a", lat: 0, lng: 0 },
      { id: "far", lat: 0, lng: 10 },
      { id: "near", lat: 0, lng: 1 },
    ];
    expect(routeOrder(stops, (x, y) => Math.abs(x.lng - y.lng)).map((s) => s.id)).toEqual([
      "a",
      "near",
      "far",
    ]);
  });
});

describe("momentum", () => {
  const pts = (vals: number[]) =>
    vals.map((v, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, percentile: v }));
  it("reads rising, falling, steady and unknown", () => {
    expect(computeMomentum(pts([50, 51, 52, 60, 61, 62])).direction).toBe("rising");
    expect(computeMomentum(pts([70, 69, 60, 58, 57, 55])).direction).toBe("falling");
    expect(computeMomentum(pts([50, 51, 50, 51, 50, 51])).direction).toBe("steady");
    expect(computeMomentum(pts([50, 60])).direction).toBe("unknown");
  });
});

describe("parsers", () => {
  it("reads relative demographics", () => {
    const d = parseDemographics([{ query: { age: { "25_to_29": 0.4 }, gender: { female: 0.1 } } }]);
    expect(d?.age).toEqual([{ bucket: "25–29", value: 0.4 }]);
    expect(d?.gender[0]?.bucket).toBe("female");
  });

  it("collects named items from compare results of any shape", () => {
    expect(
      parseCompare({ tags: [{ name: "folk", tag_id: "t", query: { affinity: 0.5 } }], other: 3 }),
    ).toEqual([{ name: "folk", id: "t", score: 0.5 }]);
    expect(parseCompare([{ name: "x" }, { nope: 1 }])).toEqual([{ name: "x" }]);
  });
});

describe("rate limit", () => {
  it("allows N requests per window per key", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, () => now);
    expect(limiter.check("ip").allowed).toBe(true);
    expect(limiter.check("ip").allowed).toBe(true);
    const third = limiter.check("ip");
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBe(1);
    expect(limiter.check("other").allowed).toBe(true);
    now = 1001;
    expect(limiter.check("ip").allowed).toBe(true);
  });
});

describe("extractJson", () => {
  it("pulls the object out of fenced model text", () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson("no json")).toBeUndefined();
  });
});

describe("whyThisCity", () => {
  const evidence = new Map<string, Evidence>([
    [
      "ev9",
      {
        id: "ev9",
        tool: "qloo_recommend",
        purpose: "Openers near Leeds",
        inputRedacted: { signal_location: "Leeds, United Kingdom" },
        status: "ok",
        summary: "5 results.",
        resultCount: 5,
        fetchedAt: "2026-10-24T00:00:00Z",
        cached: false,
        warnings: [],
      },
    ],
  ]);
  const stop: Stop = {
    order: 2,
    demandRank: 2,
    area: "United Kingdom",
    areaCities: 9,
    city: "Leeds",
    region: "England",
    country: "United Kingdom",
    affinityScore: 0.871,
    heatCells: 3,
    reason: "r",
    evidenceIds: ["ev3"],
    openers: [{ id: "a", name: "A", overlapNote: "n", evidenceIds: ["ev9"] }],
  };

  it("states the Qloo signals in plain words", () => {
    expect(whyThisCity(stop, evidence)).toEqual([
      "Ranked #2 of 9 cities in Qloo's audience heatmap for United Kingdom.",
      "Strongest heat cell near Leeds scored 0.87 for audience affinity (Qloo scores 0 to 1, relative within United Kingdom).",
      "3 of Qloo's top heat cells fall in and around the city.",
      "1 opener picked from artists Qloo recommends to the same audience near Leeds, United Kingdom.",
    ]);
  });

  it("warns when Qloo returned only a couple of cities", () => {
    const thin = {
      ...stop,
      demandRank: 2,
      areaCities: 2,
      affinityScore: 0,
      heatCells: 1,
      openers: [],
    };
    expect(whyThisCity(thin, evidence)).toEqual([
      "Ranked #2 of 2 cities in Qloo's audience heatmap for United Kingdom.",
      "Only 2 cities came out of Qloo's heatmap for United Kingdom, so the affinity score (0.00) only compares those.",
    ]);
  });

  it("drops lines it has no data for", () => {
    const bare = {
      ...stop,
      area: undefined,
      areaCities: undefined,
      affinityScore: undefined,
      heatCells: 1,
      openers: [],
    };
    expect(whyThisCity(bare, evidence)).toEqual([
      "Ranked #2 in Qloo's audience heatmap for United Kingdom.",
    ]);
  });
});

describe("audienceTags", () => {
  // Real tag list Qloo returned for Drake (2026-10-25), trimmed.
  const drake = [
    {
      id: "urn:tag:inclusivity:place:identifies_as_women_owned",
      name: "Identifies as women-owned",
    },
    { id: "urn:tag:hotel_rating:place:three_star", name: "Three Star" },
    { id: "urn:tag:credit_card:place:discover", name: "Discover" },
    { id: "urn:tag:genre:brand:entertainment", name: "Entertainment" },
    { id: "urn:tag:keyword:media:female_protagonist", name: "female protagonist" },
    { id: "urn:tag:genre:music:hip_hop", name: " Hip Hop" },
    { id: "urn:tag:style:music:rhythmic", name: "Rhythmic" },
    { id: "urn:tag:genre:music:rap", name: "Rap" },
  ];

  it("puts music tags first, then media, and drops place and brand noise", () => {
    expect(audienceTags(drake).map((t) => t.name)).toEqual([
      "Hip Hop",
      "Rhythmic",
      "Rap",
      "female protagonist",
    ]);
  });

  it("falls back to other tags when there are too few music or media tags", () => {
    expect(audienceTags(drake.slice(0, 4)).map((t) => t.name)).toEqual([
      "Identifies as women-owned",
      "Three Star",
      "Discover",
      "Entertainment",
    ]);
  });
});

describe("routeOrder on a cross-border tour", () => {
  // Phoebe Bridgers, North America (live run 2026-10-25): these 8 stops used to be routed
  // country by country, crossing the continent twice.
  const names = [
    "Boston",
    "Seattle",
    "Portland",
    "Riverside",
    "Vancouver",
    "Toronto",
    "Ottawa",
    "Montreal",
  ];
  const stops = names.map((n) => {
    const c = findCity(
      n,
      n === "Vancouver" || n === "Toronto" || n === "Ottawa" || n === "Montreal" ? "CA" : "US",
    );
    if (!c) throw new Error(n);
    return { n, lat: c.lat, lng: c.lng };
  });
  const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    distanceKm(a.lat, a.lng, b.lat, b.lng);
  const length = (r: typeof stops) => r.slice(1).reduce((t, s, i) => t + km(r[i]!, s), 0);

  it("starts at the top city and crosses the continent once", () => {
    const route = routeOrder(stops, km);
    expect(route[0]?.n).toBe("Boston");
    expect(route.map((s) => s.n).slice(0, 4)).toEqual(["Boston", "Montreal", "Ottawa", "Toronto"]);
    expect(length(route)).toBeLessThan(length(stops) * 0.75);
  });
});
