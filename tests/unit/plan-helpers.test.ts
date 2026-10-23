import { describe, expect, it } from "vitest";
import { distanceKm, findCity, nearestCity } from "@/lib/geo/cities";
import { citiesFromHeat, routeOrder } from "@/lib/plan/cities";
import { computeMomentum } from "@/lib/plan/momentum";
import { parseCompare, parseDemographics, parseHeatmap } from "@/lib/qloo/parse";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { extractJson } from "@/lib/agent/prompt";

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
