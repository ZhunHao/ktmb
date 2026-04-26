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

// Row indices passed to `required` / `requiredInt` are 1-based "data row after header"
// (i.e. the first data row is row 1; the header line itself is not counted). A spreadsheet
// editor will show that data row at sheet row N+1.
const required = (
  row: Record<string, string>,
  field: string,
  file: string,
  line: number,
): string => {
  const v = row[field];
  if (v === undefined || v === "") {
    throw new Error(`GTFS ${file} row ${line}: missing required field "${field}"`);
  }
  return v;
};

const requiredInt = (
  row: Record<string, string>,
  field: string,
  file: string,
  line: number,
): number => {
  const v = required(row, field, file, line);
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`GTFS ${file} row ${line}: "${field}"="${v}" is not a non-negative integer`);
  }
  return n;
};

export const parseStaticFeed = (zipBytes: Uint8Array): StaticFeed => {
  const files = unzipSync(zipBytes);

  const agencies: Agency[] = readCsv(files, "agency.txt").map((r, i) => ({
    agencyId: required(r, "agency_id", "agency.txt", i + 1),
    agencyName: required(r, "agency_name", "agency.txt", i + 1),
    agencyTimezone: r["agency_timezone"] ?? "Asia/Kuala_Lumpur",
  }));

  const routes: Route[] = readCsv(files, "routes.txt").map((r, i) => ({
    routeId: required(r, "route_id", "routes.txt", i + 1),
    agencyId: r["agency_id"] ?? "",
    routeShortName: r["route_short_name"] ?? "",
    routeLongName: r["route_long_name"] ?? "",
    routeType: Number(r["route_type"] ?? "0"),
  }));

  const stops: GtfsStop[] = readCsv(files, "stops.txt").map((r, i) => ({
    stopId: required(r, "stop_id", "stops.txt", i + 1),
    stopName: required(r, "stop_name", "stops.txt", i + 1),
    lat: num(r["stop_lat"]),
    lon: num(r["stop_lon"]),
  }));

  const calendar: Calendar[] = readCsv(files, "calendar.txt").map((r, i) => ({
    serviceId: required(r, "service_id", "calendar.txt", i + 1),
    days: [
      bool01(r["sunday"]),
      bool01(r["monday"]),
      bool01(r["tuesday"]),
      bool01(r["wednesday"]),
      bool01(r["thursday"]),
      bool01(r["friday"]),
      bool01(r["saturday"]),
    ] as Calendar["days"],
    startDate: required(r, "start_date", "calendar.txt", i + 1),
    endDate: required(r, "end_date", "calendar.txt", i + 1),
  }));

  const trips: Trip[] = readCsv(files, "trips.txt").map((r, i) => ({
    routeId: required(r, "route_id", "trips.txt", i + 1),
    serviceId: required(r, "service_id", "trips.txt", i + 1),
    tripId: required(r, "trip_id", "trips.txt", i + 1),
    tripHeadsign: r["trip_headsign"] ?? "",
  }));

  const stopTimes: StopTime[] = readCsv(files, "stop_times.txt")
    .map((r, i) => ({
      tripId: required(r, "trip_id", "stop_times.txt", i + 1),
      arrivalTime: required(r, "arrival_time", "stop_times.txt", i + 1),
      departureTime: required(r, "departure_time", "stop_times.txt", i + 1),
      stopId: required(r, "stop_id", "stop_times.txt", i + 1),
      stopSequence: requiredInt(r, "stop_sequence", "stop_times.txt", i + 1),
    }))
    .sort((a, b) =>
      a.tripId === b.tripId ? a.stopSequence - b.stopSequence : a.tripId.localeCompare(b.tripId),
    );

  return { agencies, routes, stops, calendar, trips, stopTimes };
};
