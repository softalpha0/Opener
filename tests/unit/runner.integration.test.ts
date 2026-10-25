import { describe, expect, it } from "vitest";
import type { LlmProvider, LoopParams } from "@/lib/agent/llm";
import { MAX_QLOO_CALLS, runPlan } from "@/lib/agent/runner";
import type { PlanEvent } from "@/lib/plan/schema";
import { ARTIST_ID, fakeCaller } from "../fixtures/fake-qloo";

const now = () => new Date("2026-10-01T12:00:00Z");

function collect() {
  const events: PlanEvent[] = [];
  return { events, emit: (e: PlanEvent) => events.push(e) };
}

describe("runPlan (deterministic planner, mocked Qloo)", () => {
  it("builds a grounded plan where every reference resolves to evidence", async () => {
    const { events, emit } = collect();
    const caller = fakeCaller();
    const plan = await runPlan(
      { artist: "Fixture Artist", region: "north-america" },
      { qloo: caller, llm: null, now },
      emit,
    );
    expect(plan).not.toBeNull();
    if (!plan) return;
    const ids = new Set(plan.evidence.map((e) => e.id));
    expect(plan.mode).toBe("deterministic");
    expect(plan.stops.length).toBeGreaterThanOrEqual(5);
    expect(plan.stops.length).toBeLessThanOrEqual(8);
    for (const stop of plan.stops) {
      expect(stop.evidenceIds.every((id) => ids.has(id))).toBe(true);
      expect(plan.evidence.find((e) => e.id === stop.evidenceIds[0])?.tool).toBe(
        "qloo_where_popular",
      );
      for (const opener of stop.openers) {
        expect(opener.id).not.toBe(ARTIST_ID);
        expect(opener.evidenceIds.every((id) => ids.has(id))).toBe(true);
      }
    }
    expect(plan.openerSpotlight?.evidenceIds.every((id) => ids.has(id))).toBe(true);
    expect(plan.crossover.length).toBeGreaterThan(0);
    expect(plan.momentum.direction).toBe("rising");
    expect(plan.notices.some((n) => n.level === "partial")).toBe(true);
    expect(caller.log.length).toBeLessThanOrEqual(MAX_QLOO_CALLS);
    expect(
      caller.log
        .filter((c) => c.tool !== "qloo_describe")
        .every((c) => JSON.stringify(c.args).includes(ARTIST_ID)),
    ).toBe(true);
    expect(events.filter((e) => e.type === "heat").length).toBe(2);
    expect(events.at(-1)?.type).toBe("plan");
    const stages = events.flatMap((e) => (e.type === "stage" ? [`${e.id}:${e.state}`] : []));
    expect(stages).toEqual([
      "resolve:start",
      "resolve:done",
      "query:start",
      "query:done",
      "rank:start",
      "rank:done",
      "compose:start",
      "compose:done",
    ]);
    for (const stop of plan.stops) expect(stop.areaCities).toBeGreaterThanOrEqual(stop.demandRank);
  });

  it("stops and returns candidates for an ambiguous name (never auto-picks)", async () => {
    const { events, emit } = collect();
    const caller = fakeCaller();
    const plan = await runPlan({ artist: "Twin Name" }, { qloo: caller, llm: null, now }, emit);
    expect(plan).toBeNull();
    const ask = events.find((e) => e.type === "needs_input");
    expect(ask && ask.type === "needs_input" && ask.candidates).toHaveLength(2);
    expect(caller.log).toHaveLength(1);
  });

  it("reports an empty result for unknown artists", async () => {
    const { events, emit } = collect();
    expect(
      await runPlan({ artist: "nobody" }, { qloo: fakeCaller(), llm: null, now }, emit),
    ).toBeNull();
    expect(events.some((e) => e.type === "empty")).toBe(true);
  });
});

class FakeLlm implements LlmProvider {
  id = "fake";
  model = "fake-model";
  async runLoop(p: LoopParams) {
    const heat = await p.execute("qloo_where_popular", {
      entity: ARTIST_ID,
      entity_type: "artist",
      within: "United States",
      limit: 20,
      bogus: true,
    });
    const recs = await p.execute("qloo_recommend", {
      target_type: "artist",
      signals: [ARTIST_ID],
      limit: 5,
    });
    const heatId = JSON.parse(heat.text).evidence_id as string;
    const recData = JSON.parse(recs.text);
    const opener = recData.data.find((e: { name: string }) => e.name !== "Fixture Artist");
    const draft = {
      summary: "Agent summary grounded in heatmap results.",
      stops: [
        {
          city: "Seattle",
          country: "United States",
          reason: "Agent reason",
          evidenceIds: [heatId],
          openers: [
            { id: opener.id, overlapNote: "Agent note", evidenceIds: [recData.evidence_id] },
            { id: "invented-id", overlapNote: "made up", evidenceIds: ["ev99"] },
          ],
        },
        {
          city: "Atlantis",
          country: "Nowhere",
          reason: "invented",
          evidenceIds: [heatId],
          openers: [],
        },
        {
          city: "Chicago",
          country: "United States",
          reason: "Agent reason 2",
          evidenceIds: [heatId, "ev77"],
          openers: [],
        },
      ],
      openerSpotlight: null,
      merchIdeas: [{ idea: "Unsupported idea", basedOn: [], evidenceIds: ["ev88"] }],
    };
    return {
      text: `Here is the plan:\n${JSON.stringify(draft)}`,
      toolCalls: 2,
      turns: 2,
      stopReason: "end_turn",
    };
  }
  async complete() {
    return "{}";
  }
}

