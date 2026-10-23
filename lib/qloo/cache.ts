import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CacheEntry<T> {
  key: string;
  storedAt: number;
  expiresAt: number;
  value: T;
}

export interface CacheStats {
  namespace: string;
  memoryEntries: number;
  diskEntries: number;
  hits: number;
  misses: number;
  ttlHours: number;
}

export interface TtlCacheOptions {
  namespace: string;
  ttlMs: number;
  maxEntries: number;
  /** Directory for the persistent layer. Omit to keep the cache in memory only. */
  dir?: string;
  now?: () => number;
}

/**
 * Two-level cache: an in-memory LRU in front of one JSON file per key on disk,
 * so cached Qloo results survive restarts and redeploys with a persistent disk.
 */
export class TtlCache<T> {
  private readonly memory = new Map<string, CacheEntry<T>>();
  private readonly dir: string | undefined;
  private readonly now: () => number;
  private hits = 0;
  private misses = 0;

  constructor(private readonly options: TtlCacheOptions) {
    this.now = options.now ?? Date.now;
    this.dir = options.dir ? join(options.dir, options.namespace) : undefined;
    if (this.dir) {
      try {
        mkdirSync(this.dir, { recursive: true });
      } catch {
        this.dir = undefined;
      }
    }
  }

  get(key: string): CacheEntry<T> | undefined {
    const now = this.now();
    const inMemory = this.memory.get(key);
    if (inMemory) {
      if (inMemory.expiresAt > now) {
        this.memory.delete(key);
        this.memory.set(key, inMemory);
        this.hits++;
        return inMemory;
      }
      this.memory.delete(key);
    }
    const onDisk = this.readDisk(key);
    if (onDisk && onDisk.expiresAt > now) {
      this.remember(onDisk);
      this.hits++;
      return onDisk;
    }
    if (onDisk) this.deleteDisk(key);
    this.misses++;
    return undefined;
  }

  set(key: string, value: T): CacheEntry<T> {
    const storedAt = this.now();
    const entry: CacheEntry<T> = { key, storedAt, expiresAt: storedAt + this.options.ttlMs, value };
    this.remember(entry);
    this.writeDisk(entry);
    return entry;
  }

  delete(key: string): void {
    this.memory.delete(key);
    this.deleteDisk(key);
  }

  stats(): CacheStats {
    let diskEntries = 0;
    if (this.dir) {
      try {
        diskEntries = readdirSync(this.dir).filter((f) => f.endsWith(".json")).length;
      } catch {
        diskEntries = 0;
      }
    }
    return {
      namespace: this.options.namespace,
      memoryEntries: this.memory.size,
      diskEntries,
      hits: this.hits,
      misses: this.misses,
      ttlHours: Math.round((this.options.ttlMs / 3_600_000) * 10) / 10,
    };
  }

  private remember(entry: CacheEntry<T>): void {
    this.memory.delete(entry.key);
    this.memory.set(entry.key, entry);
    while (this.memory.size > this.options.maxEntries) {
      const oldest = this.memory.keys().next().value;
      if (oldest === undefined) break;
      this.memory.delete(oldest);
    }
  }

  private file(key: string): string | undefined {
    if (!this.dir || !/^[a-zA-Z0-9_-]+$/.test(key)) return undefined;
    return join(this.dir, `${key}.json`);
  }

  private readDisk(key: string): CacheEntry<T> | undefined {
    const file = this.file(key);
    if (!file) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as CacheEntry<T>;
      return parsed && parsed.key === key && typeof parsed.expiresAt === "number"
        ? parsed
        : undefined;
    } catch {
      return undefined;
    }
  }

  private writeDisk(entry: CacheEntry<T>): void {
    const file = this.file(entry.key);
    if (!file) return;
    try {
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(entry));
      renameSync(tmp, file);
    } catch {
      // Disk cache is best-effort; the memory layer still works.
    }
  }

  private deleteDisk(key: string): void {
    const file = this.file(key);
    if (!file) return;
    try {
      rmSync(file, { force: true });
    } catch {
      // ignore
    }
  }
}

export function cacheDir(): string {
  return process.env.OPENER_CACHE_DIR || join(process.cwd(), ".cache");
}

export function cacheTtlMs(): number {
  const hours = Number(process.env.OPENER_CACHE_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3_600_000;
}
