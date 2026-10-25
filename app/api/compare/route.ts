import { genericTour } from "@/lib/agent/generic";
import { log } from "@/lib/log";
import { compareTours } from "@/lib/plan/generic";
import { TourPlanSchema } from "@/lib/plan/schema";
import { clientIp } from "@/lib/rate-limit";
import { serverState } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 2_000_000;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

/**
 * POST {plan} → {comparison}. Builds the "without Qloo" tour for the plan's artist and
 * region, then ranks each of its cities against the Qloo heatmap data already in the plan.
 * Makes no Qloo calls; at most one LLM call per artist and region per 24h (cached).
 */
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: "Plan is too large." });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'Send JSON like {"plan": {...}}.' });
  }
  const parsed = TourPlanSchema.safeParse((body as { plan?: unknown } | null)?.plan);
  if (!parsed.success) return json(400, { error: "That isn't a valid Opener plan." });

  const state = serverState();
  const limit = state.genericLimiter.check(clientIp(request.headers));
  if (!limit.allowed) {
    return json(
      429,
      {
        error: "rate_limited",
        message: `Too many comparisons. Try again in ${limit.retryAfterSeconds}s.`,
        retryAfterSeconds: limit.retryAfterSeconds,
      },
      { "retry-after": String(limit.retryAfterSeconds) },
    );
  }

  try {
    const generic = await genericTour(parsed.data, state.llm, state.generic);
    return json(200, { comparison: compareTours(parsed.data, generic) });
  } catch (error) {
    log("error", "comparison failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return json(500, { error: "Couldn't build the comparison. Try again in a moment." });
  }
}
