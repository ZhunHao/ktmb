import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { buildMiniFeed } from "./_make-fixture.js";

describe("GTFS static parser", () => {
  it("parses agency, routes, stops, calendar, trips, stop_times", () => {
    const feed = parseStaticFeed(buildMiniFeed());
    expect(feed.agencies.length).toBe(1);
    expect(feed.routes.length).toBe(4);
    expect(feed.stops.length).toBe(6);
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

describe("GTFS static parser — defensive parsing", () => {
  it("throws when agency.txt is missing agency_id", () => {
    const files: Record<string, Uint8Array> = {
      "agency.txt": strToU8(
        "agency_name,agency_url,agency_timezone\nKTMB,https://x,Asia/Kuala_Lumpur\n",
      ),
    };
    expect(() => parseStaticFeed(zipSync(files))).toThrow(/agency_id/);
  });

  it("throws when stop_times.txt has non-integer stop_sequence", () => {
    const files: Record<string, Uint8Array> = {
      "agency.txt": strToU8(
        "agency_id,agency_name,agency_url,agency_timezone\nKTMB,KTMB,https://x,Asia/Kuala_Lumpur\n",
      ),
      "stop_times.txt": strToU8(
        "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,08:00:00,08:00:00,KUL,abc\n",
      ),
    };
    expect(() => parseStaticFeed(zipSync(files))).toThrow(/stop_sequence/);
  });
});
