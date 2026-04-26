# KTMB API + MCP — Design

**Date:** 2026-04-26
**Status:** Approved for planning
**Owner:** zhunhao

## Summary

A read-only, unofficial TypeScript library that surfaces KTMB rail data through:

- **REST API** (Hono) — for developer integrations
- **MCP server** (stdio) — for AI assistants (Claude Desktop, Claude Code, etc.)

It pulls schedules and station data from Malaysia's official Open Data Portal
(GTFS Static + Realtime via `data.gov.my`), and falls back to KTMB's live
booking endpoints (`online.ktmb.com.my`) only for fares and seat availability,
which are not present in the open dataset.

Single npm package, self-hosted, MIT licensed.

## Goals

- Provide reliable read access to KTMB schedules, fares, and seat availability
  across ETS, KTM Intercity, Shuttle Tebrau, and KTM Komuter.
- Make AI assistants useful for planning Malaysian rail travel without manually
  browsing the KTMB site.
- Prefer official open data (`data.gov.my` GTFS) over scraping. Only hit KTMB's
  live booking endpoints for data that does not exist in the open feed.
- Stay polite to KTMB: honest User-Agent, conservative concurrency, sensible
  caching, no impersonation.

## Non-Goals (v1)

- Booking, seat selection, or payment.
- Authenticated user features (account history, etc.).
- Captcha solving or any anti-bot evasion.
- GTFS Realtime *trip updates* and *service alerts* — not yet published by
  `data.gov.my` (planned 2026). Vehicle positions are in scope.
- Thai SRT even where the ETS terminates at Padang Besar.
- Station-master, KTM Cargo, freight schedules.

## Decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Primary consumers | AI assistants **and** developers |
| 2 | Functional scope | Read-only: schedules, fares, availability |
| 3 | Data source | Hybrid — GTFS Static + Realtime from `api.data.gov.my/gtfs-*/ktmb` for schedules, station catalog, and live vehicle positions; KTMB live booking endpoints for fares + seat availability only |
| 4 | Deployment | Open-source library + self-hosted (no managed service) |
| 5 | Language / runtime | TypeScript on Node 20 LTS |
| 6 | Service coverage | ETS + KTM Intercity + KTM Komuter + Shuttle Tebrau |
| 7 | MCP transport | stdio only |
| 8 | Repo layout | Single npm package (no monorepo) |
| 9 | Station search | Fuzzy (Fuse.js) across English + Malay + codes |
| 10 | Date parsing | ISO `YYYY-MM-DD` plus relative (`chrono-node`), resolved in `Asia/Kuala_Lumpur` |
| 11 | Cache | In-memory: parsed GTFS Static feed (daily refresh), GTFS-RT (15s TTL), KTMB live (30s TTL). Single process, no Redis or disk. |
| 12 | License | MIT |
| 13 | Typechecker | TypeScript Native Preview (`tsgo`) — `@typescript/native-preview` |
| 14 | Build / declaration emit | `tsup` (esbuild) + `tsc` for `.d.ts` (tsgo cannot emit declarations yet) |
| 15 | Module resolution | `"bundler"` (tsgo requires modern resolution) |

## Architecture

```
┌──────────────────────────────────────────────┐
│           Consumer surfaces                  │
│   ┌──────────┐         ┌─────────────────┐   │
│   │ REST API │         │ MCP server      │   │
│   │ (Hono)   │         │ (stdio)         │   │
│   └─────┬────┘         └─────────┬───────┘   │
│         └────────┬────────────────┘          │
│                  ▼                           │
│   ┌──────────────────────────────────────┐   │
│   │          Core service layer          │   │
│   │  searchStations, listSchedules,      │   │
│   │  getFareAvailability, komuter…       │   │
│   └────┬───────────────────────────┬─────┘   │
│        ▼                           ▼         │
│  ┌────────────────────┐   ┌────────────────┐ │
│  │ GTFS adapter       │   │ KTMB adapter   │ │
│  │ - static (zip+csv) │   │ - booking site │ │
│  │ - realtime (proto) │   │   live JSON    │ │
│  └─────────┬──────────┘   └────────┬───────┘ │
│            ▼                       ▼         │
│  ┌────────────────────────────────────────┐  │
│  │  HTTP client · cache · rate limit      │  │
│  │  undici · LRU+TTL · p-queue · zod      │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
         ↓                          ↓
  api.data.gov.my            online.ktmb.com.my
   (GTFS feeds)               (booking site)
```

### Repository layout

