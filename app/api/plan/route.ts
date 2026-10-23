import { runPlan } from "@/lib/agent/runner";
import { log } from "@/lib/log";
import { PlanRequestSchema } from "@/lib/plan/input";
import { DEFAULT_REGION } from "@/lib/plan/regions";
import type { PlanEvent } from "@/lib/plan/schema";
import { clientIp } from "@/lib/rate-limit";
import { getQloo, serverState, stableKeyFor } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** POST {artist, region?, entityId?} → text/event-stream of PlanEvent objects. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Send JSON like {"artist": "Artist Name"}.' });
  }
  const parsed = PlanRequestSchema.safeParse(body);
  if (!parsed.success)
    return json(400, { error: parsed.error.issues[0]?.message ?? "Invalid request." });
  const input = { ...parsed.data, region: parsed.data.region ?? DEFAULT_REGION };

  const state = serverState();
  const key = stableKeyFor(input);
  const cached = state.plans.get(key);

  // Cached plans cost no Qloo quota, so they skip the rate limit (shared links stay fast).
  if (!cached) {
    const limit = state.planLimiter.check(clientIp(request.headers));
    if (!limit.allowed) {
      return json(
        429,
        {
          error: "rate_limited",
          message: `You can start ${process.env.OPENER_RATE_LIMIT_PER_MINUTE || 5} plans a minute. Try again in ${limit.retryAfterSeconds}s.`,
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PlanEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const keepAlive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 10_000);
      try {
        if (cached) {
          send({
            type: "status",
            message: `Loaded a cached plan generated ${new Date(cached.storedAt).toUTCString()}`,
          });
          send({ type: "plan", plan: cached.value });
        } else {
          const plan = await runPlan(input, { qloo: getQloo(), llm: state.llm }, send);
          if (plan) state.plans.set(key, plan);
        }
      } catch (error) {
        log("error", "plan run failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        send({
          type: "error",
          code: "INTERNAL",
          message: "Something went wrong while building the plan.",
          recovery: "Try again in a moment.",
          retryable: true,
        });
      } finally {
        clearInterval(keepAlive);
        send({ type: "done" });
        if (!closed) controller.close();
        closed = true;
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
