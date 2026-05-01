import type { GtfsStore } from "../gtfs/store.js";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { gtfsTimeToIso } from "../time/gtfs-rollover.js";
import { classifyRoute } from "../schedules/route-classifier.js";
import type { KomuterDeparture } from "../types.js";

export type KomuterLine = { lineId: string; nameEn: string };

export type GetTimetableInput = { line: string; station: string; date: string };

export class KomuterService {
  constructor(private readonly getStore: () => GtfsStore) {}

  listLines(): Result<KomuterLine[]> {
    const out = this.getStore()
      .listRoutes()
      .filter((r) => classifyRoute(r) === "Komuter")
      .map((r) => ({ lineId: r.routeId, nameEn: r.routeLongName || r.routeShortName }));
    return ok(out);
  }

  getTimetable(input: GetTimetableInput): Result<KomuterDeparture[]> {
    const store = this.getStore();
    const route = store.findRoute(input.line);
    if (!route || classifyRoute(route) !== "Komuter") {
      return err("not_found", `unknown Komuter line: ${input.line}`);
    }
    if (!store.findStop(input.station)) {
      return err("not_found", `unknown station: ${input.station}`);
    }
    if (store.isOutsideCalendarWindow(input.date)) {
      const w = store.calendarWindow!;
      return err(
        "outside_calendar_window",
        `requested date ${input.date} is outside GTFS calendar window ${w.startDate}..${w.endDate}`,
      );
    }
    const trips = store.tripsForRoute(route.routeId);
    const tripsRunning = new Set(store.tripsRunningOn(input.date).map((t) => t.tripId));
    const out: KomuterDeparture[] = [];
    for (const trip of trips) {
      if (!tripsRunning.has(trip.tripId)) continue;
      const stopTimes = store.stopTimesForTrip(trip.tripId);
      const at = stopTimes.find((s) => s.stopId === input.station);
      if (!at) continue;
      out.push({
        trainNo: trip.tripId,
        line: route.routeLongName || route.routeShortName,
        departure: gtfsTimeToIso(input.date, at.departureTime),
      });
    }
    out.sort((a, b) => a.departure.localeCompare(b.departure));
    return ok(out);
  }
}
