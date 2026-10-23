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