```
ktmb/
├── package.json            # exports library + two bins
├── tsup.config.ts
├── src/
│   ├── core/
│   │   ├── client/         # http wrapper, cache, rate limit, retries
│   │   ├── gtfs/           # data.gov.my GTFS Static + Realtime adapter
│   │   │   ├── static.ts   # download + unzip + parse stops/routes/trips/stop_times
│   │   │   ├── realtime.ts # protobuf decode for vehicle positions
│   │   │   ├── index.ts    # in-memory store + refresh scheduler
│   │   │   └── types.ts
│   │   ├── ktmb/           # online.ktmb.com.my live booking endpoints
│   │   │   ├── ets.ts      # ETS / Intercity / Shuttle Tebrau fares + availability
│   │   │   └── types.ts
│   │   ├── stations/       # GTFS-derived catalog + fuzzy search overlay
│   │   ├── schedules/      # service layer composing GTFS + KTMB
│   │   ├── komuter/        # Komuter timetable from GTFS
│   │   ├── time/           # MYT date helpers, GTFS HH:MM:SS≥24 rollover, chrono
│   │   ├── types.ts        # zod schemas (public shapes)
│   │   └── index.ts        # public library export
│   ├── api/
│   │   ├── server.ts       # Hono app
│   │   ├── routes/
│   │   │   ├── stations.ts
│   │   │   ├── schedules.ts
│   │   │   ├── fares.ts
│   │   │   ├── komuter.ts
│   │   │   └── realtime.ts
│   │   └── errors.ts
│   └── mcp/
│       ├── server.ts       # MCP stdio server
│       └── tools/
│           ├── search-stations.ts
│           ├── list-schedules.ts
│           ├── get-fare-availability.ts
│           ├── list-komuter-lines.ts
│           ├── get-komuter-timetable.ts
│           └── get-vehicle-positions.ts
├── bin/
│   ├── ktmb-mcp.ts
│   └── ktmb-api.ts
├── scripts/
│   └── inspect-gtfs.ts     # diagnostic: dump agency/route/service summary from the live feed
└── tests/
    ├── unit/
    ├── integration/        # msw fixtures
    └── smoke/              # gated by KTMB_SMOKE=1
```

## Data sources

Two upstreams, accessed through separate adapters. The service layer composes them.

### `data.gov.my` — Malaysia Open Data Portal (primary)

| Resource | URL | Update cadence | Format |
|---|---|---|---|
| GTFS Static | `https://api.data.gov.my/gtfs-static/ktmb` | Daily at 00:01 MYT | ZIP of standard GTFS `.txt` files |
| GTFS Realtime — Vehicle Position | `https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb` | Every 30s | GTFS-RT Protocol Buffer |

The GTFS Static feed is the **primary source of truth** for: agency list, route
list (ETS, Intercity, Komuter Northern, Shuttle Tebrau), stops/stations, trip
definitions, and `stop_times` (per-stop arrival/departure for every trip).
GTFS-RT vehicle positions provide live train locations.

GTFS-RT **trip updates and service alerts are not yet published** by
`data.gov.my` (planned for 2026 per the portal docs). When they ship, we add
delays and alert surfacing without a redesign — the GTFS adapter shape already
covers them.

A startup spike (`scripts/inspect-gtfs.ts`) downloads the feed once and prints
agencies, route counts, and stop counts so we can confirm coverage of all four
KTMB services before wiring features.

### `online.ktmb.com.my` — KTMB live booking site (fallback)

Hit only for **fares + per-class seat availability**. These do not appear in
the GTFS feed. Single endpoint family wrapped in `core/ktmb/ets.ts`. Polite-use
constraints (User-Agent, concurrency cap, 30s minimum cache TTL) apply.

## Core operations

| Operation | Inputs | Returns | Source |
|---|---|---|---|
| `searchStations` | `query`, `lang?` (`"en" \| "ms"`) | matching `Station[]` ranked by Fuse score | GTFS `stops.txt` |
| `listSchedules` | `from`, `to`, `date` | all ETS / Intercity / Tebrau trains for that day | GTFS Static |
| `getFareAvailability` | `from`, `to`, `date`, `trainNo` | per-class fare + seats remaining | KTMB live |
| `listKomuterLines` | — | Klang Valley + Northern lines with stations | GTFS Static |
| `getKomuterTimetable` | `line`, `station`, `direction?` | upcoming Komuter departures | GTFS Static |
| `getVehiclePositions` | `routeId?` or `serviceArea?` | live train locations (lat/lon) | GTFS-RT |

`from` and `to` accept either a station code or a fuzzy-matchable name; ambiguous
input returns a `not_found` error with candidate suggestions in `cause`.

