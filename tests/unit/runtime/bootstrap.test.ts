import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createKtmbRuntime } from "../../../src/runtime/bootstrap.js";
import { buildMiniFeed } from "../core/gtfs/_make-fixture.js";

const STATIC = "https://test.invalid/gtfs-static/ktmb";
const RT = "https://test.invalid/gtfs-realtime/vehicle-position/ktmb";

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("createKtmbRuntime", () => {
  it("performs a cold-start GTFS load and exposes a working ktmb facade", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 0,
    });
    try {
      const lines = rt.ktmb.komuter.listLines();
      expect(lines.ok).toBe(true);
    } finally {
      rt.shutdown();
    }
  });

  it("schedules a refresh tick that swaps the store on success", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(STATIC, () => {
        calls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 60_000,
    });
    try {
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      // Allow the refresh promise to settle
      await vi.runOnlyPendingTimersAsync();
      expect(calls).toBe(2);
    } finally {
      rt.shutdown();
      vi.useRealTimers();
    }
  });

  it("shutdown() clears the refresh timer", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(STATIC, () => {
        calls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 60_000,
    });
    try {
      rt.shutdown();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the cold-start load fails", async () => {
    server.use(http.get(STATIC, () => new HttpResponse(null, { status: 503 })));
    await expect(
      createKtmbRuntime({
        feedStaticUrl: STATIC,
        feedRealtimeUrl: RT,
        refreshIntervalMs: 0,
        retryDelaysMs: [1],
      }),
    ).rejects.toThrow(/GTFS load failed/);
  });
});
