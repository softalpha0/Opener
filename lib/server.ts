import { TtlCache, cacheDir, cacheTtlMs } from "./qloo/cache";
import { getQloo } from "./qloo/client";
import { stableKeyFor } from "./plan/key";
import type { TourPlan } from "./plan/schema";
import { createLlmProvider, type LlmProvider } from "./agent/llm";
import { SlidingWindowLimiter } from "./rate-limit";

interface ServerState {
  plans: TtlCache<TourPlan>;
  planLimiter: SlidingWindowLimiter;
  resolveLimiter: SlidingWindowLimiter;
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
      planLimiter: new SlidingWindowLimiter(perMinute, 60_000),
      resolveLimiter: new SlidingWindowLimiter(30, 60_000),
      llm: createLlmProvider(),
      startedAt: Date.now(),
    };
  }
  return g.__openerServer;
}

export { getQloo, stableKeyFor };
