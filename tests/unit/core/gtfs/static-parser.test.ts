import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { buildMiniFeed } from "./_make-fixture.js";

describe("GTFS static parser", () => {
  it("parses agency, routes, stops, calendar, trips, stop_times", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    expect(feed.agencies.length).toBe(1);
    expect(feed.routes.length).toBe(4);
    expect(feed.stops.length).toBe(5);
    expect(feed.calendar.length).toBe(1);
    expect(feed.trips.length).toBe(4);
    expect(feed.stopTimes.length).toBe(8);
  });

  it("preserves stop_times order by stop_sequence", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    const eg = feed.stopTimes.filter((s) => s.tripId === "EG9322");
    expect(eg.map((s) => s.stopId)).toEqual(["KUL", "BTW"]);
  });

  it("retains GTFS HH:MM:SS strings (no rollover here)", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    const ew = feed.stopTimes.filter((s) => s.tripId === "EW27");
    expect(ew.map((s) => s.departureTime)).toEqual(["20:00:00", "31:30:00"]);
  });
});
