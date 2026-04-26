import { describe, expect, it, vi } from "vitest";
import { TtlCache, cacheKey } from "../../../../src/core/client/cache.js";

describe("TtlCache", () => {
  it("returns cached value within TTL", () => {
    const c = new TtlCache<string>({ max: 10, ttlMs: 1000 });
    c.set("a", "1");
    expect(c.get("a")).toBe("1");
  });

  it("expires after TTL", () => {
    vi.useFakeTimers();
    const c = new TtlCache<string>({ max: 10, ttlMs: 1000 });
    c.set("a", "1");
    vi.advanceTimersByTime(1500);
    expect(c.get("a")).toBeUndefined();
    vi.useRealTimers();
  });

  it("evicts least-recently-used past max", () => {
    const c = new TtlCache<string>({ max: 2, ttlMs: 60_000 });
    c.set("a", "1");
    c.set("b", "2");
    c.get("a");
    c.set("c", "3");
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe("1");
    expect(c.get("c")).toBe("3");
  });
});

describe("cacheKey", () => {
  it("hashes equivalent objects to the same key", () => {
    expect(cacheKey({ b: 1, a: 2 })).toBe(cacheKey({ a: 2, b: 1 }));
  });
  it("normalizes string casing/trim", () => {
    expect(cacheKey({ q: "  KL Sentral " })).toBe(cacheKey({ q: "kl sentral" }));
  });
  it("differentiates distinct values", () => {
    expect(cacheKey({ a: 1 })).not.toBe(cacheKey({ a: 2 }));
  });
});
