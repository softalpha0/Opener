import { TtlCache, cacheDir, cacheTtlMs } from "./qloo/cache";
import { getQloo } from "./qloo/client";
import { stableKeyFor } from "./plan/key";
import type { GenericTour } from "./plan/generic";
import type { TourPlan } from "./plan/schema";
import { createLlmProvider, type LlmProvider } from "./agent/llm";
import { SlidingWindowLimiter } from "./rate-limit";

interface ServerState {
  plans: TtlCache<TourPlan>;
  generic: TtlCache<GenericTour>;
  planLimiter: SlidingWindowLimiter;
  resolveLimiter: SlidingWindowLimiter;
  genericLimiter: SlidingWindowLimiter;
  llm: LlmProvider | null;
  startedAt: number;
}

const g = globalThis as unknown as { __openerServer?: ServerState };

/** Process-wide server state shared across route modules. */
export function serverState(): ServerState {
  if (!g.__openerServer) {
    const perMinute = Number(process.env.OPENER_RATE_LIMIT_PER_MINUTE) || 5;
    g.__openerServer = {
      plans: new TtlCache<TourPlan>({
        namespace: "plans",
        ttlMs: cacheTtlMs(),
        maxEntries: 200,
        dir: cacheDir(),
      }),
      generic: new TtlCache<GenericTour>({
        namespace: "generic",
        ttlMs: cacheTtlMs(),
        maxEntries: 200,
        dir: cacheDir(),
      }),
      planLimiter: new SlidingWindowLimiter(perMinute, 60_000),
      resolveLimiter: new SlidingWindowLimiter(30, 60_000),
      genericLimiter: new SlidingWindowLimiter(perMinute, 60_000),
      llm: createLlmProvider(),
      startedAt: Date.now(),
    };
    // Optional warm-up of the sample artists, started by the first request after boot
    // (Render's health check hits /api/health within seconds of start).
    if (process.env.OPENER_WARM_ON_START === "true") {
      void import("./warm").then(({ warmInBackground }) => warmInBackground());
    }
  }
  return g.__openerServer;
}

export { getQloo, stableKeyFor };
