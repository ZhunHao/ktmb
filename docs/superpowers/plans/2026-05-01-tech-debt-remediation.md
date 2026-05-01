# Tech-Debt Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remediate the 17 prioritized tech-debt items from the 2026-05-01 audit (README staleness, periodic GTFS refresh, MCP coverage, dead schema fields, fixture coupling, dependency bumps, CI hygiene, release polish).

**Architecture:** No new architectural direction — surgical fixes to existing modules. The one structural change is making the service layer source-of-truth its `GtfsStore` from a getter so `GtfsLoader.refresh()` can swap in a fresh store while `ktmb-api`/`ktmb-mcp` keep serving requests. Everything else is contained renames, dedup, test additions, and CI tweaks.

**Tech Stack:** Existing — Node 20, TypeScript, vitest 4.x, msw 2.x, Hono 4.x, MCP SDK 1.29.x, undici 8.x, Zod 4.x. No new runtime deps.

**Source audit:** Run `git log --oneline -1` against this repo at the time of writing — head was `dae7c1d` (`feat(schedules): typed outside_calendar_window error with calendar-window introspection`). The audit findings live in the chat history; this plan is the authoritative remediation track.

---

## Conventions used in every task

- Test framework: vitest. Run a single test: `npx vitest run <path>`. Run the suite: `npm test`. Run with coverage: `npm test -- --coverage`.
- Typecheck: `npm run typecheck` (`tsgo --noEmit`). Build: `npm run build`.
- Commit messages follow conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `refactor:`, `ci:`, `build:`, `perf:`).
- Each task ends with a single `git commit`. Never push.
- Do **not** mock the database or HTTP layer with bespoke fakes — use msw for HTTP, real `GtfsStore` instances for in-process tests.
- All public function signatures use the typed `Result<T>` discriminated union from `src/core/result.ts` — never throw across module boundaries.
- Times in `Asia/Kuala_Lumpur` (`+08:00`) only. No naive strings cross module boundaries.
- After each task's tests pass, run `npm run typecheck`. If it fails, fix before committing.
- After each task, run the **full** suite (`npm test`) — coverage hot spots are easy to break.

---

## File map (created or modified by this plan)

**Created**
- `src/runtime/bootstrap.ts` — shared bin runtime (load + periodic refresh + shutdown).
- `tests/unit/runtime/bootstrap.test.ts`
- `tests/integration/mcp/server.test.ts`
- `.github/workflows/smoke.yml`
- `.github/dependabot.yml`
- `.nvmrc`

**Modified**
- `README.md` — drop `feed_stale` future-tense, document shipped 422 typed error.
- `CHANGELOG.md` — phase milestones, version stamps.
- `src/core/gtfs/loader.ts` — in-flight refresh guard, dedup `load`/`refresh`.
- `src/core/index.ts` — accept store getter; re-export `parseDateMyt`; expose `swapStore`.
- `src/core/stations/service.ts`, `src/core/schedules/service.ts`, `src/core/komuter/service.ts` — read store via getter.
- `src/core/types.ts` — drop `KomuterDeparture.platform`.
- `src/core/schedules/route-classifier.ts` — drop `ETS-`, `KOM`, `STT`, `ETS-N` prefix fallbacks (after fixture migration).
- `src/api/server.ts` — fold `notFound` through `errorResponse`.
- `src/api/errors.ts` — keep behavior, add coverage.
- `bin/ktmb-api.ts`, `bin/ktmb-mcp.ts` — call `createKtmbRuntime`, install SIGTERM/SIGINT handlers.
- `tests/unit/core/gtfs/_make-fixture.ts` — real-feed shapes (`route_type=0`, `route_id="ETS"`, `route_id="ST"`).
- All tests that hard-code `"KOM-PK"`, `"ETS-N"`, `"STT"`, `"INT-EKW"` — updated to the new IDs.
- `.github/workflows/ci.yml` — concurrency cancel + Node 22 row.
- `package.json` — major bumps for `csv-parse`, `@hono/node-server`, `typescript` + matching `@typescript/native-preview`.

---

# Phase A — Foundation polish (in-flight v0.2)

Six tasks that close the gap between the typed-error work just shipped and the bin processes that need to keep the GTFS feed fresh.

## Task A1: README — current-tense calendar-window section

**Files:**
- Modify: `README.md` lines 12–37

- [ ] **Step 1: Read the current section**

Run: `sed -n '12,37p' README.md`
Expected: the four-bullet "Known limitations (v0.1.0)" block, including the "Schedule queries past the GTFS calendar window return an empty list" item and the post-bullet paragraph.

- [ ] **Step 2: Replace the calendar-window bullet with a current-tense version, and the trailing paragraph**

Edit the file. Replace this block:

```markdown
- **Schedule queries past the GTFS calendar window return an empty list.** The
  `data.gov.my` GTFS Static feed publishes a fixed calendar window (today: ends
  `20260427`); requests for dates beyond `endDate` resolve to `ok([])` rather
  than a typed error, so consumers can't tell "no trains" from "feed not yet
  refreshed". v0.2 will return a typed `feed_stale` error and (once Task 11
  lands) fall back to the KTMB booking site for forward-dated queries. To check
  the window yourself, run
  `npx tsx scripts/inspect-schedules.ts YYYY-MM-DD`.
```

With:

```markdown
- **Schedule queries past the GTFS calendar window return a typed
  `outside_calendar_window` error.** `GtfsStore` exposes
  `calendarWindow: { startDate, endDate } | null` (YYYY-MM-DD). When a
  requested `date` is outside that window, `SchedulesService.listSchedules`,
  `KomuterService.getTimetable`, `GET /v1/schedules`,
  `GET /v1/komuter/lines/:line/timetable`, and the `list_schedules` /
  `get_komuter_timetable` MCP tools all return
  `err("outside_calendar_window", …)` with the actual window in the
  message. The REST envelope maps that code to **HTTP 422**. Until v0.2's
  KTMB-side fallback for forward-dated queries lands, callers must handle
  this code as a "try again later" signal. To inspect the live window,
  run `npx tsx scripts/inspect-schedules.ts YYYY-MM-DD`.
```

- [ ] **Step 3: Update the trailing paragraph and the v0.2 roadmap bullet**

Replace this block:

```markdown
Schedules, station search, Komuter timetables, and live vehicle positions
work against `data.gov.my`'s GTFS feeds (within the published calendar window)
and are production-ready.
```

With:

```markdown
Schedules, station search, Komuter timetables, and live vehicle positions
work against `data.gov.my`'s GTFS feeds (within the published calendar window
exposed by `GtfsStore.calendarWindow`) and are production-ready.
```

In the "## Roadmap" section, replace this bullet:

```markdown
- File-backed cache for the parsed GTFS Static feed.
```

With:

```markdown
- Periodic GTFS refresh in the bin processes (cold-start + every 6 h).
- KTMB-side fallback for forward-dated `outside_calendar_window` responses.
- File-backed cache for the parsed GTFS Static feed.
```

- [ ] **Step 4: Verify rendering**

Run: `head -50 README.md`
Expected: section reads as current-tense, no occurrences of `feed_stale` or `20260427`.

