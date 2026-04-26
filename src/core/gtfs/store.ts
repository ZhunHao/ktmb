import type { Calendar, GtfsStop, Route, StaticFeed, StopTime, Trip } from "./types.js";

const dayOfWeekMyt = (yyyymmdd: string): number => {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(5, 7));
  const d = Number(yyyymmdd.slice(8, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const yyyymmdd = (date: string): string => date.replace(/-/g, "");

export class GtfsStore {
  private readonly stopsById = new Map<string, GtfsStop>();
  private readonly routesById = new Map<string, Route>();
  private readonly tripsById = new Map<string, Trip>();
  private readonly stopTimesByTrip = new Map<string, StopTime[]>();
  private readonly calendarByServiceId = new Map<string, Calendar>();
  private readonly tripsByRoute = new Map<string, Trip[]>();

  constructor(public readonly feed: StaticFeed) {
    for (const s of feed.stops) this.stopsById.set(s.stopId, s);
    for (const r of feed.routes) this.routesById.set(r.routeId, r);
    for (const t of feed.trips) {
      this.tripsById.set(t.tripId, t);
      const list = this.tripsByRoute.get(t.routeId) ?? [];
      list.push(t);
      this.tripsByRoute.set(t.routeId, list);
    }
    for (const st of feed.stopTimes) {
      const list = this.stopTimesByTrip.get(st.tripId) ?? [];
      list.push(st);
      this.stopTimesByTrip.set(st.tripId, list);
    }
    for (const c of feed.calendar) this.calendarByServiceId.set(c.serviceId, c);
  }

  findStop(stopId: string): GtfsStop | undefined {
    return this.stopsById.get(stopId);
  }

  listStops(): readonly GtfsStop[] {
    return this.feed.stops;
  }

  findRoute(routeId: string): Route | undefined {
    return this.routesById.get(routeId);
  }

  listRoutes(): readonly Route[] {
    return this.feed.routes;
  }

  findTrip(tripId: string): Trip | undefined {
    return this.tripsById.get(tripId);
  }

  stopTimesForTrip(tripId: string): readonly StopTime[] {
    return this.stopTimesByTrip.get(tripId) ?? [];
  }

  tripsForRoute(routeId: string): readonly Trip[] {
    return this.tripsByRoute.get(routeId) ?? [];
  }

  tripsRunningOn(serviceDate: string): readonly Trip[] {
    const dow = dayOfWeekMyt(serviceDate);
    const ymd = yyyymmdd(serviceDate);
    const eligibleServices = new Set<string>();
    for (const c of this.feed.calendar) {
      if (ymd < c.startDate || ymd > c.endDate) continue;
      if (c.days[dow]) eligibleServices.add(c.serviceId);
    }
    return this.feed.trips.filter((t) => eligibleServices.has(t.serviceId));
  }
}
