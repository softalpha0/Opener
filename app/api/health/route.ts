import { harnessVersion } from "@/lib/qloo/client";
import { getQloo, serverState } from "@/lib/server";
import { listSavedSamples } from "@/lib/samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness for Render's health check. Reports state only; never secrets. */
export async function GET() {
  const state = serverState();
  const qloo = getQloo();
  const [ready, version] = await Promise.all([qloo.readiness(), harnessVersion()]);
  return Response.json(
    {
      qloo: ready.qloo,
      harnessVersion: version,
      tools: ready.tools,
      ...(ready.error ? { detail: ready.error } : {}),
      planner: state.llm
        ? { mode: "agent", provider: state.llm.id, model: state.llm.model }
        : { mode: "deterministic" },
      cache: { tools: qloo.stats(), plans: state.plans.stats() },
      savedSamples: listSavedSamples().length,
      uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
