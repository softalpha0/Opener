import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runPlan } from "./agent/runner";
import { log } from "./log";
import { stableKeyFor } from "./plan/key";
import type { PlanEvent, TourPlan } from "./plan/schema";
import { getQloo, serverState } from "./server";
import { SAMPLE_ARTISTS, SAMPLES_DIR } from "./samples";

export interface WarmResult {
  slug: string;
  ok: boolean;
  detail: string;
}

/**
 * Run each sample artist once so its Qloo results and plan sit in the 24h cache.
 * With `writeSamples`, also save each plan to data/samples/<slug>.json, labelled as saved.
 */
export async function warmSamples(options: {
  writeSamples: boolean;
  onEvent?: (slug: string, e: PlanEvent) => void;
}): Promise<WarmResult[]> {
  const state = serverState();
  const results: WarmResult[] = [];
  for (const sample of SAMPLE_ARTISTS) {
    const input = { artist: sample.name, region: sample.region };
    const key = stableKeyFor(input);
    if (!options.writeSamples && state.plans.get(key)) {
      results.push({ slug: sample.slug, ok: true, detail: "already cached" });
      continue;
    }
    let failure = "";
    const plan: TourPlan | null = await runPlan(input, { qloo: getQloo(), llm: state.llm }, (e) => {
      options.onEvent?.(sample.slug, e);
      if (e.type === "error") failure = `${e.code}: ${e.message}`;
      if (e.type === "needs_input")
        failure = `ambiguous name (${e.candidates.length} candidates); pick an ID in lib/samples.ts`;
      if (e.type === "empty") failure = e.message;
    });
    if (!plan) {
      results.push({ slug: sample.slug, ok: false, detail: failure || "no plan" });
      continue;
    }
    state.plans.set(key, plan);
    if (options.writeSamples) {
      mkdirSync(SAMPLES_DIR, { recursive: true });
      const saved: TourPlan = {
        ...plan,
        saved: { savedAt: new Date().toISOString(), label: `Saved plan for ${plan.artist.name}` },
      };
      writeFileSync(
        join(SAMPLES_DIR, `${sample.slug}.json`),
        `${JSON.stringify(saved, null, 2)}\n`,
      );
    }
    results.push({
      slug: sample.slug,
      ok: true,
      detail: `${plan.stops.length} stops, ${plan.evidence.length} Qloo calls, ${plan.mode}`,
    });
  }
  return results;
}

/** Background warm-up on server start (OPENER_WARM_ON_START=true). Never throws. */
export function warmInBackground(): void {
  setTimeout(() => {
    warmSamples({ writeSamples: false })
      .then((r) => log("info", "sample cache warm-up finished", { results: r }))
      .catch((error) =>
        log("warn", "sample cache warm-up failed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }, 5_000).unref?.();
}
