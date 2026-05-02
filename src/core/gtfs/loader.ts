import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { FetchOptions } from "../client/http.js";
import { parseStaticFeed } from "./static-parser.js";
import { GtfsStore } from "./store.js";
import { loadCachedFeed, saveCachedFeed } from "./feed-cache.js";

export type GtfsLoaderOptions = {
  cacheDir?: string;
  cacheMaxAgeMs?: number;
};

const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export class GtfsLoader {
  private store: GtfsStore | undefined;
  private inflight: Promise<Result<GtfsStore>> | undefined;
  private readonly cacheDir: string | undefined;
  private readonly cacheMaxAgeMs: number;

  constructor(
    private readonly feedUrl: string,
    opts: GtfsLoaderOptions = {},
  ) {
    this.cacheDir = opts.cacheDir;
    this.cacheMaxAgeMs = opts.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
  }

  currentStore(): GtfsStore | undefined {
    return this.store;
  }

  async load(
    opts: Pick<FetchOptions, "retryDelaysMs"> = {},
  ): Promise<Result<GtfsStore>> {
    if (this.inflight) return this.inflight;
    const p = (async () => {
      const r = await this.loadWithCache(opts);
      if (r.ok) this.store = r.data;
      return r;
    })();
    this.inflight = p;
    try {
      return await p;
    } finally {
      if (this.inflight === p) this.inflight = undefined;
    }
  }

  refresh(
    opts: Pick<FetchOptions, "retryDelaysMs"> = {},
  ): Promise<Result<GtfsStore>> {
    if (this.inflight) return this.inflight;
    const p = (async () => {
      const r = await this.fetchAndCache(opts);
      if (r.ok) this.store = r.data;
      return r;
    })();
    this.inflight = p;
    return p.finally(() => {
      if (this.inflight === p) this.inflight = undefined;
    });
  }

  private async loadWithCache(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    if (this.cacheDir) {
      const cached = await loadCachedFeed({
        dir: this.cacheDir,
        url: this.feedUrl,
        maxAgeMs: this.cacheMaxAgeMs,
      });
      if (cached) return this.parseBytes(cached.bytes);
    }
    return this.fetchAndCache(opts);
  }

  private async fetchAndCache(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    const res = await fetchWithRetry(this.feedUrl, opts);
    if (!res.ok) return res;
    const bytes = new Uint8Array(await res.data.arrayBuffer());
    if (this.cacheDir) {
      try {
        await saveCachedFeed({ dir: this.cacheDir, url: this.feedUrl, bytes });
      } catch {
        // Best-effort; a failed cache write should not break the load.
      }
    }
    return this.parseBytes(bytes);
  }

  private parseBytes(bytes: Uint8Array): Result<GtfsStore> {
    try {
      const feed = parseStaticFeed(bytes);
      return ok(new GtfsStore(feed));
    } catch (e) {
      return err("parse_error", "GTFS feed parse failed", e);
    }
  }
}
