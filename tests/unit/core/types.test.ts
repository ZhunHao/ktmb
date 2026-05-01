import { describe, expect, it } from "vitest";
import {
  StationSchema,
  StopSchema,
  FareSchema,
  TrainScheduleSchema,
  KomuterDepartureSchema,
  VehiclePositionSchema,
} from "../../../src/core/types.js";

describe("public schemas", () => {
  it("Station validates a minimal record", () => {
    const s = StationSchema.parse({
      code: "KUL",
      nameEn: "KL Sentral",
      nameMs: "KL Sentral",
      country: "MY",
    });
    expect(s.code).toBe("KUL");
  });

  it("Station rejects unknown country", () => {
    const r = StationSchema.safeParse({
      code: "KUL",
      nameEn: "x",
      nameMs: "x",
      country: "ID",
    });
    expect(r.success).toBe(false);
  });

  it("Stop allows null arrival at origin", () => {
    const s = StopSchema.parse({
      stationCode: "KUL",
      arrival: null,
      departure: "2026-05-01T08:00:00+08:00",
    });
    expect(s.arrival).toBeNull();
  });

  it("Fare requires non-negative integer minor units", () => {
    expect(() =>
      FareSchema.parse({ className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 }),
    ).not.toThrow();
    expect(
      FareSchema.safeParse({ className: "x", priceMinor: -1, currency: "MYR", seatsLeft: null })
        .success,
    ).toBe(false);
    expect(
      FareSchema.safeParse({ className: "x", priceMinor: 1.5, currency: "MYR", seatsLeft: null })
        .success,
    ).toBe(false);
  });

  it("TrainSchedule requires journeyDurationMinutes", () => {
    const ts = TrainScheduleSchema.parse({
      trainNo: "EG9322",
      service: "ETS",
      bookingProvider: "KTMB",
      from: { stationCode: "KUL", arrival: null, departure: "2026-05-01T08:00:00+08:00" },
      to: { stationCode: "BTW", arrival: "2026-05-01T13:00:00+08:00", departure: null },
      classes: [{ className: "Premier", fare: { className: "Premier", priceMinor: 5500, currency: "MYR", seatsLeft: 12 } }],
      journeyDurationMinutes: 300,
    });
    expect(ts.journeyDurationMinutes).toBe(300);
  });

  it("KomuterDeparture parses minimal fields", () => {
    const k = KomuterDepartureSchema.parse({
      trainNo: "K2412",
      line: "Port Klang",
      departure: "2026-05-01T08:30:00+08:00",
    });
    expect(k.trainNo).toBe("K2412");
  });

  it("VehiclePosition parses lat/lon", () => {
    const v = VehiclePositionSchema.parse({
      vehicleId: "V123",
      lat: 3.1390,
      lon: 101.6869,
      timestamp: "2026-05-01T08:00:00+08:00",
    });
    expect(v.lat).toBeCloseTo(3.139);
  });

  it("Iso8601MyT rejects calendar-invalid timestamps", () => {
    // shape-valid but calendar-invalid
    expect(
      StopSchema.safeParse({
        stationCode: "KUL",
        arrival: null,
        departure: "2026-13-45T25:99:99+08:00",
      }).success,
    ).toBe(false);
    // Feb 30 should fail
    expect(
      StopSchema.safeParse({
        stationCode: "KUL",
        arrival: null,
        departure: "2026-02-30T08:00:00+08:00",
      }).success,
    ).toBe(false);
    // Valid timestamp still passes
    expect(
      StopSchema.safeParse({
        stationCode: "KUL",
        arrival: null,
        departure: "2026-05-01T08:00:00+08:00",
      }).success,
    ).toBe(true);
  });
});
