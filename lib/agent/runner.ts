import { log } from "../log";
import { hasResults } from "../qloo/envelope";
import {
  parseAlternatives,
  parseEntities,
  parseHeatmap,
  parseResolutionIssues,
} from "../qloo/parse";
import { isWorkflowTool, type WorkflowTool } from "../qloo/tools";
import type { ToolArgs, ToolDescriptor } from "../qloo/types";
import { citiesFromHeat } from "../plan/cities";
import { regionById } from "../plan/regions";
import {
  AgentDraftSchema,
  TourPlanSchema,
  type AgentDraft,
  type PlanEvent,
  type TourPlan,
} from "../plan/schema";
import { composePlan, spotlightCandidate } from "./compose";
import { digestForModel } from "./digest";
import {
  cityDemand,
  ensureAudience,
  ensureCompare,
  ensureCrossover,
  ensureHeat,
  ensureOpeners,
  type ArtistRef,
} from "./gather";
import type { LlmProvider } from "./llm";
import { AGENT_SYSTEM_PROMPT, REPAIR_SYSTEM_PROMPT, agentPrompt, extractJson } from "./prompt";
import { Toolbox, type QlooCaller } from "./toolbox";

export const MAX_QLOO_CALLS = 20;
export const AGENT_TIME_MS = 60_000;
const TOTAL_TIME_MS = 95_000;

export interface PlanInput {
  artist: string;
  /** A Qloo entity ID the user picked from candidates; skips name resolution. */
  entityId?: string;
  region?: string;
}

export interface RunnerDeps {
  qloo: QlooCaller & { listTools?: () => Promise<ToolDescriptor[]> };
  llm: LlmProvider | null;
  now?: () => Date;
}

/** Tools the agent may call; describe is done up front, capabilities never touches Qloo. */
const AGENT_TOOLS: WorkflowTool[] = [
  "qloo_where_popular",
  "qloo_recommend",
  "qloo_rank",
  "qloo_compare_audiences",
  "qloo_entity_tags",
  "qloo_audience_demographics",
  "qloo_trends",
  "qloo_find_tags",
];

/** Keep only properties the tool's real inputSchema declares. */
function sanitizeArgs(input: unknown, schema: Record<string, unknown>): ToolArgs | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const props =
    schema.properties && typeof schema.properties === "object"
      ? Object.keys(schema.properties)
      : [];
  const out: ToolArgs = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (props.includes(k)) out[k] = v as ToolArgs[string];
  }
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required.every((r) => out[r] !== undefined) ? out : undefined;
}

