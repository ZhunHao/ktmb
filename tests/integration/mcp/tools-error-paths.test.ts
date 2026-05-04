import { describe, expect, it } from "vitest";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { err, ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";
import type { ForwardFallback } from "../../../src/core/schedules/service.js";
import { listSchedulesHandler } from "../../../src/mcp/tools/list-schedules.js";
import { getFareAvailabilityHandler } from "../../../src/mcp/tools/get-fare-availability.js";
import { getKomuterTimetableHandler } from "../../../src/mcp/tools/get-komuter-timetable.js";

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };

const text = (r: ToolResult): unknown => JSON.parse(r.content[0]!.text);

const buildKtmb = (overrides: Partial<Parameters<typeof createKtmb>[0]> = {}) =>
  createKtmb({
    store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
    fareGetter: async () => ok([]),
    realtimeFetcher: async () => ok([]),
    ...overrides,
  });

describe("list_schedules error paths", () => {
  it("returns not_found when origin station cannot be resolved", async () => {
    const ktmb = buildKtmb();
    const r = (await listSchedulesHandler(ktmb)({
      from: "ZZZ_NOT_A_STATION_xyz",
      to: "BTW",
      date: "2026-05-01",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("not_found");
  });

  it("returns invalid_input when date string cannot be parsed", async () => {
    const ktmb = buildKtmb();
    const r = (await listSchedulesHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "not-a-real-date-string",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("invalid_input");
  });

  it("returns outside_calendar_window when no forward fallback is configured", async () => {
    const ktmb = buildKtmb();
    const r = (await listSchedulesHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2027-06-01",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("outside_calendar_window");
  });

  it("falls back to KITS forward-fallback for forward-dated requests", async () => {
    const fallback: ForwardFallback = async () =>
      ok([
        {
          trainNo: "EG9999",
          service: "Platinum",
          departure: "08:00",
          arrival: "13:00",
          durationMinutes: 300,
          minFareMinor: 5500,
          seatsAvailable: 42,
          tripData: "tripdata-stub",
        },
      ]);
    const ktmb = buildKtmb({ forwardFallback: fallback });
    const r = (await listSchedulesHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2027-06-01",
    })) as ToolResult;
    expect(r.isError).toBeFalsy();
    const body = text(r) as { ok: true; data: Array<{ trainNo: string }> };
    expect(body.ok).toBe(true);
    expect(body.data[0]?.trainNo).toBe("EG9999");
  });

  it("propagates upstream errors from a failing KITS forward-fallback", async () => {
    const fallback: ForwardFallback = async () =>
      err("upstream_error", "/Trip returned HTTP 500");
    const ktmb = buildKtmb({ forwardFallback: fallback });
    const r = (await listSchedulesHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2027-06-01",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string; message: string } };
    expect(body.error.code).toBe("upstream_error");
    expect(body.error.message).toContain("HTTP 500");
  });
});

describe("get_fare_availability error paths", () => {
  it("returns not_found when station cannot be resolved", async () => {
    const ktmb = buildKtmb();
    const r = (await getFareAvailabilityHandler(ktmb)({
      from: "ZZZ_NOT_A_STATION_xyz",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("propagates upstream errors from a failing fareGetter", async () => {
    const ktmb = buildKtmb({
      fareGetter: async () => err("upstream_error", "KITS /Trip returned HTTP 503"),
    });
    const r = (await getFareAvailabilityHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string; message: string } };
    expect(body.error.code).toBe("upstream_error");
    expect(body.error.message).toContain("503");
  });

  it("propagates parse_error from a fareGetter that hits malformed HTML", async () => {
    const ktmb = buildKtmb({
      fareGetter: async () => err("parse_error", "/Trip body missing #search-results table"),
    });
    const r = (await getFareAvailabilityHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("parse_error");
  });
});

describe("get_komuter_timetable error paths", () => {
  it("returns not_found when station cannot be resolved", async () => {
    const ktmb = buildKtmb();
    const r = (await getKomuterTimetableHandler(ktmb)({
      line: "KC05_KB18",
      station: "ZZZ_NOT_A_STATION_xyz",
      date: "2026-05-01",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("returns invalid_input on unparseable date", async () => {
    const ktmb = buildKtmb();
    const r = (await getKomuterTimetableHandler(ktmb)({
      line: "KC05_KB18",
      station: "KUL",
      date: "garbage",
    })) as ToolResult;
    expect(r.isError).toBe(true);
    const body = text(r) as { ok: false; error: { code: string } };
    expect(body.error.code).toBe("invalid_input");
  });
});