`date` accepts ISO `YYYY-MM-DD` or natural language (`"tomorrow"`, `"next
Friday"`); both resolve to a Malaysia-time calendar day.

### REST mapping

```
GET /v1/stations?q=KL
GET /v1/stations/:id
GET /v1/schedules?from=KUL&to=BTW&date=2026-05-01
GET /v1/schedules/:trainNo/availability?from=KUL&to=BTW&date=2026-05-01
GET /v1/komuter/lines
GET /v1/komuter/lines/:line/timetable?station=…&direction=…
GET /v1/realtime/vehicles?route=…
```

All responses use the standard envelope:

```json
{ "ok": true,  "data": ... }
{ "ok": false, "error": { "code": "...", "message": "...", "cause": ... } }
```

### MCP tools

The same operations exposed as MCP tools:
`search_stations`, `list_schedules`, `get_fare_availability`,
`list_komuter_lines`, `get_komuter_timetable`, `get_vehicle_positions`. Each
tool's schema is generated from the same Zod schema as the core function —
single source of truth.

## Data model

```ts
type Station = {
  code: string;             // KTMB internal code, verbatim
  nameEn: string;
  nameMs: string;
  country: "MY" | "SG" | "TH";
  lines?: ("ETS" | "Intercity" | "Komuter" | "ShuttleTebrau")[];
};

type Stop = {
  stationCode: string;
  arrival: string | null;   // ISO 8601 with +08:00 offset; null at origin
  departure: string | null; // ISO 8601 with +08:00 offset; null at terminus
};

type TrainClass = {
  className: string;        // e.g. "Premier", "First", "Second"
  fare: Fare;
};

type Fare = {
  className: string;
  priceMinor: number;       // minor units (cents)
  currency: "MYR" | "SGD";
  seatsLeft: number | null; // null when KTMB returns only "available"/"sold out"
};

type TrainSchedule = {
  trainNo: string;
  service: "ETS" | "Intercity" | "ShuttleTebrau";
  bookingProvider: string;  // "KTMB" today; future-proof for RTS Link operators
  from: Stop;
  to: Stop;
  intermediate?: Stop[];    // when KTMB returns full stop list
  classes: TrainClass[];
  journeyDurationMinutes: number;
};

type KomuterDeparture = {
  trainNo: string;
  line: string;
  departure: string;        // ISO 8601 +08:00
  platform?: string;
};

type VehiclePosition = {
  vehicleId: string;
  tripId?: string;
  routeId?: string;
  lat: number;
  lon: number;
  bearing?: number;
  speedKmh?: number;
  timestamp: string;        // ISO 8601 +08:00
};
```

All shapes are Zod-validated on the way **in** (defensive — KTMB's JSON is
messy) and on the way **out** (contract guarantee). Internal intermediate types
are not exposed.

## Cross-day parsing

