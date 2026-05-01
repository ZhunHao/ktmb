import { describe, expect, it } from "vitest";
import { buildApp } from "../../../src/api/server.js";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";

const ktmb = createKtmb({
  store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
  fareGetter: async () =>
    ok([
      {
        className: "Premier",
        fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 },
      },
    ]),
  realtimeFetcher: async () => ok([]),
});
const app = buildApp(ktmb);

describe("REST routes", () => {
  it("GET /v1/stations?q=KL returns matches", async () => {
    const res = await app.request("/v1/stations?q=KL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: true; data: Array<{ code: string }> };
    expect(body.ok).toBe(true);
    expect(body.data.find((s) => s.code === "KUL")).toBeDefined();
  });

  it("GET /v1/stations/:id returns the station", async () => {
    const res = await app.request("/v1/stations/KUL");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { nameEn: string } };
    expect(body.data.nameEn).toBe("KL Sentral");
  });

  it("GET /v1/stations/:id 404s for unknown", async () => {
    const res = await app.request("/v1/stations/XXX");
    expect(res.status).toBe(404);
  });

  it("GET /v1/schedules returns trains for the date", async () => {
    const res = await app.request("/v1/schedules?from=KUL&to=BTW&date=2026-05-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ trainNo: string }> };
    expect(body.data.find((t) => t.trainNo === "EG9322")).toBeDefined();
  });

  it("GET /v1/schedules requires from/to/date", async () => {
    const res = await app.request("/v1/schedules?from=KUL");
    expect(res.status).toBe(400);
  });

  it("GET /v1/schedules returns 422 outside_calendar_window when date is past feed end", async () => {
    const res = await app.request("/v1/schedules?from=KUL&to=BTW&date=2027-01-01");
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: false; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("outside_calendar_window");
    expect(body.error.message).toContain("2026-12-31");
  });

  it("GET /v1/schedules/:trainNo/availability returns fare classes", async () => {
    const res = await app.request(
      "/v1/schedules/EG9322/availability?from=KUL&to=BTW&date=2026-05-01",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ className: string }> };
    expect(body.data[0]?.className).toBe("Premier");
  });
});

describe("Komuter + realtime routes", () => {
  it("GET /v1/komuter/lines returns lines", async () => {
    const res = await app.request("/v1/komuter/lines");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ lineId: string }> };
    expect(body.data.find((l) => l.lineId === "KOM-PK")).toBeDefined();
  });

  it("GET /v1/komuter/lines/:line/timetable returns departures", async () => {
    const res = await app.request("/v1/komuter/lines/KOM-PK/timetable?station=KUL&date=2026-05-01");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ trainNo: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("GET /v1/realtime/vehicles returns the (empty) list", async () => {
    const res = await app.request("/v1/realtime/vehicles");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
