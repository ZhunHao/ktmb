# Remaining Roadmap Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four independent improvements that close the v0.3 roadmap: forward-dated query fallback, file-backed GTFS cache, HTTP MCP transport, and the v0.3.0 npm release.

**Architecture:** Four self-contained sections (A–D). Each produces working, tested software on its own and can be run in any order. Sections A–C are TDD coding tasks; section D is a release runbook with verification gates.

**Tech Stack:** TypeScript ESM, Node 22.19+, pnpm. Vitest + MSW for tests. Hono (already a dep) hosts the HTTP transport. `@modelcontextprotocol/sdk` provides `StreamableHTTPServerTransport` for section C. Built-in `node:crypto` for the cache hash, `node:fs/promises` for disk I/O.

**Sections:**
- Section A: Forward-dated query fallback — Tasks A1–A5
- Section B: File-backed GTFS cache — Tasks B1–B4
- Section C: HTTP MCP transport — Tasks C1–C4
- Section D: v0.3.0 npm release — Tasks D1–D6

**Verified state at start:** `git log --oneline -1` shows the most recent plan-doc commit. KITS booking client ships authenticated and anonymous modes. `KitsClient` exposes `searchTrips({fromKitsId, toKitsId, date})` returning `Result<TripListingRow[]>` with `{ trainNo, service, departure, arrival, durationMinutes, seatsAvailable, minFareMinor, tripData }`.

---

## Section A: Forward-dated query fallback

When the GTFS calendar window doesn't cover the requested date, `SchedulesService.listSchedules()` returns `outside_calendar_window`. KITS publishes timetables further out than the GTFS feed (typically 60+ days vs 30–45 days). With the live KITS client now in place, we can synthesise minimal `TrainSchedule[]` from `KitsClient.searchTrips()` listing rows when GTFS misses.

**Trade-off:** the synthesised schedules carry departure/arrival at the OD pair only — no intermediate stops, since the public listing doesn't include them.

### File Structure (Section A)

```
src/core/schedules/
  service.ts                     MODIFY — accept optional fallback adapter
  kits-fallback-adapter.ts       CREATE — maps TripListingRow[] -> TrainSchedule[]

src/runtime/bootstrap.ts         MODIFY — wire the fallback when KTMB_FORWARD_FALLBACK=1

tests/unit/core/schedules/
  service.test.ts                MODIFY — fallback path
  kits-fallback-adapter.test.ts  CREATE
```

### Task A1: Add KITS fallback adapter

**Files:**
- Create: `src/core/schedules/kits-fallback-adapter.ts`
- Test: `tests/unit/core/schedules/kits-fallback-adapter.test.ts`

The adapter is a pure function — given a date and an array of `TripListingRow`, return a minimal `TrainSchedule[]` with `from`/`to` stops only, `classes: []`, and times computed from the listing's `HH:MM` strings.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/schedules/kits-fallback-adapter.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { kitsRowsToSchedules } from "../../../../src/core/schedules/kits-fallback-adapter.js";

const sampleRows = [
  {
    trainNo: "9124",
    service: "Platinum",
    departure: "08:05",
    arrival: "12:10",
    durationMinutes: 245,
    seatsAvailable: 230,
    minFareMinor: 11200,
    tripData: "",
  },
  {
    trainNo: "9352",
    service: "Gold",
    departure: "18:22",
    arrival: "22:42",
    durationMinutes: 260,
    seatsAvailable: 245,
    minFareMinor: 8800,
    tripData: "",
  },
];

