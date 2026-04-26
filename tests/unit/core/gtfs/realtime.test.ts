import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import { fetchVehiclePositions } from "../../../../src/core/gtfs/realtime.js";

const URL_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

const buildFeed = (): Uint8Array => {
  const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: "2.0", incrementality: 0, timestamp: 1714521600 },
    entity: [
      {
        id: "v1",
        vehicle: {
          vehicle: { id: "EG9322" },
          trip: { tripId: "T1", routeId: "ETS-N" },
          position: { latitude: 3.139, longitude: 101.6864, speed: 30, bearing: 0 },
          timestamp: 1714521600,
        },
      },
    ],
  });
  return FeedMessage.encode(msg).finish();
};

describe("fetchVehiclePositions", () => {
  it("decodes GTFS-RT and maps to VehiclePosition", async () => {
    server.use(
      http.get(URL_RT, () =>
        new HttpResponse(buildFeed(), {
          status: 200,
          headers: { "content-type": "application/x-protobuf" },
        }),
      ),
    );
    const r = await fetchVehiclePositions(URL_RT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.vehicleId).toBe("EG9322");
    expect(r.data[0]!.lat).toBeCloseTo(3.139);
    expect(r.data[0]!.timestamp.endsWith("+08:00")).toBe(true);
  });
});
