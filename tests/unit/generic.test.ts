import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { genericTour } from "@/lib/agent/generic";
import type { LlmProvider } from "@/lib/agent/llm";
import { TtlCache } from "@/lib/qloo/cache";
import {
  compareTours,
  parseGenericReply,
  populationBaseline,
  qlooRankings,
  type GenericTour,
} from "@/lib/plan/generic";
import { rowVerdict } from "@/lib/plan/verdict";
import { TourPlanSchema, type TourPlan } from "@/lib/plan/schema";

// A real plan captured from the live Qloo hackathon API (Sia, worldwide, 2026-10-23).
// No secrets: Qloo keys never enter plan JSON. Tests read it; nothing calls the live API.
const recorded: TourPlan = TourPlanSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "../fixtures/recorded/sia-worldwide.json"), "utf8")),
);

const tour = (stops: GenericTour["stops"]): GenericTour => ({
  source: "llm",
  model: "test-model",
  generatedAt: "2026-10-24T00:00:00Z",
  stops,
});

describe("parseGenericReply", () => {
  it("reads a fenced JSON array and drops junk and duplicates", () => {
    const text =
      'Sure!\n```json\n[{"city":"London","country":"United Kingdom","why":"Big market"},' +
      '{"city":"London","country":"United Kingdom"},{"city":7},{"country":"Germany"},' +
      '{"city":"Berlin","country":"Germany"}]\n```';
    expect(parseGenericReply(text)).toEqual([
      { city: "London", country: "United Kingdom", why: "Big market" },
      { city: "Berlin", country: "Germany" },
    ]);
  });

  it("returns nothing for prose or broken JSON", () => {
    expect(parseGenericReply("I would go to London and Paris.")).toEqual([]);
    expect(parseGenericReply("[{city: London}]")).toEqual([]);
  });

  it("caps the list at eight cities", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ city: `C${i}`, country: "X" }));
    expect(parseGenericReply(JSON.stringify(many))).toHaveLength(8);
  });
});

describe("populationBaseline", () => {
  it("takes the biggest cities round-robin across countries", () => {
    const stops = populationBaseline(["United States", "Nigeria"], 4);
    expect(stops.map((s) => s.country)).toEqual([
      "United States",
      "Nigeria",
      "United States",
      "Nigeria",
    ]);
    expect(stops[0]?.city).toBe("New York City");
    expect(stops[1]?.city).toBe("Lagos");
  });

  it("skips boroughs of a city already listed", () => {
    const cities = populationBaseline(["United States"], 6).map((s) => s.city);
    expect(cities).toContain("New York City");
    expect(cities).not.toContain("Brooklyn");
    expect(cities).not.toContain("Queens");
  });

  it("is deterministic", () => {
    expect(populationBaseline(["Germany"], 3)).toEqual(populationBaseline(["Germany"], 3));
  });
});

describe("qlooRankings on recorded Qloo data", () => {
  const ranks = qlooRankings(recorded);

  it("ranks cities per searched country, each from its own heatmap call", () => {
    const london = ranks.get("london|gb");
    expect(london).toMatchObject({ area: "United Kingdom", rank: 1, evidenceId: "ev3" });
    const lagos = ranks.get("lagos|ng");
    expect(lagos).toMatchObject({ area: "Nigeria", rank: 1, evidenceId: "ev5" });
    for (const r of ranks.values()) {
      expect(r.rank).toBeLessThanOrEqual(r.of);
      expect(["United States", "United Kingdom", "Germany", "Nigeria", "Australia"]).toContain(
        r.area,
      );
    }
  });

  it("keeps a US heat cell near Buffalo in the US (the old build mapped it to Toronto)", () => {
    expect(ranks.get("toronto|ca")).toBeUndefined();
    expect([...ranks.values()].every((r) => r.country !== "Canada")).toBe(true);
  });
});

describe("compareTours on recorded Qloo data", () => {
  it("flags overlap, missing signal and cities outside the search", () => {
    const c = compareTours(
      recorded,
      tour([
        { city: "London", country: "United Kingdom" },
        { city: "Paris", country: "France" },
        { city: "Kano", country: "Nigeria" },
      ]),
    );
    const [london, paris, kano] = c.rows;
    expect(london?.qloo?.rank).toBe(1);
    expect(london?.openerOrder).toBe(1);
    expect(paris?.outsideSearch).toBe(true);
    expect(kano?.outsideSearch).toBe(false);
    expect(c.overlap).toBe(1);
    expect(c.qlooTop3).toBeGreaterThanOrEqual(1);
    expect(c.openerOnly.map((o) => o.city)).not.toContain("London");
    expect(rowVerdict(paris!)).toMatch(/Outside the countries/);
    expect(rowVerdict(london!)).toMatch(/^#1 of \d+ cities in Qloo's United Kingdom heatmap/);
  });

  it("fixes a wrong country from the model and drops its note", () => {
    const c = compareTours(
      recorded,
      tour([{ city: "Lagos", country: "Ghana", why: "Wait, Lagos is in Nigeria, but…" }]),
    );
    expect(c.rows[0]).toMatchObject({ city: "Lagos", country: "Nigeria", outsideSearch: false });
    expect(c.rows[0]?.why).toBeUndefined();
    expect(c.rows[0]?.qloo?.rank).toBe(1);
  });

  it("matches common spellings to the city table", () => {
    const c = compareTours(recorded, tour([{ city: "New York", country: "USA" }]));
    expect(c.rows[0]?.qloo?.city).toBe("New York City");
    expect(c.rows[0]?.outsideSearch).toBe(false);
  });
});

describe("genericTour (no Qloo data reaches the model)", () => {
  const cache = () => new TtlCache<GenericTour>({ namespace: "t", ttlMs: 60_000, maxEntries: 10 });
  const llm = (reply: () => Promise<string>, prompts: string[] = []): LlmProvider => ({
    id: "fake",
    model: "fake-model",
    runLoop: () => Promise.reject(new Error("not used")),
    complete: (system, prompt) => {
      prompts.push(system + "\n" + prompt);
      return reply();
    },
  });

  it("uses the population baseline when no LLM is configured", async () => {
    const g = await genericTour(recorded, null, cache());
    expect(g.source).toBe("population");
    expect(g.note).toMatch(/No LLM key/);
    expect(g.stops.length).toBe(recorded.stops.length);
  });

  it("asks the model with only the artist and countries, and caches the answer", async () => {
    const prompts: string[] = [];
    const c = cache();
    const model = llm(async () => '[{"city":"Sydney","country":"Australia"}]', prompts);
    const first = await genericTour(recorded, model, c);
    const second = await genericTour(recorded, model, c);
    expect(first).toMatchObject({ source: "llm", model: "fake-model" });
    expect(first.stops).toEqual([{ city: "Sydney", country: "Australia" }]);
    expect(second).toEqual(first);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Sia");
    // Nothing from Qloo: no evidence IDs, entity IDs or heat scores in the prompt.
    expect(prompts[0]).not.toMatch(/ev\d|287BFB38|affinity/);
  });

  it("falls back without caching when the model fails", async () => {
    const c = cache();
    const g = await genericTour(
      recorded,
      llm(() => Promise.reject(new Error("429"))),
      c,
    );
    expect(g.source).toBe("population");
    expect(g.note).toMatch(/unavailable/);
    const retry = await genericTour(
      recorded,
      llm(async () => '[{"city":"Lagos","country":"Nigeria"}]'),
      c,
    );
    expect(retry.source).toBe("llm");
  });
});