describe("kitsRowsToSchedules", () => {
  it("returns one schedule per listing row with ETS service classification", () => {
    const out = kitsRowsToSchedules({
      rows: sampleRows,
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out).toHaveLength(2);
    expect(out[0]!.trainNo).toBe("9124");
    expect(out[0]!.service).toBe("ETS");
    expect(out[0]!.bookingProvider).toBe("KTMB");
    expect(out[0]!.from.stationCode).toBe("KUL");
    expect(out[0]!.from.departure).toBe("2026-08-15T08:05:00+08:00");
    expect(out[0]!.to.stationCode).toBe("BTW");
    expect(out[0]!.to.arrival).toBe("2026-08-15T12:10:00+08:00");
    expect(out[0]!.journeyDurationMinutes).toBe(245);
    expect(out[0]!.classes).toEqual([]);
  });

  it("classifies KITS service strings into the Service union", () => {
    const out = kitsRowsToSchedules({
      rows: [
        { ...sampleRows[0]!, service: "Platinum", trainNo: "9001" },
        { ...sampleRows[0]!, service: "Express", trainNo: "9002" },
        { ...sampleRows[0]!, service: "Gold", trainNo: "9003" },
        { ...sampleRows[0]!, service: "Intercity", trainNo: "9004" },
      ],
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out.map((s) => s.service)).toEqual(["ETS", "ETS", "ETS", "Intercity"]);
  });

  it("handles overnight arrival markers like '00:20 (+1)'", () => {
    const out = kitsRowsToSchedules({
      rows: [
        {
          ...sampleRows[0]!,
          trainNo: "9138",
          departure: "20:15",
          arrival: "00:20 (+1)",
          durationMinutes: 245,
        },
      ],
      date: "2026-08-15",
      fromCode: "KUL",
      toCode: "BTW",
    });
    expect(out[0]!.to.arrival).toBe("2026-08-16T00:20:00+08:00");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- kits-fallback-adapter.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `kitsRowsToSchedules`**

Create `src/core/schedules/kits-fallback-adapter.ts`:

```typescript
import type { TripListingRow } from "../ktmb/parse-trip-listing.js";
import type { TrainSchedule } from "../types.js";

export type KitsFallbackInput = {
  rows: readonly TripListingRow[];
  date: string;
  fromCode: string;
  toCode: string;
};

const OVERNIGHT_RE = /^(\d{2}:\d{2})\s*\(\+1\)$/;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const toMytIso = (date: string, hhmm: string): string => `${date}T${hhmm}:00+08:00`;

const classifyService = (kitsService: string): "ETS" | "Intercity" => {
  if (/intercity/i.test(kitsService)) return "Intercity";
  return "ETS";
};

export const kitsRowsToSchedules = (
  input: KitsFallbackInput,
): TrainSchedule[] => {
  const out: TrainSchedule[] = [];
  for (const row of input.rows) {
    const overnight = OVERNIGHT_RE.exec(row.arrival);
    const arrivalHHMM = overnight ? overnight[1]! : row.arrival;
    const arrivalDate = overnight ? addDays(input.date, 1) : input.date;
    out.push({
      trainNo: row.trainNo,
      service: classifyService(row.service),
      bookingProvider: "KTMB",
      from: {
        stationCode: input.fromCode,
        arrival: null,
        departure: toMytIso(input.date, row.departure),
      },
      to: {
        stationCode: input.toCode,
        arrival: toMytIso(arrivalDate, arrivalHHMM),
        departure: null,
      },
      classes: [],
      journeyDurationMinutes: row.durationMinutes,
    });
  }
  return out;
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- kits-fallback-adapter.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/schedules/kits-fallback-adapter.ts tests/unit/core/schedules/kits-fallback-adapter.test.ts
git commit -m "feat(schedules): add KITS fallback adapter for forward-dated queries"
```

### Task A2: Wire fallback into `SchedulesService`

**Files:**
- Modify: `src/core/schedules/service.ts`
- Modify: `tests/unit/core/schedules/service.test.ts` (or create if absent)

- [ ] **Step 1: Read existing tests**

Run: `cat tests/unit/core/schedules/service.test.ts` from `/Users/zhunhao/Documents/Projects/ktmb`. If it doesn't exist, write a fresh fixture-based test using the GTFS fixture builder at `tests/unit/core/gtfs/_make-fixture.ts`.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/core/schedules/service.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { ok } from "../../../../src/core/result.js";
import { SchedulesService } from "../../../../src/core/schedules/service.js";
import type { TripListingRow } from "../../../../src/core/ktmb/parse-trip-listing.js";
import type { GtfsStore } from "../../../../src/core/gtfs/store.js";

const fakeStore = (windowEnd: string): GtfsStore =>
  ({
    isOutsideCalendarWindow: (d: string) => d > windowEnd,
    calendarWindow: { startDate: "2026-01-01", endDate: windowEnd },
    tripsRunningOn: () => [],
    findRoute: () => undefined,
    stopTimesForTrip: () => [],
    listRoutes: () => [],
    listStops: () => [],
  }) as unknown as GtfsStore;

const sampleRows: TripListingRow[] = [
  {
    trainNo: "9124",
    service: "Platinum",
    departure: "08:05",
    arrival: "12:10",
    durationMinutes: 245,
    seatsAvailable: 230,
    minFareMinor: 11200,
    tripData: "",
  },
];

describe("SchedulesService forward-dated fallback", () => {
  it("falls through to KITS when date is past the GTFS calendar window", async () => {
    const fallback = vi.fn().mockResolvedValue(ok(sampleRows));
    const svc = new SchedulesService(() => fakeStore("2026-06-30"), {
      forwardFallback: fallback,
    });
    const r = await svc.listSchedulesAsync({
      from: "KUL",
      to: "BTW",
      date: "2026-08-15",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toHaveLength(1);
    expect(r.data[0]!.trainNo).toBe("9124");
    expect(fallback).toHaveBeenCalledWith({
      from: "KUL",
      to: "BTW",
      date: "2026-08-15",
    });
  });

  it("returns outside_calendar_window when no fallback is configured", async () => {
    const svc = new SchedulesService(() => fakeStore("2026-06-30"));
    const r = await svc.listSchedulesAsync({
      from: "KUL",
      to: "BTW",
      date: "2026-08-15",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("outside_calendar_window");
  });

  it("uses GTFS path when date is in window (does not call fallback)", async () => {
    const fallback = vi.fn();
    const svc = new SchedulesService(() => fakeStore("2026-12-31"), {
      forwardFallback: fallback,
    });
    const r = await svc.listSchedulesAsync({
      from: "KUL",
      to: "BTW",
      date: "2026-08-15",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toEqual([]);
    expect(fallback).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- schedules/service.test.ts`
Expected: FAIL — `listSchedulesAsync` doesn't exist; constructor doesn't accept second arg.

- [ ] **Step 4: Modify `SchedulesService`**

Replace `src/core/schedules/service.ts` with:

```typescript
import { gtfsTimeToIso } from "../time/gtfs-rollover.js";
import type { GtfsStore } from "../gtfs/store.js";
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
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

  listSchedules(input: ListSchedulesInput): Result<TrainSchedule[]> {
    const store = this.getStore();
    if (store.isOutsideCalendarWindow(input.date)) {
      const w = store.calendarWindow!;
      return err(
        "outside_calendar_window",
        `requested date ${input.date} is outside GTFS calendar window ${w.startDate}..${w.endDate}`,
      );
    }
    return ok(this.fromGtfs(input, store));
  }

  async listSchedulesAsync(
    input: ListSchedulesInput,
  ): Promise<Result<TrainSchedule[]>> {
    const store = this.getStore();
    if (!store.isOutsideCalendarWindow(input.date)) {
      return ok(this.fromGtfs(input, store));
    }
    if (!this.forwardFallback) {
      const w = store.calendarWindow!;
      return err(
        "outside_calendar_window",
        `requested date ${input.date} is outside GTFS calendar window ${w.startDate}..${w.endDate}`,
      );
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
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- schedules/service.test.ts`
Expected: PASS — three new tests green.

Run: `pnpm typecheck && pnpm test`
Expected: PASS overall — the synchronous `listSchedules` API is preserved.

- [ ] **Step 6: Commit**

```bash
git add src/core/schedules/service.ts tests/unit/core/schedules/service.test.ts
git commit -m "feat(schedules): forward-dated query fallback via KITS"
```

### Task A3: Wire into runtime bootstrap behind opt-in env flag

**Files:**
- Modify: `src/runtime/bootstrap.ts`
- Modify: `src/core/index.ts` (extend `CreateKtmbOptions`)
- Test: append to `tests/unit/runtime/bootstrap.test.ts`

- [ ] **Step 1: Extend `CreateKtmbOptions`**

Read `src/core/index.ts`. Add `forwardFallback?: ForwardFallback` to `CreateKtmbOptions`, thread it into the `new SchedulesService(getStore, { forwardFallback })` call. Re-export `ForwardFallback` from the public surface.

- [ ] **Step 2: Write the failing test**

Append to `tests/unit/runtime/bootstrap.test.ts`:

```typescript
describe("createKtmbRuntime forward-dated fallback", () => {
  it("activates KITS fallback when KTMB_FORWARD_FALLBACK=1 and date is past GTFS window", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    const { readFileSync } = await import("node:fs");
    const fix = (name: string) =>
      readFileSync(new URL(`../../fixtures/ktmb/${name}`, import.meta.url), "utf8");
    server.use(
      http.get("https://online.ktmb.com.my/", () =>
        HttpResponse.html(fix("home.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip", () =>
        HttpResponse.html(fix("trip-form.html")),
      ),
      http.post("https://online.ktmb.com.my/Trip/GetTripToken", () =>
        HttpResponse.text(fix("trip-token.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
      http.post("https://online.ktmb.com.my/Trip/Trip", () =>
        HttpResponse.text(fix("trip-listing.json"), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    process.env.KTMB_FORWARD_FALLBACK = "1";
    try {
      const rt = await createKtmbRuntime({
        feedStaticUrl: STATIC,
        feedRealtimeUrl: RT,
        refreshIntervalMs: 0,
      });
      try {
        const r = await rt.ktmb.schedules.listSchedulesAsync({
          from: "KUL",
          to: "BTW",
          date: "2099-12-31",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.length).toBeGreaterThan(0);
        expect(r.data[0]!.bookingProvider).toBe("KTMB");
      } finally {
        rt.shutdown();
      }
    } finally {
      delete process.env.KTMB_FORWARD_FALLBACK;
    }
  });

  it("returns outside_calendar_window when KTMB_FORWARD_FALLBACK is unset", async () => {
    server.use(
      http.get(STATIC, () =>
        new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        }),
      ),
      http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
    );
    delete process.env.KTMB_FORWARD_FALLBACK;
    const rt = await createKtmbRuntime({
      feedStaticUrl: STATIC,
      feedRealtimeUrl: RT,
      refreshIntervalMs: 0,
    });
    try {
      const r = await rt.ktmb.schedules.listSchedulesAsync({
        from: "KUL",
        to: "BTW",
        date: "2099-12-31",
      });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.error.code).toBe("outside_calendar_window");
    } finally {
      rt.shutdown();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- bootstrap.test.ts`
Expected: FAIL — `KTMB_FORWARD_FALLBACK` not yet wired.

- [ ] **Step 4: Wire the env var**

In `src/runtime/bootstrap.ts`, after the existing `cookieFromEnv` block, add:

```typescript
  const forwardFallbackEnabled =
    typeof process !== "undefined" && process.env.KTMB_FORWARD_FALLBACK === "1";
  const forwardFallback: ForwardFallback | undefined = forwardFallbackEnabled
    ? async (input) => {
        const client = cookieFromEnv
          ? new KitsClient({ cookie: cookieFromEnv })
          : new KitsClient();
        const catalog = await client.getStationCatalog();
        if (!catalog.ok) return catalog;
        const fromKits = resolveKitsStationId(catalog.data, {
          stopId: input.from,
          stopName: input.from,
        });
        const toKits = resolveKitsStationId(catalog.data, {
          stopId: input.to,
          stopName: input.to,
        });
        if (!fromKits || !toKits) {
          return err(
            "not_found",
            `no KITS station mapped for GTFS pair ${input.from}/${input.to}`,
          );
        }
        return client.searchTrips({
          fromKitsId: fromKits,
          toKitsId: toKits,
          date: input.date,
        });
      }
    : undefined;
```

Add the new imports at top of the file (`KitsClient`, `resolveKitsStationId`, `err`, `ForwardFallback`). Pass `forwardFallback` into `createKtmb({ ... forwardFallback })`.

- [ ] **Step 5: Run tests**

Run: `pnpm test -- bootstrap.test.ts`
Expected: PASS.

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/index.ts src/runtime/bootstrap.ts tests/unit/runtime/bootstrap.test.ts
git commit -m "feat(runtime): opt-in KITS forward-fallback via KTMB_FORWARD_FALLBACK env"
```

### Task A4: Update `list_schedules` MCP tool

**Files:**
- Modify: `src/mcp/tools/list-schedules.ts`

- [ ] **Step 1: Inspect current handler**

Run: `cat src/mcp/tools/list-schedules.ts`. The handler currently calls `ktmb.schedules.listSchedules(...)` (sync). Switch to `await ktmb.schedules.listSchedulesAsync(...)`.

- [ ] **Step 2: Run tests**

Run: `pnpm test -- list-schedules.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/mcp/tools/list-schedules.ts
git commit -m "feat(mcp): list_schedules tool uses async fallback path"
```

### Task A5: Document forward-fallback

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add README subsection**

```markdown
### Forward-dated schedules

The bundled GTFS feed publishes 30–45 days ahead. When you request a date past the feed's calendar window, `list_schedules` returns `outside_calendar_window` by default.

Set `KTMB_FORWARD_FALLBACK=1` to fall through to the KITS booking site for those dates. The synthesised `TrainSchedule[]` carries train number, service category (ETS/Intercity), departure/arrival at the OD pair, and journey duration — but no intermediate stops, since the public listing doesn't include them. Combine with `KTMB_COOKIE` to also populate `classes` from `/Trip/LayoutV2`.
```

- [ ] **Step 2: CHANGELOG bullet under `[Unreleased] / Added`**

```markdown
- `SchedulesService.listSchedulesAsync()` and the `list_schedules` MCP tool fall through to KITS when `KTMB_FORWARD_FALLBACK=1` is set and the requested date is past the GTFS calendar window.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: forward-dated fallback configuration"
```

---

## Section B: File-backed GTFS cache

`GtfsLoader` re-downloads the static GTFS ZIP on every cold start (typically 5–15 MB). A content-hash-keyed file cache turns subsequent boots into a disk read.

**Strategy:** save raw ZIP bytes to disk on successful load. On the next `load()` call, if a cached blob is newer than `cacheMaxAgeMs`, parse from disk and skip the network. `refresh()` always bypasses the cache. The cache key is derived from a hash of the feed URL.

### File Structure (Section B)

```
src/core/gtfs/
  loader.ts          MODIFY — accept cache options
  feed-cache.ts      CREATE — disk cache I/O

tests/unit/core/gtfs/
  feed-cache.test.ts CREATE
  loader.test.ts     MODIFY — exercise cache hit/miss paths
```

### Task B1: `feedCache` module

**Files:**
- Create: `src/core/gtfs/feed-cache.ts`
- Test: `tests/unit/core/gtfs/feed-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/core/gtfs/feed-cache.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadCachedFeed,
  saveCachedFeed,
} from "../../../../src/core/gtfs/feed-cache.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ktmb-cache-"));
  return () => rmSync(dir, { recursive: true, force: true });
});

describe("feed-cache", () => {
  it("returns null when the cache is empty", async () => {
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 60_000,
    });
    expect(r).toBeNull();
  });

  it("round-trips bytes through save -> load", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await saveCachedFeed({ dir, url: "https://example.invalid/feed", bytes });
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 60_000,
    });
    expect(r).not.toBeNull();
    expect(r!.bytes).toEqual(bytes);
  });

  it("returns null when the cached entry is older than maxAgeMs", async () => {
    const bytes = new Uint8Array([1]);
    await saveCachedFeed({ dir, url: "https://example.invalid/feed", bytes });
    const r = await loadCachedFeed({
      dir,
      url: "https://example.invalid/feed",
      maxAgeMs: 0,
    });
    expect(r).toBeNull();
  });

  it("isolates entries by URL", async () => {
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    await saveCachedFeed({ dir, url: "https://a.invalid", bytes: a });
    await saveCachedFeed({ dir, url: "https://b.invalid", bytes: b });
    const ra = await loadCachedFeed({ dir, url: "https://a.invalid", maxAgeMs: 60_000 });
    const rb = await loadCachedFeed({ dir, url: "https://b.invalid", maxAgeMs: 60_000 });
    expect(ra!.bytes).toEqual(a);
    expect(rb!.bytes).toEqual(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- feed-cache.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `feed-cache.ts`**

Create `src/core/gtfs/feed-cache.ts`:

```typescript
import { createHash } from "node:crypto";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type LoadInput = { dir: string; url: string; maxAgeMs: number };
export type SaveInput = { dir: string; url: string; bytes: Uint8Array };
export type LoadOutput = { bytes: Uint8Array; ageMs: number };

const fileNameForUrl = (url: string): string => {
  const h = createHash("sha256").update(url).digest("hex").slice(0, 16);
  return `gtfs-${h}.zip`;
};

export const loadCachedFeed = async (
  input: LoadInput,
): Promise<LoadOutput | null> => {
  const path = join(input.dir, fileNameForUrl(input.url));
  let stats;
  try {
    stats = await stat(path);
  } catch {
    return null;
  }
  const ageMs = Date.now() - stats.mtimeMs;
  if (ageMs > input.maxAgeMs) return null;
  const buf = await readFile(path);
  return { bytes: new Uint8Array(buf), ageMs };
};

export const saveCachedFeed = async (input: SaveInput): Promise<void> => {
  await mkdir(input.dir, { recursive: true });
  const path = join(input.dir, fileNameForUrl(input.url));
  await writeFile(path, input.bytes);
};
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- feed-cache.test.ts`
Expected: PASS — four tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/gtfs/feed-cache.ts tests/unit/core/gtfs/feed-cache.test.ts
git commit -m "feat(gtfs): add file-backed feed cache"
```

### Task B2: Wire cache into `GtfsLoader`

**Files:**
- Modify: `src/core/gtfs/loader.ts`
- Modify: `tests/unit/core/gtfs/loader.test.ts` (or create if absent)

- [ ] **Step 1: Read existing loader test**

Run: `cat tests/unit/core/gtfs/loader.test.ts`. If absent, create following the patterns in `tests/unit/core/gtfs/`.

- [ ] **Step 2: Write the failing test**

Append to (or create) `tests/unit/core/gtfs/loader.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { GtfsLoader } from "../../../../src/core/gtfs/loader.js";
import { buildMiniFeed } from "./_make-fixture.js";

const FEED = "https://test.invalid/cached-feed";
const server = setupServer();
beforeEach(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  server.close();
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ktmb-loader-"));
  return () => rmSync(dir, { recursive: true, force: true });
});

describe("GtfsLoader cache", () => {
  it("uses the disk cache when a fresh entry exists", async () => {
    let networkCalls = 0;
    server.use(
      http.get(FEED, () => {
        networkCalls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const a = new GtfsLoader(FEED, { cacheDir: dir, cacheMaxAgeMs: 60_000 });
    const ra = await a.load();
    expect(ra.ok).toBe(true);
    expect(networkCalls).toBe(1);
    const b = new GtfsLoader(FEED, { cacheDir: dir, cacheMaxAgeMs: 60_000 });
    const rb = await b.load();
    expect(rb.ok).toBe(true);
    expect(networkCalls).toBe(1);
  });

  it("bypasses the cache on refresh()", async () => {
    let networkCalls = 0;
    server.use(
      http.get(FEED, () => {
        networkCalls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const loader = new GtfsLoader(FEED, { cacheDir: dir, cacheMaxAgeMs: 60_000 });
    await loader.load();
    await loader.refresh();
    expect(networkCalls).toBe(2);
  });

  it("falls back to network when cacheDir is unset", async () => {
    let networkCalls = 0;
    server.use(
      http.get(FEED, () => {
        networkCalls++;
        return new HttpResponse(buildMiniFeed(), {
          status: 200,
          headers: { "content-type": "application/zip" },
        });
      }),
    );
    const loader = new GtfsLoader(FEED);
    await loader.load();
    expect(networkCalls).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- gtfs/loader.test.ts`
Expected: FAIL — `GtfsLoader` constructor doesn't accept a second arg.

- [ ] **Step 4: Modify `GtfsLoader`**

Replace `src/core/gtfs/loader.ts`:

```typescript
import type { Result } from "../result.js";
import { err, ok } from "../result.js";
import { fetchWithRetry } from "../client/http.js";
import type { FetchOptions } from "../client/http.js";
import { parseStaticFeed } from "./static-parser.js";
import { GtfsStore } from "./store.js";
import { loadCachedFeed, saveCachedFeed } from "./feed-cache.js";

export type GtfsLoaderOptions = {
  cacheDir?: string;
  cacheMaxAgeMs?: number;
};

const DEFAULT_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export class GtfsLoader {
  private store: GtfsStore | undefined;
  private inflight: Promise<Result<GtfsStore>> | undefined;
  private readonly cacheDir: string | undefined;
  private readonly cacheMaxAgeMs: number;

  constructor(
    private readonly feedUrl: string,
    opts: GtfsLoaderOptions = {},
  ) {
    this.cacheDir = opts.cacheDir;
    this.cacheMaxAgeMs = opts.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
  }

  currentStore(): GtfsStore | undefined {
    return this.store;
  }

  async load(
    opts: Pick<FetchOptions, "retryDelaysMs"> = {},
  ): Promise<Result<GtfsStore>> {
    if (this.inflight) return this.inflight;
    const p = (async () => {
      const r = await this.loadWithCache(opts);
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

  refresh(
    opts: Pick<FetchOptions, "retryDelaysMs"> = {},
  ): Promise<Result<GtfsStore>> {
    return this.fetchAndCache(opts).then((r) => {
      if (r.ok) this.store = r.data;
      return r;
    });
  }

  private async loadWithCache(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    if (this.cacheDir) {
      const cached = await loadCachedFeed({
        dir: this.cacheDir,
        url: this.feedUrl,
        maxAgeMs: this.cacheMaxAgeMs,
      });
      if (cached) return this.parseBytes(cached.bytes);
    }
    return this.fetchAndCache(opts);
  }

  private async fetchAndCache(
    opts: Pick<FetchOptions, "retryDelaysMs">,
  ): Promise<Result<GtfsStore>> {
    const res = await fetchWithRetry(this.feedUrl, opts);
    if (!res.ok) return res;
    const bytes = new Uint8Array(await res.data.arrayBuffer());
    if (this.cacheDir) {
      try {
        await saveCachedFeed({ dir: this.cacheDir, url: this.feedUrl, bytes });
      } catch {
        // Best-effort; a failed cache write should not break the load.
      }
    }
    return this.parseBytes(bytes);
  }

  private parseBytes(bytes: Uint8Array): Result<GtfsStore> {
    try {
      const feed = parseStaticFeed(bytes);
      return ok(new GtfsStore(feed));
    } catch (e) {
      return err("parse_error", "GTFS feed parse failed", e);
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- gtfs/loader.test.ts`
Expected: PASS — three new tests green.

Run: `pnpm typecheck && pnpm test`
Expected: PASS — existing bootstrap tests still pass; new arg is optional.

- [ ] **Step 6: Commit**

```bash
git add src/core/gtfs/loader.ts tests/unit/core/gtfs/loader.test.ts
git commit -m "feat(gtfs): GtfsLoader uses file-backed feed cache when configured"
```

### Task B3: Wire `KTMB_CACHE_DIR` env var into bootstrap

**Files:**
- Modify: `src/runtime/bootstrap.ts`
- Test: append to `tests/unit/runtime/bootstrap.test.ts`

- [ ] **Step 1: Modify bootstrap**

In `src/runtime/bootstrap.ts`, change the `new GtfsLoader(opts.feedStaticUrl)` line to:

```typescript
  const cacheDir =
    typeof process !== "undefined" ? process.env.KTMB_CACHE_DIR : undefined;
  const cacheMaxAgeMs = (() => {
    const raw = typeof process !== "undefined" ? process.env.KTMB_CACHE_MAX_AGE_MS : undefined;
    return raw ? Number(raw) : undefined;
  })();
  const loader = new GtfsLoader(opts.feedStaticUrl, {
    ...(cacheDir ? { cacheDir } : {}),
    ...(cacheMaxAgeMs && Number.isFinite(cacheMaxAgeMs) ? { cacheMaxAgeMs } : {}),
  });
```

- [ ] **Step 2: Smoke test**

Append to `tests/unit/runtime/bootstrap.test.ts`:

```typescript
describe("createKtmbRuntime KTMB_CACHE_DIR plumbing", () => {
  it("forwards KTMB_CACHE_DIR to GtfsLoader so a second runtime hits the cache", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "ktmb-rt-"));
    try {
      let calls = 0;
      server.use(
        http.get(STATIC, () => {
          calls++;
          return new HttpResponse(buildMiniFeed(), {
            status: 200,
            headers: { "content-type": "application/zip" },
          });
        }),
        http.get(RT, () => new HttpResponse(new Uint8Array(), { status: 200 })),
      );
      process.env.KTMB_CACHE_DIR = dir;
      try {
        const a = await createKtmbRuntime({
          feedStaticUrl: STATIC,
          feedRealtimeUrl: RT,
          refreshIntervalMs: 0,
        });
        a.shutdown();
        const b = await createKtmbRuntime({
          feedStaticUrl: STATIC,
          feedRealtimeUrl: RT,
          refreshIntervalMs: 0,
        });
        b.shutdown();
        expect(calls).toBe(1);
      } finally {
        delete process.env.KTMB_CACHE_DIR;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/runtime/bootstrap.ts tests/unit/runtime/bootstrap.test.ts
git commit -m "feat(runtime): plumb KTMB_CACHE_DIR + KTMB_CACHE_MAX_AGE_MS env vars"
```

### Task B4: Document the cache

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README — add subsection**

```markdown
### GTFS feed cache

Set `KTMB_CACHE_DIR=/path/to/cache` to enable a file-backed cache for the GTFS static feed. Subsequent cold starts within `KTMB_CACHE_MAX_AGE_MS` (default `21600000` = 6h) skip the network fetch and parse from disk, taking the cold-start cost from ~2s down to ~150ms.

The cache key is derived from the feed URL only, so multiple binaries pointing at the same URL share the cache safely. Cache misses fall back to the network. `refresh()` always bypasses the cache.
```

- [ ] **Step 2: CHANGELOG bullet under `[Unreleased] / Added`**

```markdown
- Optional file-backed GTFS feed cache. Set `KTMB_CACHE_DIR` to enable; `KTMB_CACHE_MAX_AGE_MS` (default 6h) controls staleness.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: GTFS feed cache configuration"
```

---

## Section C: HTTP MCP transport

The MCP SDK 1.x ships `StreamableHTTPServerTransport`. Adopting it lets multiple clients share one running ktmb-mcp instance. Hono is already a project dep — use it to host the transport.

### File Structure (Section C)

```
src/mcp/
  server.ts                      MODIFY — re-export both transport entrypoints
  transports/
    stdio.ts                     CREATE — extracted stdio runner
    http.ts                      CREATE — Hono app wiring StreamableHTTPServerTransport

bin/
  ktmb-mcp.ts                    MODIFY — accept --transport=http --port=N --host=H

tests/integration/mcp/
  http-transport.test.ts         CREATE
```

### Task C1: Reorganise transport entrypoints

**Files:**
- Modify: `src/mcp/server.ts`
- Create: `src/mcp/transports/stdio.ts`

- [ ] **Step 1: Extract `runStdio`**

Create `src/mcp/transports/stdio.ts`:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const runStdio = async (server: McpServer): Promise<void> => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
};
```

- [ ] **Step 2: Update `server.ts`**

Replace the bottom of `src/mcp/server.ts` (the `runStdio` definition) with:

```typescript
export { runStdio } from "./transports/stdio.js";
export { runHttp, type RunHttpOptions } from "./transports/http.js";
```

(Leave `buildMcpServer` unchanged.)

- [ ] **Step 3: Run tests**

Run: `pnpm typecheck && pnpm test`
Expected: PASS — pure refactor.

> **Note:** typecheck will fail until Task C2 creates `./transports/http.js`. If you commit this task in isolation, also create an empty stub for `./transports/http.ts` exporting `runHttp` and `RunHttpOptions` as `undefined as unknown as ...` so the typecheck passes — or commit C1 and C2 together. Recommended: commit them together at the end of C2.

### Task C2: Implement `runHttp`

**Files:**
- Create: `src/mcp/transports/http.ts`
- Test: `tests/integration/mcp/http-transport.test.ts`

The MCP SDK exposes `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js`. It expects a single endpoint that handles both POST (client -> server messages) and GET (server -> client SSE stream).

- [ ] **Step 1: Write the failing test**

Create `tests/integration/mcp/http-transport.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runHttp } from "../../../src/mcp/transports/http.js";
import { buildMcpServer } from "../../../src/mcp/server.js";
import type { Ktmb } from "../../../src/core/index.js";

const stubKtmb = (): Ktmb =>
  ({
    stations: { search: () => [], list: () => [], getByCode: () => undefined },
    schedules: {
      listSchedules: () => ({ ok: true, data: [] }),
      listSchedulesAsync: async () => ({ ok: true, data: [] }),
    },
    fares: { get: async () => ({ ok: true, data: [] }) },
    komuter: { listLines: () => ({ ok: true, data: [] }), getTimetable: () => ({ ok: true, data: [] }) },
    realtime: { fetch: async () => ({ ok: true, data: [] }) },
  }) as unknown as Ktmb;

let stop: (() => Promise<void>) | undefined;
beforeEach(() => {
  stop = undefined;
});
afterEach(async () => {
  if (stop) await stop();
});

describe("runHttp", () => {
  it("starts an HTTP server and serves the MCP initialize handshake", async () => {
    const server = buildMcpServer(stubKtmb());
    const handle = await runHttp(server, { port: 0 });
    stop = handle.stop;
    const url = `http://127.0.0.1:${handle.port}/mcp`;
    const sessionId = crypto.randomUUID();
    const init = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
    });
    expect(init.ok).toBe(true);
    const text = await init.text();
    expect(text).toContain("\"jsonrpc\":\"2.0\"");
    expect(text).toContain("\"result\"");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- http-transport.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `runHttp`**

Create `src/mcp/transports/http.ts`:

```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

export type RunHttpOptions = {
  port: number;
  host?: string;
};

export type HttpHandle = {
  port: number;
  stop: () => Promise<void>;
};

export const runHttp = async (
  server: McpServer,
  opts: RunHttpOptions,
): Promise<HttpHandle> => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });
  await server.connect(transport);

  const app = new Hono();
  app.all("/mcp", async (c) => {
    return transport.handleRequest(c.req.raw, c.res, await c.req.raw.text());
  });

  return new Promise<HttpHandle>((resolve, reject) => {
    const httpServer = serve(
      {
        fetch: app.fetch,
        port: opts.port,
        hostname: opts.host ?? "127.0.0.1",
      },
      (info) => {
        resolve({
          port: info.port,
          stop: () =>
            new Promise<void>((r) => {
              httpServer.close(() => r());
            }),
        });
      },
    );
    httpServer.on("error", reject);
  });
};
```

> **Implementer note:** the `StreamableHTTPServerTransport.handleRequest` signature has shifted across SDK minor versions. Verify against the version in `package.json` (`@modelcontextprotocol/sdk@^1.29.0`). If the signature differs (e.g. takes Node `IncomingMessage`/`ServerResponse` instead of WHATWG `Request`/`Response`), use Hono's `getNodeReqRes()` helper or fall back to `serve()`'s underlying Node server. If the test fails at runtime with a signature error, fix the bridge — do not weaken the test.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- http-transport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (combined with C1)**

```bash
git add src/mcp tests/integration/mcp/http-transport.test.ts
git commit -m "feat(mcp): add HTTP/SSE transport via StreamableHTTPServerTransport"
```

### Task C3: CLI flag in `bin/ktmb-mcp.ts`

**Files:**
- Modify: `bin/ktmb-mcp.ts`

- [ ] **Step 1: Add CLI parsing**

Replace `bin/ktmb-mcp.ts` with:

```typescript
import { buildMcpServer, runStdio, runHttp } from "../src/mcp/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

type CliArgs = {
  transport: "stdio" | "http";
  port: number;
  host: string;
};

const parseArgs = (argv: readonly string[]): CliArgs => {
  let transport: "stdio" | "http" = "stdio";
  let port = Number(process.env.PORT ?? 3030);
  let host = process.env.HOST ?? "127.0.0.1";
  for (const arg of argv) {
    if (arg === "--transport=http") transport = "http";
    else if (arg === "--transport=stdio") transport = "stdio";
    else if (arg.startsWith("--port=")) port = Number(arg.slice("--port=".length));
    else if (arg.startsWith("--host=")) host = arg.slice("--host=".length);
  }
  return { transport, port, host };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const server = buildMcpServer(rt.ktmb);

  let httpHandle: { stop: () => Promise<void> } | undefined;
  const stop = (signal: string): void => {
    console.error(`[ktmb-mcp] ${signal} received, shutting down`);
    rt.shutdown();
    if (httpHandle) {
      void httpHandle.stop();
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  if (args.transport === "http") {
    httpHandle = await runHttp(server, { port: args.port, host: args.host });
    console.error(`[ktmb-mcp] HTTP transport listening on http://${args.host}:${args.port}/mcp`);
  } else {
    await runStdio(server);
  }
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
```

- [ ] **Step 2: Manual smoke test**

Run from `/Users/zhunhao/Documents/Projects/ktmb`:

```bash
pnpm tsx bin/ktmb-mcp.ts --transport=http --port=3030 &
sleep 8
curl -s -X POST http://127.0.0.1:3030/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: $(uuidgen)" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  | head -1
kill %1
```

Expected: a JSON-RPC initialize response containing `"result"`. If the server is slow to start because the GTFS feed needs downloading, set `KTMB_CACHE_DIR=$(pwd)/.gtfs-cache` from Section B to make subsequent runs fast.

- [ ] **Step 3: Commit**

```bash
git add bin/ktmb-mcp.ts
git commit -m "feat(bin): ktmb-mcp accepts --transport=http --port --host"
```

### Task C4: Document HTTP transport

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README subsection**

```markdown
### Transports

`ktmb-mcp` defaults to stdio. For shared/remote deployments, run with `--transport=http`:

`ktmb-mcp --transport=http --port=3030`

The server mounts a single `POST/GET /mcp` endpoint that speaks the MCP Streamable HTTP protocol. Bind address defaults to `127.0.0.1`; pass `--host=0.0.0.0` to expose externally — only behind a TLS-terminating reverse proxy with auth, since the server itself does no authn/z.

Environment variables: `PORT` and `HOST` provide defaults; CLI flags override.
```

- [ ] **Step 2: CHANGELOG bullet under `[Unreleased] / Added`**

```markdown
- HTTP/SSE MCP transport. Run `ktmb-mcp --transport=http --port=N` to serve the MCP protocol over HTTP for shared remote instances.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: HTTP MCP transport"
```

---

## Section D: v0.3.0 npm release

This is a release runbook. The Fare schema gained `seatsLeftIncludesPriority` (additive) and the runtime grew env-var-driven optional behaviours; semver-wise this is a minor bump.

### Task D1: Verify pre-release state

- [ ] **Step 1: Confirm clean tree**

Run: `git status --porcelain`
Expected: empty.

- [ ] **Step 2: Confirm intended sections committed**

Run: `git log --oneline -25`. You should see the work you intend to ship. If you skipped Sections A/B/C, that's fine — release whatever is on `main`.

- [ ] **Step 3: Full test suite + build**

Run from `/Users/zhunhao/Documents/Projects/ktmb`:
```bash
pnpm typecheck && pnpm test && pnpm build
```
Expected: all green; `dist/` populated.

If any step fails, STOP. Fix on a separate commit before continuing.

### Task D2: Bump version

**Files:**
- Modify: `package.json`
- Modify: `src/mcp/server.ts`

- [ ] **Step 1: Version bump**

Run: `pnpm version 0.3.0 --no-git-tag-version`
Verify: `grep '"version"' package.json` shows `"version": "0.3.0"`.

- [ ] **Step 2: Update MCP server version literal**

Run: `grep -n '"0.2.0"' src/mcp/server.ts`. Edit that line so the `new McpServer({ name: "ktmb", version: "0.2.0" })` call uses `"0.3.0"`.

- [ ] **Step 3: Re-run tests + build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green.

### Task D3: Finalise CHANGELOG

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Move `[Unreleased]` to dated 0.3.0 section**

In `CHANGELOG.md`, rename `## [Unreleased]` to `## [0.3.0] - 2026-05-02` (use today's date). Add a new empty `## [Unreleased]` section above it.

- [ ] **Step 2: Commit version + changelog together**

```bash
git add package.json src/mcp/server.ts CHANGELOG.md
git commit -m "chore(release): 0.3.0"
```

### Task D4: Verify package contents

- [ ] **Step 1: Dry-run pack**

Run: `pnpm pack --dry-run`
Expected output: a list of files under `dist/`, plus `README.md`, `LICENSE`, `package.json`. Verify:
- `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` present
- `dist/bin/ktmb-mcp.js`, `dist/bin/ktmb-api.js` present
- No `src/`, no `tests/`, no fixtures, no `.git`, no `node_modules`, no `.env*`, no `.claude/`

If extraneous files appear, update `package.json`'s `"files"` array — do NOT widen it.

- [ ] **Step 2: Inspect tarball**

Run: `pnpm pack` (without `--dry-run`)
Run: `tar tf ktmb-0.3.0.tgz | head -30`

Verify contents match the dry-run. Delete the local tarball: `rm ktmb-0.3.0.tgz`.

### Task D5: Publish

> **You must do this step yourself.** npm OTP requires a hardware token / authenticator. The agent cannot complete an OTP-gated publish.

- [ ] **Step 1: npm login (if not already)**

```bash
npm whoami
```
Expected: your npm username. If not logged in: `npm login`.

- [ ] **Step 2: Publish**

```bash
pnpm publish --access public
```

Enter OTP from your authenticator app when prompted.

- [ ] **Step 3: Verify**

```bash
npm view ktmb@0.3.0
```
Expected: shows the new version's metadata. `npm install ktmb@0.3.0` in a scratch directory should succeed.

### Task D6: Tag the release

- [ ] **Step 1: Create the tag**

```bash
git tag -a v0.3.0 -m "Release 0.3.0

- Real KTMB booking-site client with optional auth mode
- Fare schema gained seatsLeftIncludesPriority field"
```

(Add bullets for any sections you actually shipped.)

- [ ] **Step 2: Push the tag**

```bash
git push origin main
git push origin v0.3.0
```

- [ ] **Step 3: Optional GitHub release**

```bash
gh release create v0.3.0 --notes-from-tag
```

---

## Self-review checklist

- [ ] **Spec coverage:** all four roadmap items have at least one task each. #3 -> Section A (5 tasks). #4 -> Section B (4 tasks). #5 -> Section C (4 tasks). #6 -> Section D (6 tasks).
- [ ] **Independence:** each section can run in isolation. Section A only depends on the existing KitsClient (already shipped). Section B is pure GtfsLoader work. Section C uses Hono and the MCP SDK. Section D wraps whatever is on main.
- [ ] **No placeholders:** no "TBD" / "implement appropriately" / "fill in later". Task C2 has one annotated note about SDK signature drift, with explicit fallback guidance.
- [ ] **Type consistency:** `ForwardFallback`, `KitsFallbackInput`, `GtfsLoaderOptions`, `RunHttpOptions`, `HttpHandle` introduced once and referenced consistently. `kitsRowsToSchedules`, `loadCachedFeed`, `saveCachedFeed`, `runHttp` all have stable signatures across tasks.
- [ ] **Tests check the right things:** A1 pins overnight handling. B1 covers URL isolation and TTL expiry. C2 exercises the actual MCP initialize handshake.

---

**Plan complete. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration. Sections A and B are pure TDD coding work and parallelise well across separate sessions. Section C has one risky bridge call (the SDK signature note) that benefits from human review. Section D has interactive OTP and must run in your terminal.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints. Good if you want to ship A+B+C+D as one continuous push.

**Which approach?**
