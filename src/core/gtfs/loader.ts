import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { FetchOptions } from "../client/http.js";
import { parseStaticFeed } from "./static-parser.js";
import { GtfsStore } from "./store.js";

export class GtfsLoader {
  private store: GtfsStore | undefined;
  private inflight: Promise<Result<GtfsStore>> | undefined;

  constructor(private readonly feedUrl: string) {}

  currentStore(): GtfsStore | undefined {
    return this.store;
  }

  async load(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    if (this.inflight) return this.inflight;
    const p = (async () => {
      const r = await this.fetchAndParse(opts);
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

  refresh(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    return this.load(opts);
  }

  private async fetchAndParse(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    const res = await fetchWithRetry(this.feedUrl, opts);
    if (!res.ok) return res;
    try {
      const buf = new Uint8Array(await res.data.arrayBuffer());
      const feed = parseStaticFeed(buf);
      return ok(new GtfsStore(feed));
    } catch (e) {
      return err("parse_error", "GTFS feed parse failed", e);
    }
  }
}
