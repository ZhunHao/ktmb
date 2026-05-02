import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  _aliasEntries,
  resolveKitsStationId,
} from "../../../../src/core/ktmb/station-map.js";
import { parseHomePage } from "../../../../src/core/ktmb/parse-home.js";

const here = dirname(fileURLToPath(import.meta.url));
const homeHtml = readFileSync(
  resolve(here, "../../../fixtures/ktmb/home.html"),
  "utf8",
);

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

describe("KITS_ALIASES coverage", () => {
  const parsed = parseHomePage(homeHtml);
  if (!parsed.ok) throw new Error(`home.html parse failed: ${parsed.error.message}`);
  const stationIds = new Set(parsed.data.stations.map((s) => s.id));

  it("home.html parses to a non-empty catalog", () => {
    expect(stationIds.size).toBeGreaterThan(50);
  });

  it.each(_aliasEntries())(
    "alias %s -> %s exists in the KITS home-page catalog",
    (_alias, kitsId) => {
      expect(stationIds.has(kitsId)).toBe(true);
    },
  );

  it("covers at least 30 ETS/Intercity stations", () => {
    expect(_aliasEntries().length).toBeGreaterThanOrEqual(30);
  });
});