async function runAgent(
  llm: LlmProvider,
  box: Toolbox,
  tools: ToolDescriptor[],
  artist: ArtistRef,
  describeId: string,
  within: string[],
  today: Date,
  emit: (e: PlanEvent) => void,
): Promise<{ draft: AgentDraft | null; notice?: string }> {
  const specs = tools.filter((t) => isWorkflowTool(t.name) && AGENT_TOOLS.includes(t.name));
  const schemaOf = new Map(specs.map((t) => [t.name, t.inputSchema]));
  const deadline = Date.now() + AGENT_TIME_MS;
  emit({ type: "status", message: `Agent (${llm.model}) is planning the route` });

  const result = await llm.runLoop({
    system: AGENT_SYSTEM_PROMPT,
    prompt: agentPrompt({
      artistName: artist.name,
      artistId: artist.id,
      describeEvidenceId: describeId,
      within,
      today: today.toISOString().slice(0, 10),
      maxToolCalls: box.remainingCalls(),
    }),
    tools: specs.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    maxToolCalls: box.remainingCalls(),
    deadline,
    async execute(name, input) {
      const schema = schemaOf.get(name);
      if (!schema || !isWorkflowTool(name)) return { text: `Unknown tool ${name}.`, isError: true };
      const args = sanitizeArgs(input, schema);
      if (!args) return { text: "Missing required arguments for this tool.", isError: true };
      const call = await box.callRaw(
        name,
        args,
        `Agent: ${name.replace("qloo_", "").replace(/_/g, " ")}`,
      );
      return {
        text: call.id ? digestForModel(call.id, name, call.envelope) : call.envelope.summary,
        isError: call.envelope.status === "error",
      };
    },
  });

  let parsed = AgentDraftSchema.safeParse(extractJson(result.text));
  if (!parsed.success) {
    log("warn", "agent draft failed validation; attempting one repair", {
      issues: parsed.error.issues.slice(0, 5),
    });
    try {
      const repaired = await llm.complete(
        REPAIR_SYSTEM_PROMPT,
        `Required shape (JSON Schema):\n${JSON.stringify(AgentDraftSchema.toJSONSchema())}\n\nValidation errors:\n${JSON.stringify(parsed.error.issues.slice(0, 10))}\n\nOriginal:\n${result.text.slice(0, 12_000)}`,
        Date.now() + 20_000,
      );
      parsed = AgentDraftSchema.safeParse(extractJson(repaired));
    } catch (error) {
      log("warn", "agent repair pass failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!parsed.success) {
    return {
      draft: null,
      notice:
        "The agent's answer did not pass validation, so this plan was assembled by the deterministic planner from the same Qloo results.",
    };
  }
  return { draft: parsed.data };
}

/**
 * Run one plan. Streams progress through `emit` and resolves with the plan, or null when
 * the run ended early (ambiguous artist, no match, or an error that was already emitted).
 */
export async function runPlan(
  input: PlanInput,
  deps: RunnerDeps,
  emit: (e: PlanEvent) => void,
): Promise<TourPlan | null> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const region = regionById(input.region);
  const query = {
    artistInput: input.artist,
    region: region.id,
    regionLabel: region.label,
    within: region.within,
  };

  const forward = (event: PlanEvent) => {
    emit(event);
    if (
      event.type === "tool" &&
      event.phase === "end" &&
      event.evidence.tool === "qloo_where_popular"
    ) {
      const call = box.get(event.evidence.id);
      if (call && hasResults(call.envelope)) {
        const points = parseHeatmap(call.envelope.results);
        emit({
          type: "heat",
          points: points.map((p) => ({ lat: p.lat, lng: p.lng, affinity: p.affinity })),
          cities: citiesFromHeat(points)
            .slice(0, 10)
            .map((c) => ({
              city: c.city.n,
              country: c.city.c,
              lat: c.city.lat,
              lng: c.city.lng,
              affinity: c.affinity,
            })),
        });
      }
    }
  };
  // `forward` only runs after construction, so referencing `box` inside it is safe.
  const box: Toolbox = new Toolbox(deps.qloo, forward, {
    maxCalls: MAX_QLOO_CALLS,
    deadline: Date.now() + TOTAL_TIME_MS,
  });

  // 1. Resolve the artist. Never auto-pick when Qloo says the name is ambiguous.
  emit({ type: "status", message: `Resolving “${input.artist}” in Qloo` });
  const describe = await box.call(
    "qloo_describe",
    { entity: input.entityId ?? input.artist, type: "artist" },
    `Resolve “${input.artist}” to a Qloo artist`,
  );
  const env = describe.envelope;
  if (env.status === "needs_input") {
    const issues = parseResolutionIssues(env);
    const candidates = issues.flatMap((i) => i.candidates);
    if (candidates.length) {
      emit({ type: "needs_input", input: input.artist, summary: env.summary, candidates });
    } else {
      emit({
        type: "empty",
        message: `Qloo couldn't find an artist called “${input.artist}”. Check the spelling or try their best-known name.`,
      });
    }
    return null;
  }
  if (env.status === "empty") {
    emit({
      type: "empty",
      message: `Qloo couldn't find an artist called “${input.artist}”. Check the spelling or try their best-known name.`,
    });
    return null;
  }
  if (env.status === "error") {
    emit({
      type: "error",
      code: env.error?.code ?? "UNKNOWN",
      message: env.summary,
      recovery: env.error?.recovery ?? "Try again later.",
      retryable: env.error?.retryable ?? false,
    });
    return null;
  }
  const entity = parseEntities(env.results)[0];
  if (!entity) {
    emit({ type: "empty", message: `Qloo returned no artist details for “${input.artist}”.` });
    return null;
  }
  const artist: ArtistRef = { id: entity.id, name: entity.name };
  const notices: TourPlan["notices"] = [];

  // 2. Agent loop (when an LLM is configured).
  let draft: AgentDraft | null = null;
  let mode: TourPlan["mode"] = "deterministic";
  if (deps.llm) {
    try {
      const tools = (await deps.qloo.listTools?.()) ?? [];
      const outcome = await runAgent(
        deps.llm,
        box,
        tools,
        artist,
        describe.id,
        region.within,
        startedAt,
        emit,
      );
      draft = outcome.draft;
      if (draft) mode = "agent";
      if (outcome.notice) notices.push({ level: "info", message: outcome.notice });
    } catch (error) {
      log("warn", "agent loop failed; continuing with deterministic planner", {
        error: error instanceof Error ? error.message : String(error),
      });
      notices.push({
        level: "info",
        message:
          "The agent was unavailable for this run, so the plan was assembled by the deterministic planner.",
      });
    }
  }

  // 3. Fill any gaps with the fixed tool chain (also the whole plan when no LLM is configured).
  emit({
    type: "status",
    message: draft
      ? "Checking the agent's plan against Qloo results"
      : "Mapping demand and building the route",
  });
  await ensureHeat(box, artist, region.within);
  const demand = cityDemand(box, artist);
  const heat = box.byTool("qloo_where_popular");
  if (!demand.length && heat.length && heat.every((c) => c.envelope.status === "error")) {
    const first = heat[0]?.envelope;
    emit({
      type: "error",
      code: first?.error?.code ?? "UNKNOWN",
      message: first?.summary ?? "Qloo heatmaps failed.",
      recovery: first?.error?.recovery ?? "Try again later.",
      retryable: first?.error?.retryable ?? false,
    });
    return null;
  }
  await Promise.all([
    ensureOpeners(box, artist, demand),
    ensureAudience(box, artist, startedAt),
    ensureCrossover(box, artist, demand[0]),
  ]);
  await ensureCompare(box, artist, spotlightCandidate(box, artist));

  // 4. Compose and validate.
  const plan = composePlan({
    box,
    artist: entity,
    describeId: describe.id,
    alternatives: parseAlternatives(env),
    query,
    draft,
    mode,
    ...(deps.llm && mode === "agent" ? { model: deps.llm.model } : {}),
    extraNotices: notices,
    now: now(),
  });
  const checked = TourPlanSchema.safeParse(plan);
  if (!checked.success) {
    log("error", "composed plan failed schema validation", {
      issues: checked.error.issues.slice(0, 5),
    });
    emit({
      type: "error",
      code: "PLAN_INVALID",
      message: "Opener couldn't assemble a valid plan from these results.",
      recovery: "Try again, or pick a different region.",
      retryable: false,
    });
    return null;
  }
  emit({ type: "plan", plan: checked.data });
  return checked.data;
}
