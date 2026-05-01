import { describe, expect, it } from "vitest";
import { parseStaticFeed } from "../../../../src/core/gtfs/static-parser.js";
import { GtfsStore } from "../../../../src/core/gtfs/store.js";
import { SchedulesService } from "../../../../src/core/schedules/service.js";
import { buildMiniFeed } from "../gtfs/_make-fixture.js";

const make = () => {
  const store = new GtfsStore(parseStaticFeed(buildMiniFeed()));
  return new SchedulesService(() => store);
};

describe("SchedulesService", () => {
  it("listSchedules returns ETS train KUL→BTW on a weekday", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const eg = r.data.find((t) => t.trainNo === "EG9322")!;
    expect(eg.service).toBe("ETS");
    expect(eg.from.stationCode).toBe("KUL");
    expect(eg.to.stationCode).toBe("BTW");
    expect(eg.from.departure).toBe("2026-05-01T08:00:00+08:00");
    expect(eg.to.arrival).toBe("2026-05-01T13:00:00+08:00");
    expect(eg.journeyDurationMinutes).toBe(300);
    expect(eg.classes).toEqual([]);
  });

  it("includes Ekspres Rakyat Timuran with cross-day arrival", () => {
    const r = make().listSchedules({ from: "JBS", to: "TPT", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ew = r.data.find((t) => t.trainNo === "EW27")!;
    expect(ew.service).toBe("Intercity");
    expect(ew.from.departure).toBe("2026-05-01T20:00:00+08:00");
    expect(ew.to.arrival).toBe("2026-05-02T07:30:00+08:00");
    expect(ew.journeyDurationMinutes).toBe(690);
  });

  it("returns empty list when no train serves the OD on that date", () => {
    const r = make().listSchedules({ from: "KUL", to: "TPT", date: "2026-05-01" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
  });

  it("returns empty list when calendar excludes the date", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2026-05-02" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
  });

  it("returns outside_calendar_window when date is before window start", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2025-12-31" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("outside_calendar_window");
    expect(r.error.message).toContain("2025-12-31");
    expect(r.error.message).toContain("2026-01-01");
    expect(r.error.message).toContain("2026-12-31");
  });

  it("returns outside_calendar_window when date is after window end", () => {
    const r = make().listSchedules({ from: "KUL", to: "BTW", date: "2027-01-01" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("outside_calendar_window");
  });
});
