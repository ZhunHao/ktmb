import { describe, expect, it } from "vitest";
import { GtfsLoader } from "../../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../../src/core/gtfs/realtime.js";

const SMOKE = process.env.KTMB_SMOKE === "1";

describe.skipIf(!SMOKE)("real GTFS feeds", () => {
  it("static feed downloads and parses", async () => {
    const loader = new GtfsLoader("https://api.data.gov.my/gtfs-static/ktmb");
    const r = await loader.load();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.listStops().length).toBeGreaterThan(0);
    expect(r.data.listRoutes().length).toBeGreaterThan(0);
  }, 30_000);

  it("realtime feed decodes", async () => {
    const r = await fetchVehiclePositions(
      "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb",
    );
    expect(r.ok).toBe(true);
  }, 30_000);
});
