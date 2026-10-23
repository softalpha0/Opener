import { describe, expect, it } from "vitest";
import { nearestCity } from "@/lib/geo/cities";
import { citiesFromHeat } from "@/lib/plan/cities";
import { possessive } from "@/lib/plan/format";

const cell = (lat: number, lng: number, affinity: number) => ({ lat, lng, affinity });

describe("touring-city mapping", () => {
  it("merges a neighbouring city into the bigger market", () => {
    const cities = citiesFromHeat([
      cell(49.28, -123.12, 0.99),
      cell(48.43, -123.37, 1),
      cell(47.61, -122.33, 0.95),
    ]);
    expect(cities.map((c) => c.city.n)).toEqual(["Vancouver", "Seattle"]);
    expect(cities[0]).toMatchObject({ affinity: 1, cells: 2 });
  });

  it("prefers the metro over a nearby smaller city", () => {
    expect(nearestCity(42.3, -71.5)?.city.n).toBe("Boston");
  });
});

describe("possessive", () => {
  it("handles names ending in s", () => {
    expect(possessive("Phoebe Bridgers")).toBe("Phoebe Bridgers’");
    expect(possessive("Khruangbin")).toBe("Khruangbin’s");
  });
});

describe("borders and scales", () => {
  it("keeps a heat cell inside the country that was searched", () => {
    expect(nearestCity(42.9, -78.88, 90, "US")?.city.cc).toBe("US");
  });

  it("reads Qloo's 0–1 percentile as a percentage", async () => {
    const { computeMomentum } = await import("@/lib/plan/momentum");
    const pts = [0.5, 0.51, 0.52, 0.6, 0.61, 0.62].map((p, i) => ({
      date: `2026-01-0${i + 1}`,
      percentile: p,
    }));
    const m = computeMomentum(pts);
    expect(m.direction).toBe("rising");
    expect(m.series[0]?.value).toBe(50);
  });
});
