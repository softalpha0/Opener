import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TtlCache } from "@/lib/qloo/cache";
import { cacheKey, normalizeArgs } from "@/lib/qloo/stable";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "opener-cache-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("TtlCache", () => {
  it("returns stored values and counts hits and misses", () => {
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000, maxEntries: 10 });
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", 1);
    expect(cache.get("a")?.value).toBe(1);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, memoryEntries: 1 });
  });

  it("expires entries after the TTL", () => {
    let now = 0;
    const cache = new TtlCache<string>({
      namespace: "t",
      ttlMs: 100,
      maxEntries: 10,
      now: () => now,
    });
    cache.set("k", "v");
    now = 99;
    expect(cache.get("k")?.value).toBe("v");
    now = 101;
    expect(cache.get("k")).toBeUndefined();
  });

  it("evicts the least recently used entry", () => {
    const cache = new TtlCache<number>({ namespace: "t", ttlMs: 1000, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")?.value).toBe(1);
  });

  it("persists to disk so a new instance (restart) can read it", () => {
    const dir = tmp();
    const key = cacheKey("qloo_describe", { entity: "x" });
    new TtlCache<{ v: number }>({ namespace: "tools", ttlMs: 10_000, maxEntries: 5, dir }).set(
      key,
      { v: 7 },
    );
    const reloaded = new TtlCache<{ v: number }>({
      namespace: "tools",
      ttlMs: 10_000,
      maxEntries: 5,
      dir,
    });
    expect(reloaded.get(key)?.value).toEqual({ v: 7 });
    expect(readdirSync(join(dir, "tools"))).toHaveLength(1);
  });

  it("drops expired disk entries", () => {
    const dir = tmp();
    let now = 0;
    const key = cacheKey("t", {});
    new TtlCache<number>({ namespace: "n", ttlMs: 10, maxEntries: 5, dir, now: () => now }).set(
      key,
      1,
    );
    now = 50;
    const reloaded = new TtlCache<number>({
      namespace: "n",
      ttlMs: 10,
      maxEntries: 5,
      dir,
      now: () => now,
    });
    expect(reloaded.get(key)).toBeUndefined();
    expect(readdirSync(join(dir, "n"))).toHaveLength(0);
  });

  it("never writes files for unsafe keys", () => {
    const dir = tmp();
    const cache = new TtlCache<number>({ namespace: "n", ttlMs: 10_000, maxEntries: 5, dir });
    cache.set("../escape", 1);
    expect(readdirSync(join(dir, "n"))).toHaveLength(0);
    expect(cache.get("../escape")?.value).toBe(1);
  });
});

describe("cache keys", () => {
  it("ignores key order, case, whitespace and undefined values", () => {
    expect(cacheKey("tool", { b: [" Phoebe  Bridgers "], a: 1, c: undefined })).toBe(
      cacheKey("tool", { a: 1, b: ["phoebe bridgers"] }),
    );
    expect(normalizeArgs({ z: "A", a: "B" })).toEqual({ a: "b", z: "a" });
  });

  it("separates tools and arguments", () => {
    expect(cacheKey("qloo_describe", { entity: "x" })).not.toBe(
      cacheKey("qloo_where_popular", { entity: "x" }),
    );
    expect(cacheKey("t", { within: "Canada" })).not.toBe(cacheKey("t", { within: "Mexico" }));
  });
});
