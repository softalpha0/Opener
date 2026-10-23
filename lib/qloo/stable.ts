import { createHash } from "node:crypto";

/** Normalize tool arguments so equivalent requests share a cache key. */
export function normalizeArgs(value: unknown): unknown {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ").toLowerCase();
  if (Array.isArray(value)) return value.map(normalizeArgs);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeArgs(v)]),
    );
  }
  return value;
}

export function cacheKey(tool: string, args: unknown): string {
  return createHash("sha256")
    .update(`${tool}\n${JSON.stringify(normalizeArgs(args))}`)
    .digest("hex");
}
