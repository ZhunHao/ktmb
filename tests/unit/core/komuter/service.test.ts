import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { KomuterService } from "../../../../src/core/komuter/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => new KomuterService(new GtfsStore(parseStaticFeed(buildMiniFeed())));

describe("KomuterService", () => {
  it("listLines returns all Komuter routes", () => {
    const r = make().listLines();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.map((l) => l.lineId)).toContain("KOM-PK");
  });

  it("getTimetable returns Komuter departures for a station/date", () => {
    const r = make().getTimetable({ line: "KOM-PK", station: "KUL", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.length).toBeGreaterThan(0);
    expect(r.data[0]!.departure).toBe("2026-05-01T07:30:00+08:00");
  });

  it("returns not_found for an unknown line", () => {
    const r = make().getTimetable({ line: "NOPE", station: "KUL", date: "2026-05-01" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("not_found");
  });

  it("returns outside_calendar_window when date is past the feed's calendar end", () => {
    const r = make().getTimetable({ line: "KOM-PK", station: "KUL", date: "2027-01-01" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("outside_calendar_window");
    expect(r.error.message).toContain("2026-12-31");
  });
});
