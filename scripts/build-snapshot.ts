/**
 * Build-time snapshot generator for the public demo.
 *
 * Loads the live GTFS-Static and GTFS-Realtime feeds via the ktmb library,
 * pre-computes everything the static demo needs, and writes the result as
 * JSON files under `site/data/`. Run by the Deno Deploy build step — see
 * the `deploy.build` field in `deno.json`.
 *
 * Local usage: `pnpm snapshot`
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { GtfsLoader } from "../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../src/core/gtfs/realtime.js";
import { createKtmb } from "../src/core/index.js";
import { err } from "../src/core/result.js";
import { classifyRoute } from "../src/core/schedules/route-classifier.js";
import type { Service } from "../src/core/schedules/route-classifier.js";
import type { KomuterDeparture, Station, TrainSchedule, VehiclePosition } from "../src/core/types.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const OUT_DIR = resolve(process.cwd(), "site/data");
const FORWARD_DAYS = 7;

const LINE_COLORS: Record<string, string> = {
  ETS: "#0066cc",
  Komuter: "#34c759",
  Intercity: "#ff9500",
  ShuttleTebrau: "#af52de",
};

type EnrichedKomuterLine = {
  id: string;
  name: string;
  color: string;
  stations: string[];
};

type EnrichedVehicle = VehiclePosition & {
  kind: "ets" | "komuter" | "intercity" | "shuttle";
  x: number;
  y: number;
};

type EnrichedStation = Station & { lat: number | null; lon: number | null };

type Meta = {
  builtAt: string;
  feedStaticUrl: string;
  calendarWindow: { startDate: string; endDate: string } | null;
  scheduleDates: string[];
  scheduleEntries: number;
  showcaseStations: string[];
  realtimeCapturedAt: string | null;
  realtimeCount: number;
};

const SHOWCASE_LIMIT = 25;

const today = (): string => new Date().toISOString().slice(0, 10);

const addDaysIso = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Project (lat, lon) onto the demo's 800x480 SVG. The viewBox roughly spans
// peninsular Malaysia; calibrated against the station markers in the design
// (e.g. KL Sentral at ~440,280 in viewBox space).
const PROJ = {
  // Bounding box covering Padang Besar (north) to JB Sentral (south)
  // and from west coast to east coast intercity tracks.
  latTop: 6.7, // Padang Besar latitude
  latBottom: 1.45, // JB Sentral latitude
  lonLeft: 100.0,
  lonRight: 104.0,
  width: 800,
  height: 480,
};

const projectLatLon = (lat: number, lon: number): { x: number; y: number } => {
  const x = ((lon - PROJ.lonLeft) / (PROJ.lonRight - PROJ.lonLeft)) * PROJ.width;
  const y = ((PROJ.latTop - lat) / (PROJ.latTop - PROJ.latBottom)) * PROJ.height;
  return {
    x: Math.max(20, Math.min(PROJ.width - 20, x)),
    y: Math.max(20, Math.min(PROJ.height - 20, y)),
  };
};

const writeJson = async (relPath: string, data: unknown): Promise<void> => {
  const full = resolve(OUT_DIR, relPath);
  await writeFile(full, JSON.stringify(data));
};

const log = (...args: unknown[]): void => {
  process.stdout.write(`[snapshot] ${args.join(" ")}\n`);
};

const main = async (): Promise<void> => {
  await mkdir(OUT_DIR, { recursive: true });
  log("loading GTFS-Static from", FEED_STATIC);
  const loader = new GtfsLoader(FEED_STATIC);
  const r = await loader.load();
  if (!r.ok) {
    throw new Error(`GTFS load failed: ${r.error.code} ${r.error.message}`);
  }
  const store = r.data;
  log(
    "loaded",
    store.listStops().length,
    "stops,",
    store.listRoutes().length,
    "routes; calendar window:",
    JSON.stringify(store.calendarWindow),
  );

  // Realtime fetcher returns err in the unrelated case of no vehicles. We
  // surface the error rather than throwing, so a flaky upstream doesn't kill
  // the whole snapshot.
  const ktmb = createKtmb({
    store,
    fareGetter: async () => err("upstream_error", "fares not snapshotted"),
    realtimeFetcher: () => fetchVehiclePositions(FEED_RT),
  });

  // ---- Stations (augmented with lat/lon from the GTFS stops table) ----
  const baseStations: readonly Station[] = ktmb.stations.list();
  const stopByCode = new Map(store.listStops().map((s) => [s.stopId, s]));
  const stations: EnrichedStation[] = baseStations.map((s) => {
    const stop = stopByCode.get(s.code);
    return { ...s, lat: stop?.lat ?? null, lon: stop?.lon ?? null };
  });
  await writeJson("stations.json", stations);
  log("wrote", stations.length, "stations");

  // ---- Showcase stations: the busiest hubs by trip count ----
  // Used to bound the schedule index so the JSON stays manageable.
  const tripCountByStop = new Map<string, number>();
  for (const trip of store.feed.trips) {
    for (const st of store.stopTimesForTrip(trip.tripId)) {
      tripCountByStop.set(st.stopId, (tripCountByStop.get(st.stopId) ?? 0) + 1);
    }
  }
  const showcase = [...tripCountByStop.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, SHOWCASE_LIMIT)
    .map(([code]) => code);
  const showcaseSet = new Set(showcase);
  log("showcase stations (top", SHOWCASE_LIMIT, "by trip count):", showcase.join(","));

  // ---- Komuter lines (enriched with station ordering and a swatch colour) ----
  const lineRes = ktmb.komuter.listLines();
  if (!lineRes.ok) throw new Error(`komuter listLines failed: ${lineRes.error.message}`);
  const lines: EnrichedKomuterLine[] = lineRes.data.map((ln, i) => {
    // First trip of the route exposes the canonical station sequence.
    const trips = store.tripsForRoute(ln.lineId);
    const exemplar = trips[0];
    const stationsOnLine = exemplar
      ? store.stopTimesForTrip(exemplar.tripId).map((s) => s.stopId)
      : [];
    const palette = ["#0066cc", "#34c759", "#ff9500", "#af52de"];
    const color = palette[i % palette.length] ?? "#0066cc";
    return {
      id: ln.lineId,
      name: ln.nameEn,
      color,
      stations: stationsOnLine,
    };
  });
  await writeJson("komuter-lines.json", lines);
  log("wrote", lines.length, "komuter lines");

  // ---- Komuter timetables: every (line, station, today) combo ----
  // Small set: lines × ~7 stations × today = ~21 entries.
  const komuterIndex: Record<string, KomuterDeparture[]> = {};
  const date = today();
  for (const ln of lines) {
    for (const stationCode of ln.stations) {
      const t = ktmb.komuter.getTimetable({ line: ln.id, station: stationCode, date });
      if (t.ok && t.data.length > 0) {
        komuterIndex[`${ln.id}|${stationCode}|${date}`] = t.data;
      }
    }
  }
  await writeJson("komuter.json", komuterIndex);
  log("wrote", Object.keys(komuterIndex).length, "komuter timetable entries");

  // ---- Schedules: all viable (from, to) pairs on each non-Komuter route ----
  // Iterate by trip stop sequence to avoid quadratic blowup on the full
  // station × station grid; only emit pairs that have at least one trip.
  const dates: string[] = [];
  for (let i = 0; i < FORWARD_DAYS; i++) {
    const d = addDaysIso(date, i);
    if (!store.isOutsideCalendarWindow(d)) dates.push(d);
  }
  log("schedule dates within window:", dates.join(", ") || "(none)");

  const schedulePairs = new Set<string>();
  for (const route of store.listRoutes()) {
    if (classifyRoute(route) === "Komuter") continue;
    for (const trip of store.tripsForRoute(route.routeId)) {
      const seq = store.stopTimesForTrip(trip.tripId).map((s) => s.stopId);
      for (let i = 0; i < seq.length; i++) {
        if (!showcaseSet.has(seq[i]!)) continue;
        for (let j = i + 1; j < seq.length; j++) {
          if (!showcaseSet.has(seq[j]!)) continue;
          schedulePairs.add(`${seq[i]}|${seq[j]}`);
        }
      }
    }
  }
  log("viable showcase (from,to) pairs:", schedulePairs.size);

  const scheduleIndex: Record<string, TrainSchedule[]> = {};
  for (const pair of schedulePairs) {
    const [from, to] = pair.split("|") as [string, string];
    for (const d of dates) {
      const res = ktmb.schedules.listSchedules({ from, to, date: d });
      if (res.ok && res.data.length > 0) {
        scheduleIndex[`${from}|${to}|${d}`] = res.data;
      }
    }
  }
  const scheduleEntryCount = Object.keys(scheduleIndex).length;
  await writeJson("schedules.json", scheduleIndex);
  log("wrote", scheduleEntryCount, "schedule entries across", dates.length, "dates");

  // ---- Realtime snapshot ----
  // KTMB's GTFS-RT feed sometimes returns an empty vehicle list for a few
  // seconds at a time. Retry briefly (bypassing RealtimeService's TtlCache by
  // hitting fetchVehiclePositions directly) so we don't ship "0 vehicles" for
  // 24h just because we caught an empty window.
  let realtimeCount = 0;
  let realtimeCapturedAt: string | null = null;
  try {
    const RT_ATTEMPTS = 3;
    const RT_DELAY_MS = 4_000;
    let rt = await fetchVehiclePositions(FEED_RT);
    for (let attempt = 1; attempt < RT_ATTEMPTS; attempt++) {
      if (rt.ok && rt.data.length > 0) break;
      log(`realtime attempt ${attempt} returned ${rt.ok ? rt.data.length : "error"}; retrying in ${RT_DELAY_MS}ms`);
      await new Promise((r) => setTimeout(r, RT_DELAY_MS));
      rt = await fetchVehiclePositions(FEED_RT);
    }
    if (rt.ok) {
      const enriched: EnrichedVehicle[] = rt.data.map((v: VehiclePosition) => {
        const route = v.routeId ? store.findRoute(v.routeId) : undefined;
        const svc: Service = route ? classifyRoute(route) : "ETS";
        const kind: EnrichedVehicle["kind"] =
          svc === "Komuter"
            ? "komuter"
            : svc === "Intercity"
              ? "intercity"
              : svc === "ShuttleTebrau"
                ? "shuttle"
                : "ets";
        const { x, y } = projectLatLon(v.lat, v.lon);
        return { ...v, kind, x, y };
      });
      await writeJson("realtime.json", enriched);
      realtimeCount = enriched.length;
      realtimeCapturedAt = enriched[0]?.timestamp ?? new Date().toISOString();
      log("wrote", realtimeCount, "vehicles");
    } else {
      log("realtime fetch failed:", rt.error.code, rt.error.message);
      await writeJson("realtime.json", []);
    }
  } catch (e) {
    log("realtime fetch threw:", String(e));
    await writeJson("realtime.json", []);
  }

  // ---- Meta ----
  const meta: Meta = {
    builtAt: new Date().toISOString(),
    feedStaticUrl: FEED_STATIC,
    calendarWindow: store.calendarWindow,
    scheduleDates: dates,
    scheduleEntries: scheduleEntryCount,
    showcaseStations: showcase,
    realtimeCapturedAt,
    realtimeCount,
  };
  await writeJson("meta.json", meta);
  log("done — site/data/ ready");
};

main().catch((e: unknown) => {
  process.stderr.write(`[snapshot] FATAL ${String(e)}\n`);
  process.exit(1);
});
