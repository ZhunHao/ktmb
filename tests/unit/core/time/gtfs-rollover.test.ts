import { describe, expect, it } from "vitest";
import { gtfsTimeToIso, ktmbTimeRollover } from "../../../../src/core/time/gtfs-rollover.js";

describe("GTFS HH:MM:SS rollover", () => {
  it("converts in-day HH:MM:SS", () => {
    expect(gtfsTimeToIso("2026-05-01", "08:30:00")).toBe("2026-05-01T08:30:00+08:00");
  });

  it("rolls 24:00:00 to next day 00:00:00", () => {
    expect(gtfsTimeToIso("2026-05-01", "24:00:00")).toBe("2026-05-02T00:00:00+08:00");
  });

  it("rolls 27:30:00 to next day 03:30:00", () => {
    expect(gtfsTimeToIso("2026-05-01", "27:30:00")).toBe("2026-05-02T03:30:00+08:00");
  });

  it("rolls 51:30:00 to two days later", () => {
    expect(gtfsTimeToIso("2026-05-01", "51:30:00")).toBe("2026-05-03T03:30:00+08:00");
  });

  it("rejects malformed input", () => {
    expect(() => gtfsTimeToIso("2026-05-01", "8:30")).toThrow();
    expect(() => gtfsTimeToIso("2026-05-01", "abc")).toThrow();
  });
});

describe("KTMB HH:MM rollover", () => {
  it("walks stops and rolls when time decreases", () => {
    const out = ktmbTimeRollover("2026-05-01", [
      { hhmm: "20:00" },
      { hhmm: "22:30" },
      { hhmm: "03:15" },
      { hhmm: "07:30" },
    ]);
    expect(out.map((x) => x.iso)).toEqual([
      "2026-05-01T20:00:00+08:00",
      "2026-05-01T22:30:00+08:00",
      "2026-05-02T03:15:00+08:00",
      "2026-05-02T07:30:00+08:00",
    ]);
  });

  it("handles same-day journeys without rolling", () => {
    const out = ktmbTimeRollover("2026-05-01", [
      { hhmm: "08:00" },
      { hhmm: "13:00" },
    ]);
    expect(out.map((x) => x.iso)).toEqual([
      "2026-05-01T08:00:00+08:00",
      "2026-05-01T13:00:00+08:00",
    ]);
  });
});
