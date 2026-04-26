import GtfsRealtimeBindings from "gtfs-realtime-bindings";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { VehiclePosition } from "../types.js";

const epochToIsoMyt = (epochSeconds: number): string => {
  const d = new Date(epochSeconds * 1000);
  const mytMs = d.getTime() + 8 * 60 * 60 * 1000;
  const m = new Date(mytMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}-${pad(m.getUTCDate())}` +
    `T${pad(m.getUTCHours())}:${pad(m.getUTCMinutes())}:${pad(m.getUTCSeconds())}+08:00`
  );
};

export const fetchVehiclePositions = async (
  url: string,
): Promise<Result<VehiclePosition[]>> => {
  const res = await fetchWithRetry(url);
  if (!res.ok) return res;
  try {
    const buf = new Uint8Array(await res.data.arrayBuffer());
    const FeedMessage = GtfsRealtimeBindings.transit_realtime.FeedMessage;
    const feed = FeedMessage.decode(buf);
    const out: VehiclePosition[] = [];
    for (const e of feed.entity) {
      const v = e.vehicle;
      if (!v?.position) continue;
      const vehicleId = v.vehicle?.id;
      if (!vehicleId) continue; // rejects null/undefined AND proto3 default ""
      const lat = v.position.latitude;
      const lon = v.position.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      out.push({
        vehicleId,
        ...(v.trip?.tripId ? { tripId: v.trip.tripId } : {}),
        ...(v.trip?.routeId ? { routeId: v.trip.routeId } : {}),
        lat,
        lon,
        ...(v.position.bearing != null ? { bearing: v.position.bearing } : {}),
        ...(v.position.speed != null ? { speedKmh: v.position.speed } : {}),
        timestamp: epochToIsoMyt(Number(v.timestamp ?? feed.header?.timestamp ?? 0)),
      });
    }
    return ok(out);
  } catch (e) {
    return err("parse_error", "GTFS-RT decode failed", e);
  }
};
