import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { buildMiniFeed } from "./_make-fixture.js";

const store = (): GtfsStore => new GtfsStore(parseStaticFeed(buildMiniFeed()));

describe("GtfsStore", () => {
  it("findStop by id", () => {
    const s = store();
    expect(s.findStop("KUL")?.stopName).toBe("KL Sentral");
    expect(s.findStop("ZZZ")).toBeUndefined();
  });

  it("listStops returns all", () => {
    expect(store().listStops().length).toBe(6);
  });

  it("listRoutes returns all", () => {
    expect(store().listRoutes().length).toBe(4);
  });

  it("tripsRunningOn(date) filters by calendar weekday", () => {
    const s = store();
    const fri = s.tripsRunningOn("2026-05-01");
    expect(fri.map((t) => t.tripId).sort()).toEqual(["EG9322", "EW27", "K2412", "ST101"]);
    expect(s.tripsRunningOn("2026-05-02")).toEqual([]);
  });

  it("stopTimesForTrip returns ordered stops", () => {
    const s = store();
    const times = s.stopTimesForTrip("EG9322");
    expect(times.map((t) => t.stopId)).toEqual(["KUL", "BTW"]);
  });

  it("calendarWindow exposes min start and max end across calendars (YYYY-MM-DD)", () => {
    expect(store().calendarWindow).toEqual({ startDate: "2026-01-01", endDate: "2026-12-31" });
  });

  it("isOutsideCalendarWindow flags dates outside [startDate, endDate]", () => {
    const s = store();
    expect(s.isOutsideCalendarWindow("2025-12-31")).toBe(true);
    expect(s.isOutsideCalendarWindow("2026-01-01")).toBe(false);
    expect(s.isOutsideCalendarWindow("2026-06-15")).toBe(false);
    expect(s.isOutsideCalendarWindow("2026-12-31")).toBe(false);
    expect(s.isOutsideCalendarWindow("2027-01-01")).toBe(true);
  });
});