describe("runPlan (agent path, fake LLM)", () => {
  it("keeps grounded agent choices and drops invented cities, artists and evidence", async () => {
    const { emit } = collect();
    const plan = await runPlan(
      { artist: "Fixture Artist", region: "north-america" },
      { qloo: fakeCaller(), llm: new FakeLlm(), now },
      emit,
    );
    expect(plan?.mode).toBe("agent");
    if (!plan) return;
    expect(plan.summary).toBe("Agent summary grounded in heatmap results.");
    expect(plan.stops.find((s) => s.city === "Seattle")?.reason).toBe("Agent reason");
    expect(plan.stops.find((s) => s.city === "Chicago")?.reason).toBe("Agent reason 2");
    // The server routes the stops: country by country, renumbered from 1.
    expect(plan.stops.map((s) => s.order)).toEqual(plan.stops.map((_, i) => i + 1));
    const areas = plan.stops.map((s) => s.area);
    expect(areas.lastIndexOf("United States")).toBeLessThan(areas.indexOf("Canada"));
    expect(plan.stops.some((s) => s.city === "Atlantis")).toBe(false);
    expect(plan.stops.find((s) => s.city === "Chicago")?.evidenceIds).not.toContain("ev77");
    expect(plan.stops.flatMap((s) => s.openers).some((o) => o.id === "invented-id")).toBe(false);
    expect(plan.limitations.some((l) => l.includes("dropped"))).toBe(true);
    // The ungrounded merch idea is replaced by evidence-backed suggestions.
    expect(
      plan.merchIdeas.every((m) =>
        m.evidenceIds.every((id) => plan.evidence.some((e) => e.id === id)),
      ),
    ).toBe(true);
    // Unknown argument keys from the model never reach Qloo.
    expect(
      JSON.stringify(plan.evidence.find((e) => e.tool === "qloo_where_popular")?.inputRedacted),
    ).not.toContain("bogus");
  });

  it("falls back to the deterministic planner when the agent fails", async () => {
    const broken: LlmProvider = {
      id: "x",
      model: "x",
      runLoop: async () => {
        throw new Error("boom");
      },
      complete: async () => "",
    };
    const plan = await runPlan(
      { artist: "Fixture Artist" },
      { qloo: fakeCaller(), llm: broken, now },
      () => undefined,
    );
    expect(plan?.mode).toBe("deterministic");
    expect(plan?.notices.some((n) => n.message.includes("agent was unavailable"))).toBe(true);
  });
});

describe("runPlan time budget", () => {
  it("still builds a plan after the agent uses up the run's time", async () => {
    const realNow = Date.now;
    let skew = 0;
    const slow: LlmProvider = {
      id: "slow",
      model: "slow",
      runLoop: async () => {
        skew = 100_000; // the agent "took" longer than the whole run budget
        throw new Error("Request timed out");
      },
      complete: async () => "",
    };
    Date.now = () => realNow() + skew;
    try {
      const plan = await runPlan(
        { artist: "Fixture Artist" },
        { qloo: fakeCaller(), llm: slow, now },
        () => undefined,
      );
      expect(plan?.mode).toBe("deterministic");
      expect(plan?.stops.length).toBeGreaterThan(0);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("runPlan across several countries", () => {
  it("picks cities country by country and labels in-country ranks", async () => {
    const plan = await runPlan(
      { artist: "Fixture Artist", region: "worldwide" },
      { qloo: fakeCaller(), llm: null, now },
      () => undefined,
    );
    expect(plan).not.toBeNull();
    if (!plan) return;
    const areas = plan.stops.map((s) => s.area);
    // Every searched country with heat data gets at least one stop.
    for (const area of ["United States", "United Kingdom", "Germany", "Nigeria", "Australia"]) {
      expect(areas).toContain(area);
    }
    // Route stays grouped by country, in search order.
    const order = [...new Set(areas)];
    expect(order).toEqual(["United States", "United Kingdom", "Germany", "Nigeria", "Australia"]);
    // Ranks are within each country.
    expect(plan.stops.find((s) => s.city === "London")?.demandRank).toBe(1);
    expect(plan.stops.find((s) => s.city === "Berlin")?.demandRank).toBe(1);
    expect(plan.summary).toMatch(/^Within each country searched/);
    expect(
      plan.notices.some((n) => n.message.includes("each country's heatmap on its own scale")),
    ).toBe(true);
  });

  it("keeps single-country plans on one global ranking", async () => {
    const plan = await runPlan(
      { artist: "Fixture Artist", region: "us" },
      { qloo: fakeCaller(), llm: null, now },
      () => undefined,
    );
    expect(plan?.stops.every((s) => s.area === undefined)).toBe(true);
  });
});
