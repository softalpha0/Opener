import { describe, expect, it } from "vitest";
import { AgentDraftSchema, TourPlanSchema } from "@/lib/plan/schema";
import fixture from "../fixtures/samples/fixture-artist.json";

describe("TourPlanSchema", () => {
  it("accepts the fixture plan", () => {
    const parsed = TourPlanSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed evidence IDs", () => {
    const bad = structuredClone(fixture);
    bad.stops[0]!.evidenceIds = ["evidence-1"];
    expect(TourPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("requires every stop to cite at least one Qloo call", () => {
    const bad = structuredClone(fixture);
    bad.stops[0]!.evidenceIds = [];
    expect(TourPlanSchema.safeParse(bad).success).toBe(false);
  });

  it("only allows known momentum directions", () => {
    const bad = structuredClone(fixture) as { momentum: { direction: string } };
    bad.momentum.direction = "exploding";
    expect(TourPlanSchema.safeParse(bad).success).toBe(false);
  });
});

describe("AgentDraftSchema", () => {
  const draft = {
    summary: "Strong audience affinity around two cities.",
    stops: [
      {
        city: "Chicago",
        country: "United States",
        reason: "Top heat cell.",
        evidenceIds: ["ev2"],
        openers: [{ id: "x", overlapNote: "Recommended.", evidenceIds: ["ev4"] }],
      },
    ],
    openerSpotlight: null,
    merchIdeas: [],
  };

  it("accepts a well-formed draft", () => {
    expect(AgentDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("caps stops at 8 and openers at 4", () => {
    expect(
      AgentDraftSchema.safeParse({ ...draft, stops: Array(9).fill(draft.stops[0]) }).success,
    ).toBe(false);
    const many = { ...draft.stops[0], openers: Array(5).fill(draft.stops[0]!.openers[0]) };
    expect(AgentDraftSchema.safeParse({ ...draft, stops: [many] }).success).toBe(false);
  });

  it("rejects reasons without evidence", () => {
    expect(
      AgentDraftSchema.safeParse({ ...draft, stops: [{ ...draft.stops[0], evidenceIds: [] }] })
        .success,
    ).toBe(false);
  });
});
