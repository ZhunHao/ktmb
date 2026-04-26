import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { GtfsLoader } from "../../../../src/core/gtfs/loader.js";
import { buildMiniFeed } from "./_make-fixture.js";

const FEED_URL = "https://api.data.gov.my/gtfs-static/ktmb";
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("GtfsLoader", () => {
  it("loads on first call and exposes the parsed store", async () => {
    server.use(
      http.get(FEED_URL, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
    );
    const loader = new GtfsLoader(FEED_URL);
    const r = await loader.load();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.findStop("KUL")?.stopName).toBe("KL Sentral");
  });

  it("serves stale-but-current store when refresh fails", async () => {
    let calls = 0;
    server.use(
      http.get(FEED_URL, () => {
        calls++;
        if (calls === 1) {
          return new HttpResponse(buildMiniFeed(), {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }
        return new HttpResponse(null, { status: 503 });
      }),
    );
    const loader = new GtfsLoader(FEED_URL);
    const first = await loader.load();
    expect(first.ok).toBe(true);
    const second = await loader.refresh({ retryDelaysMs: [1] });
    expect(second.ok).toBe(false);
    const store = loader.currentStore();
    expect(store?.findStop("KUL")?.stopName).toBe("KL Sentral");
  });

  it("returns upstream_error if the very first load fails", async () => {
    server.use(http.get(FEED_URL, () => new HttpResponse(null, { status: 503 })));
    const loader = new GtfsLoader(FEED_URL);
    const r = await loader.load({ retryDelaysMs: [1] });
    expect(r.ok).toBe(false);
    expect(loader.currentStore()).toBeUndefined();
  });
});
