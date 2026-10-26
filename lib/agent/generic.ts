import { log } from "../log";
import { cacheKey } from "../qloo/stable";
import type { TtlCache } from "../qloo/cache";
import {
  GENERIC_SYSTEM,
  genericPrompt,
  parseGenericReply,
  populationBaseline,
  type GenericTour,
} from "../plan/generic";
import type { TourPlan } from "../plan/schema";
import type { LlmProvider } from "./llm";

const GENERIC_TIME_MS = 30_000;

/**
 * The "without Qloo" tour for a plan. The model gets only the artist name and the countries:
 * no tools and no Qloo data. Falls back to a population baseline when no LLM is configured
 * or the call fails, and says so.
 */
export async function genericTour(
  plan: TourPlan,
  llm: LlmProvider | null,
  cache: TtlCache<GenericTour>,
): Promise<GenericTour> {
  const count = Math.max(plan.stops.length, 5);
  const { regionLabel, within } = plan.query;
  const key = cacheKey("generic", {
    v: 2,
    artist: plan.artist.name.toLowerCase(),
    within,
    count,
    model: llm?.model ?? "population",
  });
  const hit = cache.get(key);
  if (hit) return hit.value;

  const baseline = (note: string): GenericTour => ({
    source: "population",
    generatedAt: new Date().toISOString(),
    stops: populationBaseline(within, count),
    note,
  });

  let tour: GenericTour;
  if (!llm) {
    tour = baseline(
      "No LLM key is configured, so the generic tour is the largest cities by population.",
    );
  } else {
    try {
      const text = await llm.complete(
        GENERIC_SYSTEM,
        genericPrompt(plan.artist.name, regionLabel, within, count),
        Date.now() + GENERIC_TIME_MS,
      );
      const stops = parseGenericReply(text);
      tour = stops.length
        ? { source: "llm", model: llm.model, generatedAt: new Date().toISOString(), stops }
        : baseline(
            "The model's reply had no usable city list, so this is the population baseline.",
          );
    } catch (error) {
      log("warn", "generic tour failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't cache a fallback caused by a transient model error.
      return baseline(
        "The model was unavailable (busy or out of free quota), so this is the population baseline.",
      );
    }
  }
  cache.set(key, tour);
  return tour;
}
