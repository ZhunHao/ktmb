import { gtfsTimeToIso } from "../time/gtfs-rollover.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Result } from "../result.js";
import { ok } from "../result.js";
import type { Stop, TrainSchedule } from "../types.js";
import { classifyRoute } from "./route-classifier.js";
import { kitsRowsToSchedules } from "./kits-fallback-adapter.js";
import type { TripListingRow } from "../ktmb/parse-trip-listing.js";

const minutesBetween = (fromIso: string, toIso: string): number =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);

export type ListSchedulesInput = {
  from: string;
  to: string;
  date: string;
};

export type ForwardFallback = (
  input: ListSchedulesInput,
) => Promise<Result<readonly TripListingRow[]>>;

export type SchedulesServiceOptions = {
  forwardFallback?: ForwardFallback;
};

export class SchedulesService {
  private readonly forwardFallback: ForwardFallback | undefined;

  constructor(
    private readonly getStore: () => GtfsStore,
    opts: SchedulesServiceOptions = {},
  ) {
    this.forwardFallback = opts.forwardFallback;
  }

  /**
   * GTFS-only synchronous lookup. Returns `outside_calendar_window` for any
   * date past the published feed; this entry point does not fall through to
   * the KITS booking site even when `forwardFallback` is configured. Useful
   * for offline/build-time consumers (e.g. the snapshot generator) that want
   * a fast, deterministic, network-free lookup. For runtime callers that
   * should benefit from the forward-dated KITS fallback, use
   * {@link listSchedulesAsync}.
   */
  listSchedules(input: ListSchedulesInput): Result<TrainSchedule[]> {
    const store = this.getStore();
    if (store.isOutsideCalendarWindow(input.date)) {
      return store.outsideWindowError(input.date);
    }
    return ok(this.fromGtfs(input, store));
  }

  /**
   * GTFS-first lookup that falls through to the KITS booking site for dates
   * past the GTFS calendar window when a `forwardFallback` is configured on
   * the service. Without a fallback, behaves identically to
   * {@link listSchedules}. Prefer this entry point in API/MCP handlers.
   */
  async listSchedulesAsync(
    input: ListSchedulesInput,
  ): Promise<Result<TrainSchedule[]>> {
    const store = this.getStore();
    if (!store.isOutsideCalendarWindow(input.date)) {
      return ok(this.fromGtfs(input, store));
    }
    if (!this.forwardFallback) {
      return store.outsideWindowError(input.date);
    }
    const r = await this.forwardFallback(input);
    if (!r.ok) return r;
    return ok(
      kitsRowsToSchedules({
        rows: r.data,
        date: input.date,
        fromCode: input.from,
        toCode: input.to,
      }),
    );
  }

  private fromGtfs(
    input: ListSchedulesInput,
    store: GtfsStore,
  ): TrainSchedule[] {
    const trips = store.tripsRunningOn(input.date);
    const out: TrainSchedule[] = [];
    for (const trip of trips) {
      const route = store.findRoute(trip.routeId);
      if (!route) continue;
      const service = classifyRoute(route);
      if (service === "Komuter") continue;
      const stopTimes = store.stopTimesForTrip(trip.tripId);
      const fromIdx = stopTimes.findIndex((s) => s.stopId === input.from);
      const toIdx = stopTimes.findIndex((s) => s.stopId === input.to);
      if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) continue;
      const fromSt = stopTimes[fromIdx]!;
      const toSt = stopTimes[toIdx]!;
      const fromStop: Stop = {
        stationCode: fromSt.stopId,
        arrival: null,
        departure: gtfsTimeToIso(input.date, fromSt.departureTime),
      };
      const toStop: Stop = {
        stationCode: toSt.stopId,
        arrival: gtfsTimeToIso(input.date, toSt.arrivalTime),
        departure: null,
      };
      out.push({
        trainNo: trip.tripId,
        service,
        bookingProvider: "KTMB",
        from: fromStop,
        to: toStop,
        classes: [],
        journeyDurationMinutes: minutesBetween(
          fromStop.departure!,
          toStop.arrival!,
        ),
      });
    }
    return out;
  }
}
