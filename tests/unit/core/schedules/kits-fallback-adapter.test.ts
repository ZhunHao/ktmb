import { describe, expect, it } from "vitest";
import { kitsRowsToSchedules } from "../../../../src/core/schedules/kits-fallback-adapter.js";

const sampleRows = [
  {
    trainNo: "9124",
    service: "Platinum",
    departure: "08:05",
    arrival: "12:10",
    durationMinutes: 245,
    seatsAvailable: 230,
    minFareMinor: 11200,
    tripData: "",
  },
  {
    trainNo: "9352",
    service: "Gold",
    departure: "18:22",
    arrival: "22:42",
    durationMinutes: 260,
    seatsAvailable: 245,
    minFareMinor: 8800,
    tripData: "",
  },
];

describe("kitsRowsToSchedules", () => {
  it("returns one schedule per listing row with ETS service classification", () => {
    const out = kitsRowsToSchedules({
      rows: sampleRows,
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.trainNo).toBe("9124");
    expect(out[0]!.service).toBe("ETS");
    expect(out[0]!.bookingProvider).toBe("KTMB");
    expect(out[0]!.from.stationCode).toBe("KUL");
    expect(out[0]!.from.departure).toBe("2026-08-15T08:05:00+08:00");
    expect(out[0]!.to.stationCode).toBe("BTW");
    expect(out[0]!.to.arrival).toBe("2026-08-15T12:10:00+08:00");
    expect(out[0]!.journeyDurationMinutes).toBe(245);
    expect(out[0]!.classes).toEqual([]);
  });

  it("classifies KITS service strings into the Service union", () => {
    const out = kitsRowsToSchedules({
      rows: [
        { ...sampleRows[0]!, service: "Platinum", trainNo: "9001" },
        { ...sampleRows[0]!, service: "Express", trainNo: "9002" },
        { ...sampleRows[0]!, service: "Gold", trainNo: "9003" },
        { ...sampleRows[0]!, service: "Intercity", trainNo: "9004" },
      ],
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out.map((s) => s.service)).toEqual(["ETS", "ETS", "ETS", "Intercity"]);
  });

  it("handles overnight arrival markers like '00:20 (+1)'", () => {
    const out = kitsRowsToSchedules({
      rows: [
        {
          ...sampleRows[0]!,
          trainNo: "9138",
          departure: "20:15",
          arrival: "00:20 (+1)",
          durationMinutes: 245,
        },
      ],
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out[0]!.to.arrival).toBe("2026-08-16T00:20:00+08:00");
  });
});
