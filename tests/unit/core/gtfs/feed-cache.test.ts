import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCachedFeed,
  saveCachedFeed,
} from "../../../../src/core/gtfs/feed-cache.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ktmb-cache-"));
  return () => rmSync(dir, { recursive: true, force: true });
});

describe("feed-cache", () => {
  it("returns null when the cache is empty", async () => {
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 60_000,
    });
    expect(r).toBeNull();
  });

  it("round-trips bytes through save -> load", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await saveCachedFeed({ dir, url: "https://example.invalid/feed", bytes });
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 60_000,
    });
    expect(r).not.toBeNull();
    expect(r!.bytes).toEqual(bytes);
  });

  it("returns null when the cached entry is older than maxAgeMs", async () => {
    const bytes = new Uint8Array([1]);
    await saveCachedFeed({ dir, url: "https://example.invalid/feed", bytes });
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 0,
    });
    expect(r).toBeNull();
  });

  it("isolates entries by URL", async () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    await saveCachedFeed({ dir, url: "https://a.invalid", bytes: a });
    await saveCachedFeed({ dir, url: "https://b.invalid", bytes: b });
    const ra = await loadCachedFeed({ dir, url: "https://a.invalid", maxAgeMs: 60_000 });
    const rb = await loadCachedFeed({ dir, url: "https://b.invalid", maxAgeMs: 60_000 });
    expect(ra!.bytes).toEqual(a);
    expect(rb!.bytes).toEqual(b);
  });
});
