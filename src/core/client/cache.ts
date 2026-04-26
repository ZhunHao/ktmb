import { LRUCache } from "lru-cache";
import { createHash } from "node:crypto";

export type TtlCacheOptions = { max: number; ttlMs: number };

export class TtlCache<V extends {}> {
  private readonly inner: LRUCache<string, V>;
  constructor(opts: TtlCacheOptions) {
    // Use `Date` as the perf source so consumers (e.g. tests) can use
    // vi.useFakeTimers / vi.setSystemTime to control TTL expiry. lru-cache
    // captures `performance` at module-load time, which vitest's fake-timers
    // cannot replace retroactively, but `Date` is replaced atomically.
    this.inner = new LRUCache({ max: opts.max, ttl: opts.ttlMs, perf: Date });
  }
  get(key: string): V | undefined {
    return this.inner.get(key);
  }
  set(key: string, value: V): void {
    this.inner.set(key, value);
  }
  delete(key: string): void {
    this.inner.delete(key);
  }
  clear(): void {
    this.inner.clear();
  }
}

const normalize = (v: unknown): unknown => {
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, val]) => val !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, val]) => [k, normalize(val)] as const);
    return Object.fromEntries(entries);
  }
  return v;
};

export const cacheKey = (params: Record<string, unknown>): string => {
  const json = JSON.stringify(normalize(params));
  return createHash("sha1").update(json).digest("hex");
};