GTFS represents cross-midnight services using `HH:MM:SS` values that are
allowed to exceed `24:00:00` (e.g. `27:30:00` is "3:30 AM the next service
day"). This is a standard part of the GTFS spec, designed exactly for
overnight services like the Ekspres Rakyat Timuran (JB Sentral → Tumpat).

`core/time/rollover.ts` normalizes GTFS times to ISO 8601:

1. Seed a `serviceDate` from the trip's `service_id` calendar in
   `Asia/Kuala_Lumpur`.
2. Parse each `stop_times` entry: hours ≥ 24 mean `(hours - 24)` on the
   following calendar day. Build a full ISO datetime with `+08:00`.
3. Apply this to both `arrival_time` and `departure_time`. The result is a
   monotonically non-decreasing sequence of ISO datetimes.

The same module also handles KTMB's live booking responses, which give
`HH:MM` without a date. There we walk stops and roll the date forward when a
time decreases — the legacy fallback for the booking site.

`journeyDurationMinutes` is computed after rollover and is always correct.

`date=YYYY-MM-DD` semantically means "trains **departing** that calendar day in
MYT" — the GTFS service-day boundary, which matches both the KTMB site's
search behavior and traveler intuition. A train departing 20:00 on May 1 and
arriving 07:30 on May 2 belongs to `date=2026-05-01`.

## Cross-border services

- **Shuttle Tebrau** (JB Sentral ↔ Woodlands CIQ): both directions sold by KTMB
  today. `bookingProvider: "KTMB"`. Modeled as its own `service:
  "ShuttleTebrau"` because dual-currency (MYR from JB, SGD from Woodlands)
  surfaces clearly. `bookingProvider` is intentionally a string, not a fixed
  union — RTS Link operators can be added without a breaking change.
- **Padang Besar**: KTMB ETS terminates here. Any Thai-side onward connection
  (Hat Yai etc.) is operated by SRT and out of scope. KTMB schedules to/from
  Padang Besar are `bookingProvider: "KTMB"`.
- **Timezones**: Singapore is also `+08:00` with no DST; the parser does not
  need per-station timezone awareness in v1.
- **Country**: exposed on `Station.country` so AI assistants can surface
  visa/customs context.

## Caching

Two layers, both in-memory single-process. No Redis, no disk. Restart the bin
to flush.

### GTFS feed cache (parsed, in-memory store)

The GTFS Static feed is downloaded, unzipped, and parsed once at startup,
then held in a normalized in-memory store (indexed maps for `stops`, `routes`,
`trips`, `stop_times` keyed for the access patterns we need). A scheduled
refresh re-downloads at **02:00 MYT daily** (the feed updates at 00:01).

GTFS-RT vehicle positions are fetched on demand with a **15-second TTL** —
faster than the feed's 30s update cadence is wasted, slower would underuse
fresh data.

| Resource | Cache | TTL / refresh |
|---|---|---|
| GTFS Static (parsed feed) | In-memory store | 24h, scheduled 02:00 MYT refresh |
| GTFS-RT vehicle positions | LRU+TTL | 15s |

### KTMB live cache (LRU + TTL)

| Resource | TTL | Reason |
|---|---|---|
| Fares + availability | 30s | Seats sell live; protects KTMB origin |

Cache key: SHA-1 of the normalized query parameters (canonical JSON, sorted
keys, trimmed/lowercased strings).

## Reliability

- HTTP via `undici` with 3 retries; exponential backoff at 250ms / 750ms / 2s.
- Retry only on 5xx responses and network errors. Never retry 4xx.
- Per-origin concurrency caps via `p-queue`: 4 for `data.gov.my`, 4 for
  `online.ktmb.com.my`.
- User-Agent: `ktmb/<version> (+<repo-url>)`. Never impersonate a browser.
- No circuit breaker in v1 — retries plus the concurrency cap are sufficient
  for a self-hosted single-user workload.
- **GTFS Static fetch failures are tolerated**: at startup, the bin starts
  even if the initial download fails — operations that need the feed return
  `upstream_error` until the next scheduled refresh succeeds. This avoids
  hard-failing the MCP/REST process if `data.gov.my` blips.
- **Stale-but-serve**: if a scheduled GTFS refresh fails, the previous
  parsed feed is kept and served until the next successful refresh, with a
  log warning. Fresh-by-default, stale-when-refresh-fails.

## Errors

```ts
type Result<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: ErrorCode; message: string; cause?: unknown } };

type ErrorCode =
  | "invalid_input"   // 400
  | "not_found"       // 404
  | "rate_limited"    // 429
  | "upstream_error"  // 502 — KTMB returned non-2xx after retries
  | "parse_error";    // 502 — KTMB returned 2xx but the body did not validate
```

- **REST**: maps to the HTTP statuses above with the envelope as the body.
- **MCP**: tools return the error object as `isError: true` content, so the
  model can recover gracefully.
- `parse_error` is the primary breakage mode and is logged with the raw KTMB
  payload (truncated) for diagnostics. We do not crash the server.

## Testing

| Layer | What | Tool | Notes |
|---|---|---|---|
| Unit | Pure parsers, time/date rollover, fuzzy match, fare/currency normalization | vitest | Hand-written fixtures including a Timuran goldenfile |
| Integration | Service functions against recorded KTMB responses | msw | One fixture per endpoint per service |
| Smoke | One real round-trip per CI run | vitest, gated by `KTMB_SMOKE=1` | KL Sentral → Ipoh, ~14 days out, structure-only assertions |

Coverage target: 80% per project rules.

The cross-day parser and the fare/availability normalizer are the two
highest-risk units; both get dense test coverage with explicit fixtures.

## Stack & versions

Verified against the npm registry on 2026-04-26.

### Runtime dependencies

| Package | Pin | Purpose |
|---|---|---|
| `hono` | `^4.12.15` | REST framework |
| `@modelcontextprotocol/sdk` | `^1.29.0` | MCP server (stdio transport) |
| `undici` | `^8.1.0` | HTTP client |
| `zod` | `^4.3.6` | Schema validation (note: Zod 4 syntax) |
| `fuse.js` | `^7.3.0` | Fuzzy station search |
| `chrono-node` | `^2.9.0` | Relative date parsing |
| `p-queue` | `^9.1.2` | Per-origin concurrency limiter |
| `lru-cache` | `^11.x` | TTL cache |
| `fflate` | `^0.8.x` | Unzip GTFS Static archive (pure JS, no native deps) |
| `csv-parse` | `^5.x` | Parse GTFS `.txt` files |
| `gtfs-realtime-bindings` | `^1.x` | Decode GTFS-RT protobuf |

### Dev dependencies

| Package | Pin | Purpose |
|---|---|---|
| `@typescript/native-preview` | `latest` (e.g. `7.0.0-dev.20260425.1`) | Fast type-checker (`tsgo`) |
| `typescript` | `^5.x` | Declaration emit (`tsc --emitDeclarationOnly`) until tsgo supports it |
| `tsup` | `^8.5.1` | ESM/CJS bundle |
| `vitest` | `^4.1.5` | Test runner |
| `msw` | `^2.13.6` | HTTP fixtures for integration tests |

### TypeScript build pipeline

- **Type-check** (fast, hot path): `tsgo --noEmit`. Used by `pnpm typecheck` and CI.
- **Bundle** (publish artifact): `tsup` produces ESM + CJS for `src/index.ts`,
  `bin/ktmb-mcp.ts`, `bin/ktmb-api.ts`.
- **Declarations**: `tsc --emitDeclarationOnly --declaration --outDir dist`
  produces `.d.ts` files. tsgo does not emit declarations yet (TypeScript 7
  preview limitation as of 2026-04). When tsgo gains `.d.ts` support, drop the
  `tsc` step.
- **`tsconfig.json`**: `"moduleResolution": "bundler"`, `"module": "esnext"`,
  `"target": "es2022"`. tsgo enforces modern resolution; legacy `"node"` /
  `"commonjs"` will not work.

## Distribution

- Single npm package `ktmb`.
- `bin: { "ktmb-mcp": "dist/bin/ktmb-mcp.js", "ktmb-api": "dist/bin/ktmb-api.js" }`.
- Library exports from `dist/index.js` — public surface re-exported from
  `src/core/index.ts`.
- Build pipeline above produces ESM + CJS + `.d.ts`.
- Node 20 LTS minimum.
- Versioning: semver against the **normalized** response shapes. KTMB shape
  changes are absorbed internally without bumping major.

### Station catalog

The station catalog is derived from GTFS `stops.txt` at runtime, indexed in
memory at startup, and refreshed when the GTFS Static feed refreshes (daily
at 02:00 MYT). Fuse.js builds its index over the in-memory catalog. There is
no separate generated data file and no build-time scrape — adding a station
to the live KTMB network shows up automatically the next service day.

## Legal & ethical posture

- The bulk of our data comes from Malaysia's official Open Data Portal
  (`data.gov.my`), which is intended for public consumption. KTMB live
  endpoints are touched only for fares + availability.
- README front-matter clearly states: read-only, unofficial, no affiliation
  with KTMB, polite-use guidance.
- Honest User-Agent. No browser impersonation. No captcha bypass.
- Per-origin concurrency cap and 30s minimum availability TTL bound load on
  KTMB.
- No login/booking/payment surface in v1 means no credential handling and no
  ToS exposure beyond hitting public endpoints politely.
- Users deploying as a public proxy are warned in the README to add their own
  rate limiting; the library does not provide it.
- License: MIT.

## Open follow-ups (post-v1)

These are explicitly out of scope for v1 but worth tracking:

- HTTP/SSE MCP transport for shared remote instances.
- RTS Link integration when it opens (~2027), once operator endpoints exist.
- Drop the `tsc` declaration-emit step once tsgo supports `.d.ts` output.
- Migrate to `@modelcontextprotocol/sdk` v2 once it ships stable.
- Surface GTFS-RT trip updates and service alerts when `data.gov.my`
  publishes them (planned 2026 per the portal docs).
- File-backed cache for the parsed GTFS Static feed to reduce cold-start time
  across bin restarts.
- Inspiration: 12306 reverse-engineering projects ([Joooook/12306-mcp](https://github.com/Joooook/12306-mcp),
  [freestylefly/12306-mcp](https://github.com/freestylefly/12306-mcp),
  [FlyingRadish/12306-api](https://github.com/FlyingRadish/12306-api),
  [missuo/12306-Schedule](https://github.com/missuo/12306-Schedule)),
  and Malaysian transit prior art
  ([hithereiamaliff/mcp-malaysiatransit](https://github.com/hithereiamaliff/mcp-malaysiatransit),
  [haikhalfakhreez/ktm-schedule](https://github.com/haikhalfakhreez/ktm-schedule)).
