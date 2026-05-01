import { describe, expect, it } from "vitest";
import { resolveKitsStationId } from "../../../../src/core/ktmb/station-map.js";

const sampleCatalog = [
  { id: "19100", description: "KL SENTRAL", stationData: "T1", trainServices: ["ETS"], state: "Selangor" },
  { id: "100", description: "BUTTERWORTH", stationData: "T2", trainServices: ["ETS"], state: "Penang" },
  { id: "44000", description: "ALOR SETAR", stationData: "T3", trainServices: ["ETS"], state: "Kedah" },
];

describe("resolveKitsStationId", () => {
  it("matches by exact GTFS stop name (uppercased)", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "KL Sentral", stopId: "KUL" }),
    ).toBe("19100");
  });

  it("matches by GTFS stopId fallback when name differs", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "Kuala Lumpur Sentral", stopId: "BTW" }),
    ).toBe("100");
  });

  it("returns undefined when neither name nor id matches", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "Mars", stopId: "MARS" }),
    ).toBeUndefined();
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(
      resolveKitsStationId(sampleCatalog, { stopName: "  butterworth ", stopId: "X" }),
    ).toBe("100");
  });
});
