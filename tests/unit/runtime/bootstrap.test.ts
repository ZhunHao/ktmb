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

describe("createKtmbRuntime KTMB_COOKIE plumbing", () => {
  it("threads process.env.KTMB_COOKIE into the fare getter so the Cookie header reaches KITS", async () => {
    // Stub GTFS feed
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );

    // Capture the Cookie header that the KITS client sends to /Trip/LayoutV2.
    let layoutV2Cookie: string | null = null;
    const fixturePath = (name: string) =>
      new URL(`../../fixtures/ktmb/${name}`, import.meta.url);
    const { readFileSync } = await import("node:fs");
    const fix = (name: string) =>
      readFileSync(fixturePath(name), "utf8");

    server.use(
      http.get("https://online.ktmb.com.my/", () =>
        HttpResponse.html(fix("home.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip", () =>
        HttpResponse.html(fix("trip-form.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
        HttpResponse.text(fix("trip-token.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post("https://online.ktmb.com.my/Trip/Trip", () =>
        HttpResponse.text(fix("trip-listing.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post(
        "https://online.ktmb.com.my/Trip/LayoutV2",
        ({ request }) => {
          layoutV2Cookie = request.headers.get("cookie");
          return HttpResponse.text(fix("layout-v2.json"), {
            headers: { "Content-Type": "application/json" },
          });
        },
      ),
    );

    process.env.KTMB_COOKIE =
      ".AspNetCore.Identity.Application=test-token-from-env";
    try {
      const rt = await createKtmbRuntime({
        feedStaticUrl: STATIC,
        feedRealtimeUrl: RT,
        refreshIntervalMs: 0,
      });
      try {
        const r = await rt.ktmb.fares.get({
          from: "KUL",
          to: "BTW",
          date: "2026-05-16",
          trainNo: "9124",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Auth mode → multiple per-class fares with seatsLeftIncludesPriority=false
        for (const c of r.data) {
          expect(c.fare.seatsLeftIncludesPriority).toBe(false);
        }
        expect(layoutV2Cookie).toContain(
          ".AspNetCore.Identity.Application=test-token-from-env",
        );
      } finally {
        rt.shutdown();
      }
    } finally {
      delete process.env.KTMB_COOKIE;
    }
  });

  it("falls back to anonymous mode when KTMB_COOKIE is unset (no LayoutV2 hit)", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );

    const { readFileSync } = await import("node:fs");
    const fix = (name: string) =>
      readFileSync(new URL(`../../fixtures/ktmb/${name}`, import.meta.url), "utf8");

    let layoutCalls = 0;
    server.use(
      http.get("https://online.ktmb.com.my/", () =>
        HttpResponse.html(fix("home.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip", () =>
        HttpResponse.html(fix("trip-form.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
        HttpResponse.text(fix("trip-token.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post("https://online.ktmb.com.my/Trip/Trip", () =>
        HttpResponse.text(fix("trip-listing.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post("https://online.ktmb.com.my/Trip/LayoutV2", () => {
        layoutCalls++;
        return HttpResponse.text("{}", { status: 401 });
      }),
    );

    delete process.env.KTMB_COOKIE;
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 0,
    });
    try {
      const r = await rt.ktmb.fares.get({
        from: "KUL",
        to: "BTW",
        date: "2026-05-16",
        trainNo: "9124",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.length).toBe(1);
      expect(r.data[0]!.fare.seatsLeftIncludesPriority).toBe(true);
      expect(layoutCalls).toBe(0); // anonymous mode never hits LayoutV2
    } finally {
      rt.shutdown();
    }
  });
});

describe("createKtmbRuntime forward-dated fallback", () => {
  it("activates KITS fallback when KTMB_FORWARD_FALLBACK=1 and date is past GTFS window", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    const { readFileSync } = await import("node:fs");
    const fix = (name: string) =>
      readFileSync(new URL(`../../fixtures/ktmb/${name}`, import.meta.url), "utf8");
    server.use(
      http.get("https://online.ktmb.com.my/", () =>
        HttpResponse.html(fix("home.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip", () =>
        HttpResponse.html(fix("trip-form.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
        HttpResponse.text(fix("trip-token.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post("https://online.ktmb.com.my/Trip/Trip", () =>
        HttpResponse.text(fix("trip-listing.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    process.env.KTMB_FORWARD_FALLBACK = "1";
    try {
      const rt = await createKtmbRuntime({
        feedStaticUrl: STATIC,
        feedRealtimeUrl: RT,
        refreshIntervalMs: 0,
      });
      try {
        const r = await rt.ktmb.schedules.listSchedulesAsync({
          from: "KUL",
          to: "BTW",
          date: "2099-12-31",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.length).toBeGreaterThan(0);
        expect(r.data[0]!.bookingProvider).toBe("KTMB");
      } finally {
        rt.shutdown();
      }
    } finally {
      delete process.env.KTMB_FORWARD_FALLBACK;
    }
  });

  it("returns outside_calendar_window when KTMB_FORWARD_FALLBACK is unset", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    delete process.env.KTMB_FORWARD_FALLBACK;
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 0,
    });
    try {
      const r = await rt.ktmb.schedules.listSchedulesAsync({
        from: "KUL",
        to: "BTW",
        date: "2099-12-31",
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe("outside_calendar_window");
    } finally {
      rt.shutdown();
    }
  });
});
