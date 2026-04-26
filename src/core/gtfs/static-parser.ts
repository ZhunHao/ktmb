import { parse } from "csv-parse/sync";
import { strFromU8, unzipSync } from "fflate";
import type {
  Agency,
  Calendar,
  GtfsStop,
  Route,
  StaticFeed,
  StopTime,
  Trip,
} from "./types.js";

const readCsv = (files: Record<string, Uint8Array>, name: string): Record<string, string>[] => {
  const buf = files[name];
  if (!buf) return [];
  return parse(strFromU8(buf), { columns: true, skip_empty_lines: true, trim: true });
};

const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const bool01 = (v: string | undefined): boolean => v === "1";

export const parseStaticFeed = (zipBytes: Uint8Array): StaticFeed => {
  const files = unzipSync(zipBytes);

  const agencies: Agency[] = readCsv(files, "agency.txt").map((r) => ({
    agencyId: r["agency_id"] ?? "",
    agencyName: r["agency_name"] ?? "",
    agencyTimezone: r["agency_timezone"] ?? "Asia/Kuala_Lumpur",
  }));

  const routes: Route[] = readCsv(files, "routes.txt").map((r) => ({
    routeId: r["route_id"] ?? "",
    agencyId: r["agency_id"] ?? "",
    routeShortName: r["route_short_name"] ?? "",
    routeLongName: r["route_long_name"] ?? "",
    routeType: Number(r["route_type"] ?? "0"),
  }));

  const stops: GtfsStop[] = readCsv(files, "stops.txt").map((r) => ({
    stopId: r["stop_id"] ?? "",
    stopName: r["stop_name"] ?? "",
    lat: num(r["stop_lat"]),
    lon: num(r["stop_lon"]),
  }));

  const calendar: Calendar[] = readCsv(files, "calendar.txt").map((r) => ({
    serviceId: r["service_id"] ?? "",
    days: [
      bool01(r["sunday"]),
      bool01(r["monday"]),
      bool01(r["tuesday"]),
      bool01(r["wednesday"]),
      bool01(r["thursday"]),
      bool01(r["friday"]),
      bool01(r["saturday"]),
    ] as Calendar["days"],
    startDate: r["start_date"] ?? "",
    endDate: r["end_date"] ?? "",
  }));

  const trips: Trip[] = readCsv(files, "trips.txt").map((r) => ({
    routeId: r["route_id"] ?? "",
    serviceId: r["service_id"] ?? "",
    tripId: r["trip_id"] ?? "",
    tripHeadsign: r["trip_headsign"] ?? "",
  }));

  const stopTimes: StopTime[] = readCsv(files, "stop_times.txt")
    .map((r) => ({
      tripId: r["trip_id"] ?? "",
      arrivalTime: r["arrival_time"] ?? "",
      departureTime: r["departure_time"] ?? "",
      stopId: r["stop_id"] ?? "",
      stopSequence: Number(r["stop_sequence"] ?? "0"),
    }))
    .sort((a, b) =>
      a.tripId === b.tripId ? a.stopSequence - b.stopSequence : a.tripId.localeCompare(b.tripId),
    );

  return { agencies, routes, stops, calendar, trips, stopTimes };
};
