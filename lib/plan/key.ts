import { cacheKey } from "../qloo/stable";

/** Cache key for a whole plan: the chosen entity (or typed name) plus region. */
export function stableKeyFor(input: { artist: string; entityId?: string; region: string }): string {
  return cacheKey("plan", { who: input.entityId ?? input.artist, region: input.region });
}