Run: `grep -n 'feed_stale\|20260427' README.md`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(readme): document shipped outside_calendar_window envelope; drop hardcoded date"
```

---

## Task A2: In-flight refresh guard + dedup `load`/`refresh`

**Files:**
- Modify: `src/core/gtfs/loader.ts`
- Modify: `tests/unit/core/gtfs/loader.test.ts`

- [ ] **Step 1: Write the failing test for in-flight dedup**

Append to `tests/unit/core/gtfs/loader.test.ts`, just before the closing `});`:

```typescript
  it("dedupes concurrent refresh calls into a single fetch", async () => {
    let calls = 0;
    server.use(
      http.get(FEED_URL, () => {
        calls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const loader = new GtfsLoader(FEED_URL);
    const initial = await loader.load();
    expect(initial.ok).toBe(true);
    expect(calls).toBe(1);

    const [a, b] = await Promise.all([loader.refresh(), loader.refresh()]);
    expect(a.ok && b.ok).toBe(true);
    expect(calls).toBe(2);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/core/gtfs/loader.test.ts -t "dedupes concurrent refresh"`
Expected: FAIL — `expected 3 to be 2` (each refresh hits the server independently).

- [ ] **Step 3: Replace the loader body with the guarded version**

Replace the contents of `src/core/gtfs/loader.ts` with:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { FetchOptions } from "../client/http.js";
import { parseStaticFeed } from "./static-parser.js";
import { GtfsStore } from "./store.js";

export class GtfsLoader {
  private store: GtfsStore | undefined;
  private inflight: Promise<Result<GtfsStore>> | undefined;

  constructor(private readonly feedUrl: string) {}

  currentStore(): GtfsStore | undefined {
    return this.store;
  }

  async load(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    if (this.inflight) return this.inflight;
    const p = (async () => {
      const r = await this.fetchAndParse(opts);
      if (r.ok) this.store = r.data;
      return r;
    })();
    this.inflight = p;
    try {
      return await p;
    } finally {
      if (this.inflight === p) this.inflight = undefined;
    }
  }

  refresh(opts: Pick<FetchOptions, "retryDelaysMs"> = {}): Promise<Result<GtfsStore>> {
    return this.load(opts);
  }

  private async fetchAndParse(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    const res = await fetchWithRetry(this.feedUrl, opts);
    if (!res.ok) return res;
    try {
      const buf = new Uint8Array(await res.data.arrayBuffer());
      const feed = parseStaticFeed(buf);
      return ok(new GtfsStore(feed));
    } catch (e) {
      return err("parse_error", "GTFS feed parse failed", e);
    }
  }
}
```

- [ ] **Step 4: Run the failing test to confirm it now passes**

Run: `npx vitest run tests/unit/core/gtfs/loader.test.ts`
Expected: PASS — all four tests in the file pass, `calls` is 2.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all 110 tests pass (109 prior + 1 new), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/core/gtfs/loader.ts tests/unit/core/gtfs/loader.test.ts
git commit -m "fix(gtfs): dedupe concurrent loader.refresh() via in-flight promise guard"
```

---

## Task A3: Refactor services to read store via getter

**Why:** `createKtmb` currently snapshots the `GtfsStore` into `StationsService`/`SchedulesService`/`KomuterService` constructors. Once Task A4 wires periodic refresh, the loader will hold a fresher store but the services will still serve the old one. This task makes services read the live store on every call.

**Files:**
- Modify: `src/core/index.ts`
- Modify: `src/core/stations/service.ts`
- Modify: `src/core/schedules/service.ts`
- Modify: `src/core/komuter/service.ts`
- Modify: `tests/unit/core/stations/service.test.ts`
- Modify: `tests/unit/core/schedules/service.test.ts`
- Modify: `tests/unit/core/komuter/service.test.ts`

> Integration tests in `tests/integration/api/routes.test.ts` and `tests/integration/mcp/tools.test.ts` use `createKtmb({ store, … })` (not service constructors directly) and need no edits — `createKtmb` keeps accepting `store: GtfsStore`. Same with `tests/unit/core/facade.test.ts`.

- [ ] **Step 1: Update `StationsService` to take a getter**

Replace `src/core/stations/service.ts` with:

```typescript
import Fuse from "fuse.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Station } from "../types.js";
import { STATION_OVERLAY } from "./overlay.js";

export class StationsService {
  private all: Station[] = [];
  private byCode = new Map<string, Station>();
  private fuse: Fuse<Station>;
  private lastStore: GtfsStore | undefined;

  constructor(private readonly getStore: () => GtfsStore) {
    this.fuse = new Fuse([], { keys: [], threshold: 0.4 });
    this.rebuild();
  }

  private rebuild(): void {
    const store = this.getStore();
    if (store === this.lastStore) return;
    this.lastStore = store;
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
      };
    });
    this.byCode = new Map(this.all.map((s) => [s.code, s]));
    this.fuse = new Fuse(this.all, {
      keys: [
        { name: "code", weight: 0.5 },
        { name: "nameEn", weight: 0.3 },
        { name: "nameMs", weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }

  getByCode(code: string): Station | undefined {
    this.rebuild();
    return this.byCode.get(code.toUpperCase());
  }

  search(query: string, limit = 10): Station[] {
    this.rebuild();
    const q = query.trim();
    if (!q) return this.all.slice(0, limit);
    return this.fuse.search(q, { limit }).map((r) => r.item);
  }

  list(): readonly Station[] {
    this.rebuild();
    return this.all;
  }
}
```

- [ ] **Step 2: Update `SchedulesService` to take a getter**

Replace the class definition in `src/core/schedules/service.ts` (lines 17 onwards) with:

```typescript
export class SchedulesService {
  constructor(private readonly getStore: () => GtfsStore) {}

  listSchedules(input: ListSchedulesInput): Result<TrainSchedule[]> {
    const store = this.getStore();
    if (store.isOutsideCalendarWindow(input.date)) {
      const w = store.calendarWindow!;
      return err(
        "outside_calendar_window",
        `requested date ${input.date} is outside GTFS calendar window ${w.startDate}..${w.endDate}`,
      );
    }
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
        journeyDurationMinutes: minutesBetween(fromStop.departure!, toStop.arrival!),
      });
    }
    return ok(out);
  }
}
```

- [ ] **Step 3: Update `KomuterService` to take a getter**

Replace the class definition in `src/core/komuter/service.ts` (lines 12 onwards) with:

```typescript
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
```

- [ ] **Step 4: Update `createKtmb` to accept a getter and expose store-swap**

Replace `src/core/index.ts` with:

```typescript
import { TtlCache } from "./client/cache.js";
import type { GtfsStore } from "./gtfs/store.js";
import { KomuterService } from "./komuter/service.js";
import { FareAvailabilityService } from "./schedules/fare-availability.js";
import type { FareGetter } from "./schedules/fare-availability.js";
import { SchedulesService } from "./schedules/service.js";
import { StationsService } from "./stations/service.js";
import { RealtimeService } from "./realtime/service.js";
import type { RealtimeFetcher } from "./realtime/service.js";
import type { TrainClass, VehiclePosition } from "./types.js";

export * from "./types.js";
export * from "./result.js";
export { GtfsStore } from "./gtfs/store.js";
export { GtfsLoader } from "./gtfs/loader.js";
export { parseStaticFeed } from "./gtfs/static-parser.js";
export { fetchVehiclePositions } from "./gtfs/realtime.js";
export { getAvailability as ktmbGetAvailability } from "./ktmb/client.js";
export { parseDateMyt } from "./time/parse-date.js";

export type Ktmb = {
  stations: StationsService;
  schedules: SchedulesService;
  fares: FareAvailabilityService;
  komuter: KomuterService;
  realtime: RealtimeService;
};

export type CreateKtmbOptions = {
  store: GtfsStore;
  fareGetter: FareGetter;
  realtimeFetcher: RealtimeFetcher;
  fareCacheTtlMs?: number;
  realtimeCacheTtlMs?: number;
};

export const createKtmb = (opts: CreateKtmbOptions): Ktmb => {
  let store = opts.store;
  const getStore = (): GtfsStore => store;
  const fareCache = new TtlCache<readonly TrainClass[]>({
    max: 256,
    ttlMs: opts.fareCacheTtlMs ?? 30_000,
  });
  const realtimeCache = new TtlCache<readonly VehiclePosition[]>({
    max: 1,
    ttlMs: opts.realtimeCacheTtlMs ?? 15_000,
  });
  const ktmb: Ktmb & { swapStore: (s: GtfsStore) => void } = {
    stations: new StationsService(getStore),
    schedules: new SchedulesService(getStore),
    fares: new FareAvailabilityService({ getter: opts.fareGetter, cache: fareCache }),
    komuter: new KomuterService(getStore),
    realtime: new RealtimeService({ fetcher: opts.realtimeFetcher, cache: realtimeCache }),
    swapStore: (s) => {
      store = s;
    },
  };
  return ktmb;
};
```

Note: `swapStore` is accessible via a type assertion (`(ktmb as Ktmb & { swapStore(s: GtfsStore): void }).swapStore(...)`). The runtime in Task A4 uses this; the public `Ktmb` type stays narrow.

- [ ] **Step 5: Update unit tests that construct services directly**

In `tests/unit/core/stations/service.test.ts`, find every occurrence of `new StationsService(store)` and change to `new StationsService(() => store)`. Same for `new SchedulesService(store)` in `tests/unit/core/schedules/service.test.ts`, and `new KomuterService(store)` in `tests/unit/core/komuter/service.test.ts`.

If those test files build a store inline in a helper, e.g.:

```typescript
const make = () => new SchedulesService(new GtfsStore(parseStaticFeed(buildMiniFeed())));
```

change to:

```typescript
const make = () => {
  const store = new GtfsStore(parseStaticFeed(buildMiniFeed()));
  return new SchedulesService(() => store);
};
```

Apply the same shape to `service.test.ts` files for stations, schedules, and komuter.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass. If a test fails because it constructs a service with a bare store, fix per the pattern in Step 5.

- [ ] **Step 7: Commit**

```bash
git add src/core/ tests/unit/core/stations/service.test.ts tests/unit/core/schedules/service.test.ts tests/unit/core/komuter/service.test.ts
git commit -m "refactor(core): services read GtfsStore via getter; expose swapStore for hot-refresh"
```

---

## Task A4: Shared bin runtime with periodic refresh + graceful shutdown

**Files:**
- Create: `src/runtime/bootstrap.ts`
- Create: `tests/unit/runtime/bootstrap.test.ts`
- Modify: `bin/ktmb-api.ts`
- Modify: `bin/ktmb-mcp.ts`

- [ ] **Step 1: Write the failing test for `createKtmbRuntime`**

Create `tests/unit/runtime/bootstrap.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createKtmbRuntime } from "../../../src/runtime/bootstrap.js";
import { buildMiniFeed } from "../core/gtfs/_make-fixture.js";

const STATIC = "https://test.invalid/gtfs-static/ktmb";
const RT = "https://test.invalid/gtfs-realtime/vehicle-position/ktmb";

const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterEach(() => server.close());

describe("createKtmbRuntime", () => {
  it("performs a cold-start GTFS load and exposes a working ktmb facade", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 0,
    });
    try {
      const lines = rt.ktmb.komuter.listLines();
      expect(lines.ok).toBe(true);
    } finally {
      rt.shutdown();
    }
  });

  it("schedules a refresh tick that swaps the store on success", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(STATIC, () => {
        calls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 60_000,
    });
    try {
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(60_000);
      // Allow the refresh promise to settle
      await vi.runOnlyPendingTimersAsync();
      expect(calls).toBe(2);
    } finally {
      rt.shutdown();
      vi.useRealTimers();
    }
  });

  it("shutdown() clears the refresh timer", async () => {
    vi.useFakeTimers();
    let calls = 0;
    server.use(
      http.get(STATIC, () => {
        calls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 60_000,
    });
    rt.shutdown();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toBe(1);
    vi.useRealTimers();
  });

  it("rejects when the cold-start load fails", async () => {
    server.use(http.get(STATIC, () => new HttpResponse(null, { status: 503 })));
    await expect(
      createKtmbRuntime({
        feedStaticUrl: STATIC,
        feedRealtimeUrl: RT,
        refreshIntervalMs: 0,
        retryDelaysMs: [1],
      }),
    ).rejects.toThrow(/GTFS load failed/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/runtime/bootstrap.test.ts`
Expected: FAIL — `Cannot find module '../../../src/runtime/bootstrap.js'`.

- [ ] **Step 3: Implement `createKtmbRuntime`**

Create `src/runtime/bootstrap.ts`:

```typescript
import { GtfsLoader } from "../core/gtfs/loader.js";
import { fetchVehiclePositions } from "../core/gtfs/realtime.js";
import type { GtfsStore } from "../core/gtfs/store.js";
import { createKtmb, ktmbGetAvailability, type Ktmb } from "../core/index.js";

export type CreateRuntimeOptions = {
  feedStaticUrl: string;
  feedRealtimeUrl: string;
  refreshIntervalMs?: number;
  retryDelaysMs?: readonly number[];
};

export type Runtime = {
  ktmb: Ktmb;
  loader: GtfsLoader;
  shutdown: () => void;
};

const DEFAULT_REFRESH_MS = 6 * 60 * 60 * 1000;

export const createKtmbRuntime = async (opts: CreateRuntimeOptions): Promise<Runtime> => {
  const loader = new GtfsLoader(opts.feedStaticUrl);
  const initial = await loader.load({ retryDelaysMs: opts.retryDelaysMs });
  if (!initial.ok) {
    throw new Error(
      `GTFS load failed: ${initial.error.code} ${initial.error.message}`,
    );
  }
  const ktmb = createKtmb({
    store: initial.data,
    fareGetter: ktmbGetAvailability,
    realtimeFetcher: () => fetchVehiclePositions(opts.feedRealtimeUrl),
  });
  const swap = (ktmb as Ktmb & { swapStore: (s: GtfsStore) => void }).swapStore;

  const interval = opts.refreshIntervalMs ?? DEFAULT_REFRESH_MS;
  let timer: NodeJS.Timeout | undefined;
  if (interval > 0) {
    timer = setInterval(() => {
      void loader
        .refresh({ retryDelaysMs: opts.retryDelaysMs })
        .then((rr) => {
          if (rr.ok) {
            swap(rr.data);
          } else {
            console.error("[ktmb] refresh failed:", rr.error);
          }
        })
        .catch((e) => {
          console.error("[ktmb] refresh threw:", e);
        });
    }, interval);
    if (timer.unref) timer.unref();
  }

  return {
    ktmb,
    loader,
    shutdown: () => {
      if (timer) clearInterval(timer);
    },
  };
};
```

- [ ] **Step 4: Run the test suite to confirm bootstrap tests pass**

Run: `npx vitest run tests/unit/runtime/bootstrap.test.ts`
Expected: PASS — all four tests.

- [ ] **Step 5: Wire bins through the runtime + add SIGTERM/SIGINT handlers**

Replace `bin/ktmb-api.ts` with:

```typescript
import { serve } from "@hono/node-server";
import { buildApp } from "../src/api/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? 8787);
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const app = buildApp(rt.ktmb);
  const server = serve({ fetch: app.fetch, port });
  console.log(`[ktmb-api] listening on http://localhost:${port}`);

  const stop = (signal: string): void => {
    console.log(`[ktmb-api] ${signal} received, shutting down`);
    rt.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
};

main().catch((e) => {
  console.error("[ktmb-api]", e);
  process.exit(1);
});
```

Replace `bin/ktmb-mcp.ts` with:

```typescript
import { buildMcpServer, runStdio } from "../src/mcp/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const server = buildMcpServer(rt.ktmb);

  const stop = (signal: string): void => {
    console.error(`[ktmb-mcp] ${signal} received, shutting down`);
    rt.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  await runStdio(server);
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
```

- [ ] **Step 6: Build the bins to confirm they compile**

Run: `npm run build`
Expected: `dist/bin/ktmb-api.js` and `dist/bin/ktmb-mcp.js` produced. No type errors.

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/runtime/ tests/unit/runtime/ bin/
git commit -m "feat(runtime): periodic GTFS refresh + graceful SIGTERM via shared bin runtime"
```

---

## Task A5: Fold `app.notFound` through `errorResponse`

**Files:**
- Modify: `src/api/server.ts`

- [ ] **Step 1: Replace the hand-rolled `notFound` body**

In `src/api/server.ts`, replace lines 12–18 (the `app.notFound(...)` block) with:

```typescript
  app.notFound(() => errorResponse("not_found", "no such route"));
```

Add to the imports at the top:

```typescript
import { errorResponse } from "./envelope.js";
```

The full file should now read:

```typescript
import { Hono } from "hono";
import type { Ktmb } from "../core/index.js";
import { errorResponse } from "./envelope.js";
import { onError } from "./errors.js";
import { buildKomuterRouter } from "./routes/komuter.js";
import { buildRealtimeRouter } from "./routes/realtime.js";
import { buildSchedulesRouter } from "./routes/schedules.js";
import { buildStationsRouter } from "./routes/stations.js";

export const buildApp = (ktmb: Ktmb): Hono => {
  const app = new Hono();
  app.onError(onError);
  app.notFound(() => errorResponse("not_found", "no such route"));
  app.get("/healthz", (c) => c.json({ ok: true, data: { status: "ok" } }));
  app.route("/v1/stations", buildStationsRouter(ktmb));
  app.route("/v1/schedules", buildSchedulesRouter(ktmb));
  app.route("/v1/komuter", buildKomuterRouter(ktmb));
  app.route("/v1/realtime", buildRealtimeRouter(ktmb));
  return app;
};
```

- [ ] **Step 2: Run the existing 404 integration test**

Run: `npx vitest run tests/integration/api/routes.test.ts -t "404s for unknown"`
Expected: PASS — `/v1/stations/XXX` still returns 404.

- [ ] **Step 3: Add a regression test for arbitrary 404**

In `tests/integration/api/routes.test.ts`, add inside the `describe("REST routes", ...)` block:

```typescript
  it("returns the standard envelope on 404 for unmatched routes", async () => {
    const res = await app.request("/v1/no-such-path");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: false; error: { code: string; message: string } };
    expect(body).toEqual({ ok: false, error: { code: "not_found", message: "no such route" } });
  });
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/integration/api/routes.test.ts`
Expected: PASS — all routes tests pass.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/server.ts tests/integration/api/routes.test.ts
git commit -m "refactor(api): fold notFound through errorResponse to prevent envelope drift"
```

---

## Task A6: Re-export `parseDateMyt` (and add a regression test)

`parseDateMyt` was already added to `src/core/index.ts` in Task A3 Step 4. This task just adds the regression test that catches a future removal.

**Files:**
- Modify: `tests/unit/core/facade.test.ts`

- [ ] **Step 1: Read the existing facade test**

Run: `cat tests/unit/core/facade.test.ts`
Note its imports and the pattern it uses to assert public-surface exports.

- [ ] **Step 2: Add a re-export assertion**

Append inside the existing `describe(...)` block (the file already exists per `tests/unit/core/facade.test.ts`):

```typescript
  it("re-exports parseDateMyt from the public surface", async () => {
    const mod = await import("../../../src/core/index.js");
    expect(typeof mod.parseDateMyt).toBe("function");
    const r = mod.parseDateMyt("2026-05-01", new Date("2026-05-01T00:00:00Z"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toBe("2026-05-01");
  });
```

- [ ] **Step 3: Run the test**

Run: `npx vitest run tests/unit/core/facade.test.ts`
Expected: PASS — Task A3 already added the export.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/core/facade.test.ts
git commit -m "test(core): regression-test parseDateMyt public re-export"
```

---

## Task A7: Phase A version stamp + CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add an `Added`/`Fixed`/`Changed` block under `[Unreleased]`**

Insert after the existing `### Added` block (which contains the `outside_calendar_window` entry):

```markdown
- **Periodic GTFS refresh in the bin processes.** Both `ktmb-api` and
  `ktmb-mcp` now perform a cold-start `GtfsLoader.load()` and then refresh
  every `KTMB_REFRESH_MS` (default 6 h) through a shared
  `src/runtime/bootstrap.ts` runtime. A successful refresh hot-swaps the
  store on the live `Ktmb` facade — services read the live store via a
  getter, so in-flight requests see the new feed without restart. Concurrent
  `loader.refresh()` calls share a single fetch via an in-flight promise
  guard. SIGTERM and SIGINT now drain the HTTP server / stdio transport
  before exit.

### Changed

- **Service layer reads `GtfsStore` via a getter.** `StationsService`,
  `SchedulesService`, and `KomuterService` constructors now take
  `() => GtfsStore` instead of a `GtfsStore` snapshot. The public
  `createKtmb({ store, … })` signature is unchanged; library consumers
  constructing services directly must pass a closure.
- **`app.notFound` returns the standard envelope** through `errorResponse`
  instead of hand-rolled JSON.

### Removed

- **Stale `feed_stale` planned-error language in the README.** The shipped
  surface is `outside_calendar_window` mapped to HTTP 422.
```

- [ ] **Step 2: Verify CHANGELOG renders cleanly**

Run: `head -80 CHANGELOG.md`
Expected: the new blocks appear under `[Unreleased]`, no broken markdown.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): record phase A — periodic refresh, store getter, notFound envelope"
```

---

# Phase B — v0.2 hardening

Five tasks raising coverage and tightening the surface.

## Task B1: MCP `buildMcpServer` registration test

**Files:**
- Create: `tests/integration/mcp/server.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/integration/mcp/server.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildMcpServer } from "../../../src/mcp/server.js";
import { createKtmb } from "../../../src/core/index.js";
import { GtfsStore } from "../../../src/core/gtfs/store.js";
import { parseStaticFeed } from "../../../src/core/gtfs/static-parser.js";
import { ok } from "../../../src/core/result.js";
import { buildMiniFeed } from "../../unit/core/gtfs/_make-fixture.js";

const ktmb = createKtmb({
  store: new GtfsStore(parseStaticFeed(buildMiniFeed())),
  fareGetter: async () => ok([]),
  realtimeFetcher: async () => ok([]),
});

const TOOL_NAMES = [
  "search_stations",
  "list_schedules",
  "get_fare_availability",
  "list_komuter_lines",
  "get_komuter_timetable",
  "get_vehicle_positions",
] as const;

describe("buildMcpServer", () => {
  it("registers all six MCP tools by name", () => {
    const server = buildMcpServer(ktmb);
    const inner = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(Object.keys(inner).sort()).toEqual([...TOOL_NAMES].sort());
  });

  it("each registered tool has a non-empty description", () => {
    const server = buildMcpServer(ktmb);
    const inner = (
      server as unknown as {
        _registeredTools: Record<string, { description?: string }>;
      }
    )._registeredTools;
    for (const name of TOOL_NAMES) {
      expect(inner[name]?.description ?? "").not.toBe("");
    }
  });
});
```

> Note on the `_registeredTools` cast: the MCP SDK exposes registered tools via a non-public field on `McpServer`. If the field name changes in a future MCP SDK release, update both assertions to whatever the new accessor is. As of `@modelcontextprotocol/sdk` 1.29, this is the only stable way to introspect registrations without a transport.

- [ ] **Step 2: Run the test to confirm it passes**

Run: `npx vitest run tests/integration/mcp/server.test.ts`
Expected: PASS — both tests.

- [ ] **Step 3: Confirm coverage moved**

Run: `npm test -- --coverage 2>&1 | grep 'mcp/server.ts'`
Expected: `mcp/server.ts` line coverage above 0% (target ≥ 80%).

- [ ] **Step 4: Commit**

```bash
git add tests/integration/mcp/server.test.ts
git commit -m "test(mcp): cover buildMcpServer tool registration"
```

---

## Task B2: Cover `api/errors.ts` `onError`

**Files:**
- Create: `tests/unit/api/errors.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/unit/api/errors.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { onError } from "../../../src/api/errors.js";

describe("api onError", () => {
  it("returns the upstream_error envelope and logs the cause", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const app = new Hono();
      app.onError(onError);
      app.get("/boom", () => {
        throw new Error("kaboom");
      });
      const res = await app.request("/boom");
      expect(res.status).toBe(502);
      const body = (await res.json()) as { ok: false; error: { code: string; message: string } };
      expect(body).toEqual({
        ok: false,
        error: { code: "upstream_error", message: "internal error" },
      });
      expect(spy).toHaveBeenCalledWith("[api] unhandled", expect.any(Error));
    } finally {
      spy.mockRestore();
    }
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/unit/api/errors.test.ts`
Expected: PASS.

- [ ] **Step 3: Confirm coverage moved**

Run: `npm test -- --coverage 2>&1 | grep 'api/errors.ts'`
Expected: `errors.ts` at 100%.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/api/errors.test.ts
git commit -m "test(api): cover onError envelope shape and console logging"
```

---

## Task B3: Drop `KomuterDeparture.platform` (dead schema field)

**Why:** Declared in the public Zod schema since v0.1.0 but never populated. GTFS Static for KTMB carries no platform data; surfacing the field implies a guarantee we can't keep.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `tests/unit/core/types.test.ts`

- [ ] **Step 1: Drop the field from the schema**

In `src/core/types.ts`, change:

```typescript
export const KomuterDepartureSchema = z.object({
  trainNo: z.string().min(1),
  line: z.string().min(1),
  departure: Iso8601MyT,
  platform: z.string().optional(),
});
```

to:

```typescript
export const KomuterDepartureSchema = z.object({
  trainNo: z.string().min(1),
  line: z.string().min(1),
  departure: Iso8601MyT,
});
```

- [ ] **Step 2: Search for any consumers**

Run: `grep -RIn 'platform' src tests | grep -v node_modules`
Expected: no occurrences in `src/`. If a test in `tests/unit/core/types.test.ts` exercises the field, drop that case.

- [ ] **Step 3: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts tests/unit/core/types.test.ts
git commit -m "feat(types)!: drop unused KomuterDeparture.platform field

BREAKING CHANGE: KomuterDeparture no longer carries an optional
platform field. KTMB GTFS Static does not publish platform data;
the field has been undefined since v0.1.0 and is dropped before
v0.2.0."
```

---

## Task B4: CI concurrency cancel + Node 22 row + nightly smoke

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/smoke.yml`
- Create: `.nvmrc`

- [ ] **Step 1: Add concurrency cancellation and Node matrix to ci.yml**

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm vitest run --coverage
      - run: pnpm build
```

- [ ] **Step 2: Create the nightly smoke workflow**

Create `.github/workflows/smoke.yml`:

```yaml
name: Live smoke
on:
  schedule:
    - cron: '17 2 * * *'
  workflow_dispatch:
concurrency:
  group: smoke
  cancel-in-progress: false
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Run live smoke against data.gov.my
        env:
          KTMB_SMOKE: '1'
        run: pnpm vitest run tests/smoke/gtfs.test.ts
```

- [ ] **Step 3: Pin local Node via `.nvmrc`**

Create `.nvmrc` containing exactly:

```
20
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/smoke.yml .nvmrc
git commit -m "ci: concurrency cancel, Node 22 matrix row, nightly KTMB_SMOKE job, .nvmrc"
```

---

## Task B5: Branch coverage tightening on retry/HTTP path

**Files:**
- Modify: `tests/unit/core/client/http.test.ts`

- [ ] **Step 1: Read current http test coverage gaps**

Run: `npm test -- --coverage 2>&1 | grep 'http.ts'`
Expected: lines 30–31, 46, 81 uncovered. These correspond to the **429 rate_limited** mapping in `codeForStatus`, the **text() pass-through** on `ResponseLike`, and the **network-exception** branch where `undiciFetch` throws (rather than returning a non-OK response).

The existing test file (`tests/unit/core/client/http.test.ts`) already covers the 200, 5xx-then-success, 4xx-no-retry, and 5xx-exhausted paths. This step adds the three remaining branches.

- [ ] **Step 2: Add tests for the three uncovered branches**

Append the following inside the existing `describe("fetchWithRetry", () => { … })` block in `tests/unit/core/client/http.test.ts` (just before the final `});`):

```typescript
  it("maps HTTP 429 to rate_limited", async () => {
    server.use(
      http.get("https://example.test/data", () => new HttpResponse(null, { status: 429 })),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("rate_limited");
  });

  it("exposes text() on the ResponseLike wrapper", async () => {
    server.use(
      http.get("https://example.test/text", () =>
        new HttpResponse("plain body", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const r = await fetchWithRetry("https://example.test/text");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await r.data.text()).toBe("plain body");
  });

  it("retries through a network exception and gives up with upstream_error", async () => {
    let calls = 0;
    server.use(
      http.get("https://example.test/data", () => {
        calls += 1;
        return HttpResponse.error();
      }),
    );
    const r = await fetchWithRetry("https://example.test/data", { retryDelaysMs: [1, 1] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("upstream_error");
    expect(r.error.message).toContain("network error");
    expect(calls).toBeGreaterThanOrEqual(2);
  });
```

- [ ] **Step 3: Run the http tests**

Run: `npx vitest run tests/unit/core/client/http.test.ts`
Expected: PASS.

- [ ] **Step 4: Confirm branch coverage moved**

Run: `npm test -- --coverage 2>&1 | grep 'http.ts'`
Expected: branch coverage > 90% on `http.ts`. Project branch coverage should now be ≥ 80%.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/core/client/http.test.ts
git commit -m "test(http): cover 4xx fast-fail, 5xx retry-give-up, network-error give-up"
```

---

# Phase C — v0.3 prep

Three tasks. The KTMB live booking endpoint capture (originally C1) is **deferred** because it requires manual network capture against `online.ktmb.com.my`. Write a separate plan after the capture lands.

## Task C1: Populate `Station.lines` from the route classifier

**Files:**
- Modify: `src/core/stations/service.ts`
- Modify: `tests/unit/core/stations/service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/core/stations/service.test.ts` (inside the existing `describe`):

```typescript
  it("populates Station.lines from classifyRoute over trips that visit the stop", () => {
    const store = new GtfsStore(parseStaticFeed(buildMiniFeed()));
    const svc = new StationsService(() => store);
    const kul = svc.getByCode("KUL");
    expect(kul?.lines).toEqual(expect.arrayContaining(["ETS", "Komuter"]));

    const jbs = svc.getByCode("JBS");
    expect(jbs?.lines).toEqual(expect.arrayContaining(["Intercity", "ShuttleTebrau"]));

    const tpt = svc.getByCode("TPT");
    expect(tpt?.lines).toEqual(["Intercity"]);
  });
```

(The fixture's KUL is on the ETS Northbound trip and the Port Klang Komuter trip; JBS sees Ekspres Rakyat (Intercity) and Shuttle Tebrau; TPT only sees Ekspres Rakyat.)

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npx vitest run tests/unit/core/stations/service.test.ts -t "populates Station.lines"`
Expected: FAIL — `expected undefined to deep equal …`.

- [ ] **Step 3: Compute lines in the rebuild path**

In `src/core/stations/service.ts`, replace the `private rebuild()` method body with:

```typescript
  private rebuild(): void {
    const store = this.getStore();
    if (store === this.lastStore) return;
    this.lastStore = store;

    const linesByStop = new Map<string, Set<Service>>();
    for (const route of store.listRoutes()) {
      const service = classifyRoute(route);
      const trips = store.tripsForRoute(route.routeId);
      for (const trip of trips) {
        for (const st of store.stopTimesForTrip(trip.tripId)) {
          let bag = linesByStop.get(st.stopId);
          if (!bag) {
            bag = new Set();
            linesByStop.set(st.stopId, bag);
          }
          bag.add(service);
        }
      }
    }

    const orderRank: Record<Service, number> = {
      ETS: 0,
      Intercity: 1,
      Komuter: 2,
      ShuttleTebrau: 3,
    };
    this.all = store.listStops().map((s) => {
      const overlay = STATION_OVERLAY[s.stopId];
      const set = linesByStop.get(s.stopId);
      const lines = set
        ? [...set].sort((a, b) => orderRank[a] - orderRank[b])
        : undefined;
      return {
        code: s.stopId,
        nameEn: s.stopName,
        nameMs: overlay?.nameMs ?? s.stopName,
        country: overlay?.country ?? "MY",
        ...(lines ? { lines } : {}),
      };
    });
    this.byCode = new Map(this.all.map((s) => [s.code, s]));
    this.fuse = new Fuse(this.all, {
      keys: [
        { name: "code", weight: 0.5 },
        { name: "nameEn", weight: 0.3 },
        { name: "nameMs", weight: 0.2 },
      ],
      threshold: 0.4,
      includeScore: true,
    });
  }
```

Add the import at the top of the file:

```typescript
import { classifyRoute } from "../schedules/route-classifier.js";
import type { Service } from "../schedules/route-classifier.js";
```

- [ ] **Step 4: Run the failing test**

Run: `npx vitest run tests/unit/core/stations/service.test.ts -t "populates Station.lines"`
Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/stations/service.ts tests/unit/core/stations/service.test.ts
git commit -m "feat(stations): populate Station.lines from classifyRoute over visiting trips"
```

---

## Task C2: Fixture migration to real-feed shapes + drop prefix fallbacks

**Why:** The synthetic fixture (`tests/unit/core/gtfs/_make-fixture.ts`) uses route IDs that don't exist in the real `data.gov.my` feed (`KOM-PK`, `ETS-N`, `STT`, `INT-EKW`). The classifier carries fallbacks for those prefixes. Migrate the fixture to real-feed shapes so the prefix branches can be deleted.

**Files:**
- Modify: `tests/unit/core/gtfs/_make-fixture.ts`
- Modify: `src/core/schedules/route-classifier.ts`
- Modify: `tests/unit/core/schedules/route-classifier.test.ts`
- Modify: `tests/unit/core/komuter/service.test.ts`
- Modify: `tests/unit/core/realtime/service.test.ts`
- Modify: `tests/unit/core/gtfs/realtime.test.ts`
- Modify: `tests/integration/api/routes.test.ts`
- Modify: `tests/integration/mcp/tools.test.ts`

- [ ] **Step 1: Update the fixture to real-feed shapes**

Replace the `routes.txt` and `trips.txt` blocks in `tests/unit/core/gtfs/_make-fixture.ts` with:

```typescript
    "routes.txt": strToU8(
      [
        "route_id,agency_id,route_short_name,route_long_name,route_type",
        "ETS,KTMB,EG,Electric Train Service Northbound,2",
        "KC05_KB18,KTMB,KP,Komuter Port Klang Line,0",
        "ERT,KTMB,EW,Ekspres Rakyat Timuran,2",
        "ST,KTMB,ST,Shuttle Tebrau,2",
      ].join("\n") + "\n",
    ),
```

```typescript
    "trips.txt": strToU8(
      [
        "route_id,service_id,trip_id,trip_headsign",
        "ETS,WD,EG9322,Butterworth",
        "ERT,WD,EW27,Tumpat",
        "ST,WD,ST101,Woodlands CIQ",
        "KC05_KB18,WD,K2412,Port Klang",
      ].join("\n") + "\n",
    ),
```

- [ ] **Step 2: Update tests that hardcode old route IDs**

In each of the listed test files, do a global rename in that file only:

| Old | New |
| --- | --- |
| `"KOM-PK"` | `"KC05_KB18"` |
| `"ETS-N"` | `"ETS"` |
| `"INT-EKW"` | `"ERT"` |
| `"STT"` | `"ST"` |

Files to edit (and their occurrences are listed in the audit):

```
tests/unit/core/komuter/service.test.ts          (3× "KOM-PK")
tests/unit/core/gtfs/realtime.test.ts            (1× "ETS-N")
tests/unit/core/schedules/route-classifier.test.ts (4× across ETS-N, KOM-PK, INT-EKW, STT)
tests/unit/core/realtime/service.test.ts         (3× "ETS-N", "KOM-PK")
tests/integration/api/routes.test.ts             (2× "KOM-PK")
tests/integration/mcp/tools.test.ts              (2× "KOM-PK")
```

> The route-classifier test file changes more deeply: the test cases that exercise the prefix fallbacks lose their reason to exist. Replace the file's body with:

```typescript
import { describe, expect, it } from "vitest";
import { classifyRoute } from "../../../../src/core/schedules/route-classifier.js";

describe("classifyRoute", () => {
  it("classifies ETS by route_id", () => {
    expect(
      classifyRoute({ routeId: "ETS", routeShortName: "EG", routeLongName: "" }),
    ).toBe("ETS");
  });

  it("classifies ETS by route_long_name substring", () => {
    expect(
      classifyRoute({
        routeId: "X",
        routeShortName: "",
        routeLongName: "Electric Train Service Southbound",
      }),
    ).toBe("ETS");
  });

  it("classifies Komuter by route_type=0", () => {
    expect(
      classifyRoute({
        routeId: "KC05_KB18",
        routeShortName: "KP",
        routeLongName: "",
        routeType: 0,
      }),
    ).toBe("Komuter");
  });

  it("classifies Shuttle Tebrau by route_id", () => {
    expect(
      classifyRoute({ routeId: "ST", routeShortName: "ST", routeLongName: "Shuttle Tebrau" }),
    ).toBe("ShuttleTebrau");
  });

  it("classifies Intercity Shuttle Tumpat-Gemas (SH) as Intercity, not ShuttleTebrau", () => {
    expect(
      classifyRoute({
        routeId: "SH",
        routeShortName: "SH",
        routeLongName: "Intercity Shuttle Tumpat - Gemas",
      }),
    ).toBe("Intercity");
  });

  it("falls through to Intercity for unrecognized routes", () => {
    expect(
      classifyRoute({ routeId: "ERT", routeShortName: "EW", routeLongName: "Ekspres Rakyat" }),
    ).toBe("Intercity");
  });
});
```

- [ ] **Step 3: Drop the prefix fallbacks from the classifier**

Replace `src/core/schedules/route-classifier.ts` with:

```typescript
export type Service = "ETS" | "Intercity" | "Komuter" | "ShuttleTebrau";

export interface RouteLike {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  routeType?: number;
}

export const classifyRoute = (route: RouteLike): Service => {
  const id = route.routeId.toUpperCase();
  const long = route.routeLongName.toUpperCase();
  const short = route.routeShortName.toUpperCase();

  if (route.routeType === 0) return "Komuter";

  if (id === "ETS" || short === "ETS" || long.includes("ELECTRIC TRAIN SERVICE")) {
    return "ETS";
  }

  if (id === "ST" || long.includes("SHUTTLE TEBRAU")) {
    return "ShuttleTebrau";
  }

  return "Intercity";
};
```

- [ ] **Step 4: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass. If any test references an old ID that wasn't in the audit table, replace it per Step 2's pattern.

- [ ] **Step 5: Run the smoke test against the live feed (optional, manual)**

Run: `KTMB_SMOKE=1 npx vitest run tests/smoke/gtfs.test.ts`
Expected: PASS — the classifier now treats `route_type=0` and exact `ETS`/`ST` IDs the way the real feed publishes them. Skip if no network.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/core/gtfs/_make-fixture.ts tests/unit/core/schedules/route-classifier.test.ts tests/unit/core/komuter/ tests/unit/core/realtime/ tests/unit/core/gtfs/realtime.test.ts tests/integration/ src/core/schedules/route-classifier.ts
git commit -m "refactor(classifier): drop synthetic prefix fallbacks; fixture matches real GTFS shape"
```

---

## Task C3: Major-version dependency bumps

Three independent commits — one per major. Do not batch; if one breaks, you want to bisect cleanly.

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1: Bump `csv-parse` 5 → 6**

Run: `pnpm add csv-parse@^6 && pnpm install`
Expected: `package.json` shows `"csv-parse": "^6.x.x"`.

Run: `npm run typecheck && npm test`
Expected: all tests pass. The CSV parser interface used in `src/core/gtfs/static-parser.ts` is `parse(input, { columns: true, skip_empty_lines: true, trim: true })`; v6 keeps that surface, but if the import path changed, follow the migration note in the v6 release.

- [ ] **Step 2: Commit `csv-parse` bump**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(deps): csv-parse 5.6 → 6.x"
```

- [ ] **Step 3: Bump `@hono/node-server` 1 → 2**

Run: `pnpm add -D @hono/node-server@^2 && pnpm install`
Expected: `package.json` devDeps show `"@hono/node-server": "^2.x.x"`.

Run: `npm run build && node dist/bin/ktmb-api.js & SERVER_PID=$! ; sleep 2 ; curl -fsS http://localhost:8787/healthz ; kill $SERVER_PID`
Expected: `{"ok":true,"data":{"status":"ok"}}` printed; the bin starts and serves `/healthz`.

If the v2 `serve()` signature changed, adjust the call in `bin/ktmb-api.ts` per the v2 release notes.

- [ ] **Step 4: Commit `@hono/node-server` bump**

```bash
git add package.json pnpm-lock.yaml bin/ktmb-api.ts
git commit -m "build(deps): @hono/node-server 1.19 → 2.x"
```

- [ ] **Step 5: Bump `typescript` 5.9 → 6 and `@typescript/native-preview` to its 7.x preview**

Run: `pnpm add -D typescript@^6 @typescript/native-preview@latest && pnpm install`
Expected: both bumped in `package.json`.

Run: `npm run typecheck && npm test && npm run build`
Expected: all green. If `tsgo` flags new strictness errors, fix them in this commit (don't add `// @ts-expect-error` to bypass).

- [ ] **Step 6: Commit TypeScript bump**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(deps): typescript 5.9 → 6.x with matching tsgo preview"
```

---

# Phase D — Release polish

Two tasks taking the project to a publishable shape.

## Task D1: Dependabot + CONTRIBUTING + SECURITY

**Files:**
- Create: `.github/dependabot.yml`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`

- [ ] **Step 1: Add Dependabot config**

Create `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    open-pull-requests-limit: 5
    groups:
      patches:
        update-types: [patch]
      minors:
        update-types: [minor]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
```

- [ ] **Step 2: Add CONTRIBUTING.md**

Create `CONTRIBUTING.md`:

```markdown
# Contributing to ktmb

Thanks for your interest. ktmb is an unofficial library — we cannot
speak for KTMB or `data.gov.my`. By contributing you agree to the MIT
license in [LICENSE](LICENSE).

## Local setup

```bash
git clone https://github.com/zhunhao/ktmb.git
cd ktmb
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Use Node 20 (see `.nvmrc`).

## Workflow

1. Open an issue first for non-trivial changes — especially anything
   that changes the public Zod schemas in `src/core/types.ts` or the
   `Result<T>` envelope.
2. Branch from `main`. Conventional-commits messages (`feat:`, `fix:`,
   `refactor:`, `test:`, `docs:`, `chore:`, `build:`, `ci:`).
3. TDD: write the failing test, then the minimal implementation. Keep
   coverage ≥ 80% statements / ≥ 80% branches.
4. Run `pnpm typecheck && pnpm test && pnpm build` before pushing.
5. PR description: what changed, why, how it was tested. Link the
   issue. Note any breaking changes in the title with `!` and in the
   body with `BREAKING CHANGE:`.

## Live-data smoke

`tests/smoke/gtfs.test.ts` is gated on `KTMB_SMOKE=1` and hits the live
`data.gov.my` feeds. Set the env var locally before running if you're
touching the GTFS adapter or the route classifier.

## Releases

`main` is always releasable. Version bumps are tagged from `main` after
the changelog is moved out of `[Unreleased]`.
```

- [ ] **Step 3: Add SECURITY.md**

Create `SECURITY.md`:

```markdown
# Security policy

## Supported versions

The latest released minor version on `main` is supported. Prior minors
are not patched.

## Reporting a vulnerability

Email zhunhaowong@gmail.com with subject prefix `[ktmb security]`.
Please do not file a public GitHub issue for security-sensitive
findings. We aim to respond within 7 days.

## Out of scope

- Misuse of the upstream `online.ktmb.com.my` booking site (not our
  property; report to KTMB directly).
- Issues in `data.gov.my` GTFS publication (report to MAMPU).
- Lack of authentication / rate-limiting on `ktmb-api` deployments —
  this library does not provide an auth layer; operators are
  responsible for fronting the bin with their own gateway.
```

- [ ] **Step 4: Commit**

```bash
git add .github/dependabot.yml CONTRIBUTING.md SECURITY.md
git commit -m "chore: add dependabot, CONTRIBUTING, SECURITY"
```

---

## Task D2: Bin smoke job in CI + structured logger seam

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `src/runtime/logger.ts`
- Modify: `src/runtime/bootstrap.ts`
- Modify: `src/api/errors.ts`
- Create: `tests/unit/runtime/logger.test.ts`

The structured logger is a *seam*, not a full implementation. The point is to make `console.error` swappable so a future deployment can pipe to pino/winston without forking the code.

- [ ] **Step 1: Add a bin-import smoke step to CI**

Edit `.github/workflows/ci.yml` to add a final step on the `test` job after the `pnpm build` step:

```yaml
      - name: Smoke-import the built bins
        run: |
          node --input-type=module -e "import('./dist/bin/ktmb-api.js').catch((e) => { console.error('ktmb-api import failed:', e); process.exit(1); })" &
          API_PID=$!
          sleep 1
          kill $API_PID 2>/dev/null || true
          node --input-type=module -e "import('./dist/bin/ktmb-mcp.js').catch((e) => { console.error('ktmb-mcp import failed:', e); process.exit(1); })" &
          MCP_PID=$!
          sleep 1
          kill $MCP_PID 2>/dev/null || true
          echo 'bins imported cleanly'
```

> Note: this validates the bins parse and reach `main()` without runtime errors caused by missing exports. It does not validate live behavior — that's the smoke workflow's job.

- [ ] **Step 2: Write the logger test**

Create `tests/unit/runtime/logger.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createLogger, type Logger } from "../../../src/runtime/logger.js";

describe("createLogger", () => {
  it("captures messages on the in-memory transport", () => {
    const sink: Array<{ level: string; msg: string; err?: unknown }> = [];
    const log: Logger = createLogger({
      transport: (rec) => {
        sink.push(rec);
      },
    });
    log.info("hello", { foo: 1 });
    log.error("boom", new Error("nope"));
    expect(sink).toEqual([
      { level: "info", msg: "hello", err: { foo: 1 } },
      { level: "error", msg: "boom", err: expect.any(Error) },
    ]);
  });
});
```

- [ ] **Step 3: Implement the logger seam**

Create `src/runtime/logger.ts`:

```typescript
export type LogLevel = "info" | "error";

export type LogRecord = {
  level: LogLevel;
  msg: string;
  err?: unknown;
};

export type Logger = {
  info: (msg: string, err?: unknown) => void;
  error: (msg: string, err?: unknown) => void;
};

export type LoggerOptions = {
  transport?: (rec: LogRecord) => void;
};

const consoleTransport = (rec: LogRecord): void => {
  if (rec.level === "error") {
    if (rec.err !== undefined) console.error(rec.msg, rec.err);
    else console.error(rec.msg);
  } else {
    if (rec.err !== undefined) console.log(rec.msg, rec.err);
    else console.log(rec.msg);
  }
};

export const createLogger = (opts: LoggerOptions = {}): Logger => {
  const transport = opts.transport ?? consoleTransport;
  return {
    info: (msg, err) =>
      transport(err === undefined ? { level: "info", msg } : { level: "info", msg, err }),
    error: (msg, err) =>
      transport(err === undefined ? { level: "error", msg } : { level: "error", msg, err }),
  };
};
```

- [ ] **Step 4: Run the logger test**

Run: `npx vitest run tests/unit/runtime/logger.test.ts`
Expected: PASS.

- [ ] **Step 5: Use the logger from `bootstrap.ts` and `api/errors.ts`**

In `src/runtime/bootstrap.ts`, add at the top:

```typescript
import { createLogger, type Logger } from "./logger.js";
```

Add `logger?: Logger` to `CreateRuntimeOptions`. Replace both `console.error("[ktmb] refresh failed:", rr.error);` and `console.error("[ktmb] refresh threw:", e);` with:

```typescript
const logger = opts.logger ?? createLogger();
// ...
logger.error("[ktmb] refresh failed", rr.error);
// ...
logger.error("[ktmb] refresh threw", e);
```

In `src/api/errors.ts`, replace its body with:

```typescript
import type { Context } from "hono";
import { errorResponse } from "./envelope.js";
import { createLogger, type Logger } from "../runtime/logger.js";

let activeLogger: Logger = createLogger();

export const setApiLogger = (logger: Logger): void => {
  activeLogger = logger;
};

export const onError = (e: unknown, _c: Context): Response => {
  activeLogger.error("[api] unhandled", e);
  return errorResponse("upstream_error", "internal error");
};
```

Update the existing test in `tests/unit/api/errors.test.ts` (created in Task B2) to assert the same console.error path still fires when no custom logger is set — Step 1 of B2 already exercises it via `vi.spyOn(console, "error")`.

- [ ] **Step 6: Run the full suite + typecheck**

Run: `npm run typecheck && npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml src/runtime/logger.ts src/runtime/bootstrap.ts src/api/errors.ts tests/unit/runtime/logger.test.ts
git commit -m "feat(runtime): logger seam + CI bin-import smoke

Provides a swappable transport so deployments can route ktmb logs
to pino/winston/etc. Defaults to console. CI now exercises the
built bins to catch broken exports before publish."
```

---

## Task D3: Cut v0.2.0

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `src/mcp/server.ts` (version string)

- [ ] **Step 1: Move `[Unreleased]` content under a new version header**

In `CHANGELOG.md`, change:

```markdown
## [Unreleased]

Tracked follow-ups for the next minor release. ...
```

to:

```markdown
## [Unreleased]

### Planned

- _(empty — file new entries here as Phase C/D land further work)_

## [0.2.0] - 2026-05-01

```

…and keep the existing `### Added`, `### Changed`, `### Removed`, `### Fixed`, `### Planned` sections that were under the old `[Unreleased]`. (The `Planned` block under 0.2.0 documents *what we plan to do in 0.3*.)

- [ ] **Step 2: Bump `package.json` version**

In `package.json`, change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 3: Bump the MCP server `version` literal**

In `src/mcp/server.ts`, change:

```typescript
  const server = new McpServer({ name: "ktmb", version: "0.1.0" });
```

to:

```typescript
  const server = new McpServer({ name: "ktmb", version: "0.2.0" });
```

- [ ] **Step 4: Run the full suite + typecheck + build**

Run: `npm run typecheck && npm test && npm run build`
Expected: all green.

- [ ] **Step 5: Commit and tag**

```bash
git add CHANGELOG.md package.json src/mcp/server.ts
git commit -m "chore(release): v0.2.0"
git tag -a v0.2.0 -m "v0.2.0 — typed calendar-window error, periodic GTFS refresh, lines, cleanup"
```

> Do NOT push. Tag push is a separate decision.

---

# Spec coverage map

Each audit item from the 2026-05-01 audit is covered by exactly one task:

| Audit item | Task |
|------------|------|
| D1 README staleness on `feed_stale` | A1 |
| D2 hardcoded date in README | A1 |
| D3 missing CONTRIBUTING / SECURITY / .nvmrc | B4 + D1 |
| D4 CHANGELOG version stamp | A7 + D3 |
| C1 GtfsLoader.load/refresh duplication | A2 |
| C2 `parseDateMyt(x, new Date())` 6× | not addressed — judged out-of-scope. The non-determinism is at the I/O boundary; injecting a clock would be a wider refactor. Reconsider if a date-shift bug surfaces. |
| C3 app.notFound hand-rolled | A5 |
| C4 KomuterDeparture.platform dead | B3 |
| C5 route-classifier prefix fallbacks | C2 |
| C6 bin bootstrap duplication | A4 |
| C7 Station.lines unpopulated | C1 |
| C8 parseDateMyt not re-exported | A3 (export) + A6 (regression test) |
| A1 periodic GTFS refresh in bins | A4 |
| A2 concurrent-refresh guard | A2 |
| A3 KTMB live booking endpoint capture | **deferred** — manual capture work; write a follow-up plan after `scripts/inspect-ktmb.md` produces real traffic |
| A4 graceful SIGTERM in bins | A4 |
| A5 structured logger seam | D2 |
| T1 MCP server.ts 0% coverage | B1 |
| T2 api/errors.ts 33% coverage | B2 |
| T3 branch coverage < 80% on http.ts | B5 |
| T4 no exec test on built bins | D2 |
| T5 no nightly KTMB_SMOKE job | B4 |
| Dp1–Dp3 major bumps | C3 |
| Dp4–Dp5 minor/patch routine bumps | absorbed into Dependabot weekly cadence (D1) |
| I1 CI concurrency cancel | B4 |
| I2 Node matrix | B4 |
| I3 release workflow | not addressed — npm publish is a one-time manual step at v0.2.0 (D3); a workflow is overkill before that |
| I4 Dependabot/Renovate | D1 |
| I5 mixed package-manager hints | not addressed — pnpm is canonical (CI uses it, pnpm-lock.yaml is the source of truth); README's `npm i ktmb` references the consumer-side install path, which works with any package manager. No fix needed. |
| I6 nightly KTMB_SMOKE job | B4 |

---

# Execution checklist

After Phase A, expected state:
- README shows current behavior. CHANGELOG records Phase A.
- `ktmb-api` and `ktmb-mcp` refresh GTFS every 6 h and shutdown on SIGTERM. Concurrent `loader.refresh()` calls share a single fetch.
- Services read the live store via getter — refresh hot-swap is end-to-end.
- 404 responses go through `errorResponse`. `parseDateMyt` is publicly importable.

After Phase B, expected state:
- `mcp/server.ts` and `api/errors.ts` covered.
- `KomuterDeparture.platform` removed (BREAKING for v0.2.0 — consumers of `KomuterDepartureSchema.shape.platform` must drop the reference).
- CI cancels stale runs, tests Node 20 + 22, runs nightly live smoke. `.nvmrc` pins local Node 20.
- Branch coverage ≥ 80%.

After Phase C, expected state:
- Stations carry `lines: ("ETS"|"Intercity"|"Komuter"|"ShuttleTebrau")[]` populated from the route classifier.
- Synthetic fixture matches real-feed shapes; classifier is free of prefix-fallback branches.
- `csv-parse` v6, `@hono/node-server` v2, `typescript` v6 all green.

After Phase D, expected state:
- Dependabot opens routine bumps weekly.
- CONTRIBUTING and SECURITY exist.
- Logger seam in place — bootstrap and api/errors call through it.
- CI smoke-imports the built bins.
- v0.2.0 tagged on `main`.
