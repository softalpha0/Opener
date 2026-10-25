import { z } from "zod";

export const EVIDENCE_ID = /^ev\d{1,3}$/;
const evidenceId = z.string().regex(EVIDENCE_ID);

export const EvidenceSchema = z.object({
  id: evidenceId,
  tool: z.string(),
  purpose: z.string(),
  inputRedacted: z.record(z.string(), z.unknown()),
  status: z.enum(["ok", "empty", "needs_input", "partial", "degraded", "error"]),
  summary: z.string(),
  resultCount: z.number().int().nonnegative(),
  fetchedAt: z.string(),
  cached: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
  keyFields: z.unknown().optional(),
  warnings: z.array(z.string()).default([]),
  errorCode: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const OpenerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().url().optional(),
  affinity: z.number().optional(),
  overlapNote: z.string(),
  evidenceIds: z.array(evidenceId).min(1),
});
export type Opener = z.infer<typeof OpenerSchema>;

export const StopSchema = z.object({
  order: z.number().int().positive(),
  /** Heatmap rank: global for one area, within `area` when several areas were searched. */
  demandRank: z.number().int().positive(),
  area: z.string().optional(),
  /** How many cities Opener derived from that area's heatmap (the N in "#2 of N"). */
  areaCities: z.number().int().positive().optional(),
  city: z.string(),
  region: z.string(),
  country: z.string(),
  countryCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  affinityScore: z.number().optional(),
  heatCells: z.number().int().nonnegative().optional(),
  reason: z.string(),
  evidenceIds: z.array(evidenceId).min(1),
  openers: z.array(OpenerSchema),
});
export type Stop = z.infer<typeof StopSchema>;

export const CROSSOVER_CATEGORIES = [
  "brand",
  "movie",
  "tv_show",
  "podcast",
  "place",
  "book",
  "videogame",
] as const;

export const TourPlanSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string(),
  mode: z.enum(["agent", "deterministic"]),
  model: z.string().optional(),
  query: z.object({
    artistInput: z.string(),
    region: z.string(),
    regionLabel: z.string(),
    within: z.array(z.string()),
  }),
  artist: z.object({
    id: z.string(),
    name: z.string(),
    image: z.string().url().optional(),
    description: z.string().optional(),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
    alternatives: z.array(
      z.object({ id: z.string(), name: z.string(), description: z.string().optional() }),
    ),
    evidenceIds: z.array(evidenceId).min(1),
  }),
  /** Agent interpretation, always labelled as such in the UI. */
  summary: z.string(),
  momentum: z.object({
    direction: z.enum(["rising", "steady", "falling", "unknown"]),
    note: z.string(),
    evidenceId: evidenceId.nullable(),
    series: z.array(z.object({ date: z.string(), value: z.number() })),
  }),
  demographics: z.object({
    items: z.array(
      z.object({ group: z.enum(["age", "gender"]), label: z.string(), value: z.number() }),
    ),
    evidenceId: evidenceId.nullable(),
  }),
  stops: z.array(StopSchema),
  heat: z.array(
    z.object({
      lat: z.number(),
      lng: z.number(),
      affinity: z.number(),
      popularity: z.number().optional(),
      evidenceId,
    }),
  ),
  openerSpotlight: z
    .object({
      openerId: z.string(),
      openerName: z.string(),
      note: z.string(),
      shared: z.array(z.object({ name: z.string(), type: z.string().optional() })),
      evidenceIds: z.array(evidenceId).min(1),
    })
    .nullable(),
  crossover: z.array(
    z.object({
      category: z.enum(CROSSOVER_CATEGORIES),
      label: z.string(),
      items: z.array(
        z.object({ id: z.string(), name: z.string(), image: z.string().url().optional() }),
      ),
      evidenceId,
    }),
  ),
  /** Agent interpretation, labelled "Agent suggestion" in the UI. */
  merchIdeas: z.array(
    z.object({
      idea: z.string(),
      basedOn: z.array(z.string()),
      evidenceIds: z.array(evidenceId).min(1),
    }),
  ),
  evidence: z.array(EvidenceSchema),
  notices: z.array(
    z.object({
      level: z.enum(["info", "partial", "degraded"]),
      message: z.string(),
      evidenceId: evidenceId.optional(),
    }),
  ),
  limitations: z.array(z.string()),
  saved: z.object({ savedAt: z.string(), label: z.string() }).optional(),
});
export type TourPlan = z.infer<typeof TourPlanSchema>;

/** What the LLM writes. The server hydrates it into a TourPlan and drops anything ungrounded. */
export const AgentDraftSchema = z.object({
  summary: z.string().min(1).max(700),
  stops: z
    .array(
      z.object({
        city: z.string(),
        country: z.string(),
        reason: z.string().min(1).max(300),
        evidenceIds: z.array(evidenceId).min(1),
        openers: z
          .array(
            z.object({
              id: z.string(),
              overlapNote: z.string().min(1).max(240),
              evidenceIds: z.array(evidenceId).min(1),
            }),
          )
          .max(4),
      }),
    )
    .min(1)
    .max(8),
  openerSpotlight: z
    .object({
      openerId: z.string(),
      note: z.string().max(300),
      evidenceIds: z.array(evidenceId).min(1),
    })
    .nullable()
    .optional(),
  merchIdeas: z
    .array(
      z.object({
        idea: z.string().max(240),
        basedOn: z.array(z.string()).max(5),
        evidenceIds: z.array(evidenceId).min(1),
      }),
    )
    .max(4),
});
export type AgentDraft = z.infer<typeof AgentDraftSchema>;

/** The agent's steps, shown live in the UI with their status and duration. */
export const PLAN_STAGES = [
  { id: "resolve", label: "Understand the artist" },
  { id: "query", label: "Query Qloo" },
  { id: "rank", label: "Rank cities and pick openers" },
  { id: "compose", label: "Build the route and check the write-up" },
] as const;
export type PlanStageId = (typeof PLAN_STAGES)[number]["id"];

/** Server-sent events streamed by POST /api/plan. */
export type PlanEvent =
  | { type: "status"; message: string }
  | { type: "stage"; id: PlanStageId; state: "start" | "done"; ms?: number; detail?: string }
  | {
      type: "tool";
      phase: "start" | "end";
      evidence: Partial<Evidence> & { id: string; tool: string; purpose: string };
    }
  | {
      type: "heat";
      points: Array<{ lat: number; lng: number; affinity: number }>;
      cities: Array<{ city: string; country: string; lat: number; lng: number; affinity: number }>;
    }
  | {
      type: "needs_input";
      input: string;
      summary: string;
      candidates: Array<{
        id: string;
        name: string;
        type?: string;
        description?: string;
        popularity?: number;
      }>;
    }
  | { type: "empty"; message: string }
  | { type: "plan"; plan: TourPlan }
  | { type: "error"; code: string; message: string; recovery: string; retryable: boolean }
  | { type: "done" };
