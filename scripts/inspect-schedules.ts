/**
 * Print a summary of trips running on a given service date against the live
 * `data.gov.my` GTFS feed: calendar window, route list, first ten departures
 * (sorted by departure time), and a service-class breakdown.
 *
 * Usage:
 *   npx tsx scripts/inspect-schedules.ts 2026-04-27
 *
 * Sibling of `scripts/inspect-gtfs.ts` (which dumps raw feed contents). Useful
 * for verifying the classifier still matches real-world GTFS shapes and for
 * checking how far forward the calendar window currently extends — see
 * CHANGELOG.md for the planned `feed_stale` error and KTMB fallback when a
 * requested date is past the calendar `endDate`.
 */
import { GtfsLoader } from "../src/core/gtfs/loader.js";
import { classifyRoute } from "../src/core/schedules/route-classifier.js";
import { gtfsTimeToIso } from "../src/core/time/gtfs-rollover.js";

const FEED_URL = "https://api.data.gov.my/gtfs-static/ktmb";

interface DepartureRow {
  trainNo: string;
  service: string;
  from: string;
  fromDep: string;
  to: string;
  toArr: string;
}

const main = async (): Promise<void> => {
  const date = process.argv[2];
  if (!date) {
    console.error("usage: npx tsx scripts/inspect-schedules.ts YYYY-MM-DD");
    process.exit(1);
  }

  const loader = new GtfsLoader(FEED_URL);
  const result = await loader.load();
  if (!result.ok) {
    console.error("load failed:", result.error);
    process.exit(1);
  }
  const store = result.data;

  console.log(`Calendar entries (${store.feed.calendar.length}):`);
  for (const c of store.feed.calendar.slice(0, 10)) {
    console.log(
      `  serviceId=${c.serviceId.padEnd(20)} ${c.startDate} → ${c.endDate}  days=[${c.days.join(",")}]`,
    );
  }

  console.log(`\nRoutes (${store.feed.routes.length}):`);
  for (const route of store.feed.routes) {
    console.log(
      `  ${route.routeId.padEnd(15)} type=${route.routeType} short="${route.routeShortName}" long="${route.routeLongName}"`,
    );
  }

  const trips = store.tripsRunningOn(date);
  console.log(`\nTrips running on ${date}: ${trips.length}`);

  const rows: DepartureRow[] = [];
  for (const trip of trips) {
    const route = store.findRoute(trip.routeId);
    if (!route) continue;
    const stopTimes = store.stopTimesForTrip(trip.tripId);
    if (stopTimes.length < 2) continue;
    const first = stopTimes[0]!;
    const last = stopTimes[stopTimes.length - 1]!;
    rows.push({
      trainNo: trip.tripId,
      service: classifyRoute(route),
      from: store.findStop(first.stopId)?.stopName ?? first.stopId,
      fromDep: gtfsTimeToIso(date, first.departureTime),
      to: store.findStop(last.stopId)?.stopName ?? last.stopId,
      toArr: gtfsTimeToIso(date, last.arrivalTime),
    });
  }

  rows.sort((a, b) => a.fromDep.localeCompare(b.fromDep));
  console.log(`\nFirst 10 departures on ${date}:`);
  for (const row of rows.slice(0, 10)) {
    console.log(
      `  ${row.fromDep}  [${row.service.padEnd(14)}] ${row.trainNo.padEnd(20)} ${row.from} → ${row.to} (arr ${row.toArr})`,
    );
  }

  const byService = new Map<string, number>();
  for (const row of rows) byService.set(row.service, (byService.get(row.service) ?? 0) + 1);
  console.log(`\nBy service:`);
  for (const [service, n] of byService) console.log(`  ${service}: ${n}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
