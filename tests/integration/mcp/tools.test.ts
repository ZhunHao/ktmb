import { describe, expect, it } from "vitest";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";
import { searchStationsHandler } from "../../../src/mcp/tools/search-stations.js";
import { listSchedulesHandler } from "../../../src/mcp/tools/list-schedules.js";
import { getFareAvailabilityHandler } from "../../../src/mcp/tools/get-fare-availability.js";
import { listKomuterLinesHandler } from "../../../src/mcp/tools/list-komuter-lines.js";
import { getKomuterTimetableHandler } from "../../../src/mcp/tools/get-komuter-timetable.js";
import { getVehiclePositionsHandler } from "../../../src/mcp/tools/get-vehicle-positions.js";

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

const text = (r: { content: Array<{ type: string; text: string }> }): unknown =>
  JSON.parse(r.content[0]!.text);

describe("MCP tool handlers", () => {
  it("search_stations returns matches", async () => {
    const r = await searchStationsHandler(ktmb)({ query: "KL" });
    const body = text(r) as { ok: true; data: Array<{ code: string }> };
    expect(body.ok).toBe(true);
    expect(body.data.find((s) => s.code === "KUL")).toBeDefined();
  });

  it("list_schedules returns trains", async () => {
    const r = await listSchedulesHandler(ktmb)({ from: "KUL", to: "BTW", date: "2026-05-01" });
    const body = text(r) as { data: Array<{ trainNo: string }> };
    expect(body.data.find((t) => t.trainNo === "EG9322")).toBeDefined();
  });

  it("get_fare_availability returns fare classes", async () => {
    const r = await getFareAvailabilityHandler(ktmb)({
      from: "KUL",
      to: "BTW",
      date: "2026-05-01",
      trainNo: "EG9322",
    });
    const body = text(r) as { data: Array<{ className: string }> };
    expect(body.data[0]?.className).toBe("Premier");
  });

  it("list_komuter_lines lists Komuter routes", async () => {
    const r = await listKomuterLinesHandler(ktmb)({});
    const body = text(r) as { data: Array<{ lineId: string }> };
    expect(body.data.find((l) => l.lineId === "KC05_KB18")).toBeDefined();
  });

  it("get_komuter_timetable returns departures", async () => {
    const r = await getKomuterTimetableHandler(ktmb)({
      line: "KC05_KB18",
      station: "KUL",
      date: "2026-05-01",
    });
    const body = text(r) as { data: Array<{ trainNo: string }> };
    expect(body.data.length).toBeGreaterThan(0);
  });

  it("get_vehicle_positions returns the (empty) list", async () => {
    const r = await getVehiclePositionsHandler(ktmb)({});
    const body = text(r) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
