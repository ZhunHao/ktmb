# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-05-02

### Added

- `SchedulesService.listSchedulesAsync()` and the `list_schedules` MCP tool fall through to KITS when `KTMB_FORWARD_FALLBACK=1` is set and the requested date is past the GTFS calendar window.
- Optional file-backed GTFS feed cache. Set `KTMB_CACHE_DIR` to enable; `KTMB_CACHE_MAX_AGE_MS` (default 6h) controls staleness.
- HTTP/SSE MCP transport. Run `ktmb-mcp --transport=http --port=N` to serve the MCP protocol over HTTP for shared remote instances.
- **Real KTMB booking-site client.** `getAvailability` now drives the
  four-step KITS flow (`/` → `/Trip` → `/Trip/GetTripToken` →
  `/Trip/Trip`) and returns live fares + listing-level seat counts for
  every train.
- **Optional authenticated mode.** Supplying `KTMB_COOKIE` (a logged-in
  KITS session cookie) makes the client fall through to
  `/Trip/LayoutV2`, returning per-class fares and OKU-excluded seat
  counts. Without the cookie, `Fare.seatsLeftIncludesPriority` is
  `true` to flag that the count includes OKU/priority seats.
- **Deno Deploy² target** with a live REST API and static demo on one
  origin. New entry `bin/ktmb-deno.ts` bootstraps the same Hono app as
  `ktmb-api`, mounts `serveStatic` for `site/`, and is configured by
  `deno.json` (install: `pnpm install --frozen-lockfile`, build:
  `pnpm snapshot`, runtime: `bin/ktmb-deno.ts`). Deno Deploy's GitHub
  source integration auto-builds on push.
- **Live realtime polling on the demo.** After first paint from the
  bundled snapshot, the realtime tile polls `/v1/realtime/vehicles`
  every 6 s and replaces the dots with actually-live positions
  (degrades gracefully on plain static hosting where the endpoint
  404s).
- **`api/server` is now a separate tsup entry**, producing
  `dist/api/server.js` for direct import — used by `bin/ktmb-deno.ts`.
- **`pnpm snapshot` script** — `tsx scripts/build-snapshot.ts`, runs
  the library against `data.gov.my` GTFS feeds and writes
  `site/data/*.json`. Used by the Deno Deploy build step.
- **`scripts/build-snapshot.ts` retries `fetchVehiclePositions`** up to
  3× when the feed returns empty, avoiding a stale "0 vehicles"
  snapshot.

### Removed

- **Synthetic placeholder fixtures**
  (`tests/fixtures/ktmb/{search,availability}-sample.json`) and the
  manual reverse-engineering worksheet (`scripts/inspect-ktmb.md`) —
  superseded by `scripts/capture-ktmb-fixtures.ts`.
- **`undici` dependency.** The library used it only for `Headers` and
  type aliases; both are available as globals on modern Node and on
  Deno. Dropping it makes the library Deno-compatible without
  polyfills.
- **GitHub Pages workflow** (`.github/workflows/pages.yml`). Replaced
  by Deno Deploy.

### Changed

- **`Fare` schema gains an optional `seatsLeftIncludesPriority: boolean`
  field.** Surfaced by `getAvailability` to flag whether OKU/priority
  seats are included in the count (true in anonymous mode, omitted in
  authenticated mode).
- **Node engine bumped to `>=22.19`** to match prior `undici@8.1.0`
  requirement (was `>=20`); kept post-removal because tooling is
  Node-22-only anyway. CI matrix dropped Node 20.
- **Live smoke workflow runs on Node 22** (was 20).
- **`tsup` target raised to `node22`** to match the engine.

### Planned

- _(empty — file new entries here as further work lands)_

## [0.2.0] - 2026-05-01

Tech-debt remediation release. Aligns the public surface and bin processes
with the v0.1.0 caveats list in [README.md](README.md), drops one dead
schema field, and lifts test coverage above the project's 80 % branch
target. No data-layer changes — GTFS shapes, REST/MCP tool contracts, and
booking-side surfaces are unchanged.

### Added

- **Typed `outside_calendar_window` error when a requested date falls
  outside the GTFS feed's calendar window.** `GtfsStore` now exposes
  `calendarWindow: { startDate, endDate } | null` (YYYY-MM-DD, computed as
  the min `startDate` and max `endDate` across all `calendar.txt` entries),
  plus an `isOutsideCalendarWindow(date)` helper.
  `SchedulesService.listSchedules` and `KomuterService.getTimetable` now
  return `err("outside_calendar_window", …)` with the actual window in the
  message instead of `ok([])`, so callers can distinguish "no trains on
  that date" from "feed window has lapsed". The REST envelope maps the new
  code to **HTTP 422 Unprocessable Entity**, and the MCP `list_schedules`
  tool surfaces the same typed error through its existing JSON envelope.
- **Periodic GTFS refresh in the bin processes.** Both `ktmb-api` and
  `ktmb-mcp` now perform a cold-start `GtfsLoader.load()` and then refresh
  every `KTMB_REFRESH_MS` (default 6 h) through a shared
  `src/runtime/bootstrap.ts` runtime. A successful refresh hot-swaps the
  store on the live `Ktmb` facade — services read the live store via a
  getter, so in-flight requests see the new feed without restart. The
  refresh uses a `setTimeout`-reschedule pattern with stop-on-shutdown
  guards, preventing tick pile-up if a refresh stalls. Concurrent
  `loader.refresh()` calls share a single fetch via an in-flight promise
  guard. SIGTERM and SIGINT now drain the HTTP server / stdio transport
  before exit (5 s hard deadline on `ktmb-api`).
- **`parseDateMyt` re-exported** from the public surface so library
  consumers can validate dates the same way the built-in REST/MCP layers do.
- **`Station.lines` populated** by `StationsService` from `classifyRoute`
  applied over each route's trips and stop_times. Each station now carries
  the deterministic-sorted set of services it sees (`ETS`, `Intercity`,
  `Komuter`, `ShuttleTebrau`). The field stays optional on the public
  `Station` Zod schema; stations not visited by any classified route omit
  the key entirely.
- **MCP `buildMcpServer` registration tests.** `src/mcp/server.ts`
  coverage rose from 0 % to 83 % via two new integration tests asserting
  all six tools are registered with non-empty descriptions.
- **Logger seam.** `src/runtime/logger.ts` exposes `createLogger` with a
  swappable transport. `bootstrap.ts` (refresh logging) and `api/errors.ts`
  (unhandled-error logging) route through it. Default transport stays
  `console` for backwards compatibility; deployments can pipe to
  pino/winston without forking.
- **CI improvements.** `concurrency: cancel-in-progress` on the main
  workflow; Node 22 added to the matrix alongside Node 20; nightly
  `KTMB_SMOKE=1` workflow runs `tests/smoke/gtfs.test.ts` against the
  live `data.gov.my` feeds; the main workflow now smoke-imports the
  built `dist/bin/ktmb-{api,mcp}.js` to catch broken exports.
- **Repository hygiene.** Added `CONTRIBUTING.md`, `SECURITY.md`,
  `.nvmrc`, and a Dependabot configuration grouping patch / minor
  npm bumps weekly.

### Changed

- **Service layer reads `GtfsStore` via a getter.** `StationsService`,
  `SchedulesService`, and `KomuterService` constructors now take
  `() => GtfsStore` instead of a `GtfsStore` snapshot. The public
  `createKtmb({ store, … })` signature is unchanged; library consumers
  constructing services directly must pass a closure.
- **`app.notFound` returns the standard envelope** through `errorResponse`
  instead of hand-rolled JSON — prevents drift if the envelope shape ever
  changes.

### Removed

- **`KomuterDeparture.platform` field removed (BREAKING).** The field was
  declared `optional` in v0.1.0 but was never populated by the parser or
  by any service. It has been removed from `KomuterDepartureSchema` and
  the `KomuterDeparture` TypeScript type. Any consumer reading
  `departure.platform` will see `undefined` at runtime after upgrade and
  a type error if on strict TypeScript.
- **Synthetic prefix-based fallbacks (`ETS-`, `KOM`, `STT`, `INT-`)
  dropped from `classifyRoute`.** Test fixtures now use real `data.gov.my`
  GTFS shapes (`route_id="ETS"`, `route_id="ST"`, `route_type=0` for
  Komuter, etc.); the classifier no longer carries fallbacks for the
  v0.1.0 synthetic-fixture-only IDs.
- **Stale `feed_stale` planned-error language in the README.** The shipped
  surface is `outside_calendar_window` mapped to HTTP 422.

### Fixed

- **Route classification now matches the real `data.gov.my` GTFS feed.**
  Added an end-to-end smoke check against the live feed which surfaced that
  the original `classifyRoute` keyed off route_id prefixes (`ETS-*`, `KOM-*`)
  that don't appear in real KTMB data. The classifier now uses GTFS
  `route_type=0` as the primary Komuter signal (covering both Klang Valley
  and Komuter Utara), `route_id="ETS"` plus the `"Electric Train Service"`
  long-name substring for ETS, and `route_id="ST"` plus the literal
  `"Shuttle Tebrau"` long-name substring for ShuttleTebrau. The synthetic
  prefix-based fallbacks have been removed; all test fixtures now use
  real-feed route shapes. Verified against the actual nine routes the live feed
  publishes: `KC05_KB18`, `KA15_KD19`, `100_47300`, `100_9000`, `SH`, `ERT`,
  `ES`, `ST`, `ETS`. Critical edge case: `SH` (Intercity Shuttle Tumpat –
  Gemas) is now correctly classified as `Intercity` rather than misread as
  Shuttle Tebrau.

### Planned

- **Capture real KTMB live booking endpoint and replace synthetic schema.**
  Resolved in Unreleased — the real KITS flow is now implemented in
  `src/core/ktmb/client.ts` and `getAvailability` returns live fares +
  seat counts via `ktmb.fares.get(...)`, the
  `/v1/schedules/:trainNo/availability` REST route, and the
  `get_fare_availability` MCP tool.
- **Surface GTFS Realtime trip updates and service alerts** when
  `data.gov.my` publishes them (planned 2026 per the portal docs). The
  GTFS adapter's shape already accommodates them.
- **RTS Link integration** when it opens (~2027) — `bookingProvider`
  is intentionally a string, not a fixed union, so adding a second
  operator will not be a breaking change.
- **Drop the `tsc` declaration-emit step** once `tsgo` supports `.d.ts`
  output. Today the build runs `tsup && tsc -p tsconfig.build.json`.

### Out of scope (no plan to implement)

- Booking, seat selection, or payment.
- Authenticated user features (account history).
- Captcha solving / anti-bot evasion.
- Thai SRT data, even where ETS terminates at Padang Besar.
- Singapore SMRT data, even where Shuttle Tebrau terminates at Woodlands CIQ.
- Station-master, KTM Cargo, freight schedules.

---

## [0.1.0] - 2026-04-26

Initial release.

### Added

- **Public TypeScript library** (`ktmb`) exposing `GtfsLoader`,
  `createKtmb`, `ktmbGetAvailability`, `fetchVehiclePositions`,
  `parseStaticFeed`, `GtfsStore`, plus the public Zod schemas
  (`Station`, `Stop`, `Fare`, `TrainSchedule`, `KomuterDeparture`,
  `VehiclePosition`) and the `Result<T>` envelope.
- **REST API** (`ktmb-api` bin, Hono):
  - `GET /v1/stations` — fuzzy station search (Fuse.js).
  - `GET /v1/stations/:id` — station detail.
  - `GET /v1/schedules` — ETS / Intercity / Shuttle Tebrau trains for a date.
  - `GET /v1/schedules/:trainNo/availability` — fares + seat counts.
  - `GET /v1/komuter/lines` — KTM Komuter line list.
  - `GET /v1/komuter/lines/:line/timetable` — Komuter departures for a station/date.
  - `GET /v1/realtime/vehicles` — live vehicle positions.
  - Standard response envelope: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.
- **MCP server** (`ktmb-mcp` bin, stdio): six tools mirroring the REST
  surface — `search_stations`, `list_schedules`, `get_fare_availability`,
  `list_komuter_lines`, `get_komuter_timetable`, `get_vehicle_positions`.
- **Hybrid data sourcing.** Schedules, station catalog, and live vehicle
  positions come from Malaysia's Open Data Portal GTFS feeds
  (`https://api.data.gov.my/gtfs-static/ktmb`,
  `https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb`). Fares
  and seat availability come from the KTMB booking site (placeholder
  URL — see Known caveats).
- **Cross-day journeys** (e.g. Ekspres Rakyat Timuran JB Sentral → Tumpat)
  handled correctly via GTFS `HH:MM:SS ≥ 24:00:00` rollover and a
  legacy KTMB `HH:MM` walking-rollover for the booking site.
- **Cross-border services**: Shuttle Tebrau (KTMB-only ticketing,
  dual-currency MYR/SGD); Padang Besar (KTMB ETS terminus only —
  Thai SRT explicitly out of scope).
- **Honest User-Agent** (`ktmb/<version> (+<repo>)`), per-origin
  concurrency cap (4 in-flight via `p-queue`), retries with exponential
  backoff (250ms / 750ms / 2s) on 5xx + network errors only — never on
  4xx, never with browser impersonation, never with captcha bypass.
- **Caching.** GTFS Static parsed in-memory by `GtfsLoader` with
  stale-but-serve on refresh failure. GTFS-RT vehicle positions cached
  with a 15s TTL. KTMB live availability cached with a 30s TTL.
- **Strict-mode TypeScript** with `tsgo` (TypeScript Native Preview)
  for typechecking and stock `tsc --emitDeclarationOnly` for `.d.ts`
  emission via a dedicated `tsconfig.build.json`. Module resolution is
  `bundler`. Node 20 LTS minimum.
- **Tests.** 94 passing across unit and integration layers with
  msw-based HTTP fixtures and a synthetic mini GTFS feed. Coverage:
  92.4% lines, 89.3% statements, 90.8% functions, 76.6% branches —
  all gated by `vitest` with `@vitest/coverage-v8`.
- **CI.** GitHub Actions on push and PR: install, typecheck, test
  (with coverage), build.
- **MIT license.**

### Known caveats

- **Fare and seat availability are stubbed.** `src/core/ktmb/client.ts`
  posts to a placeholder URL (`https://online.ktmb.com.my/api/availability`)
  and `src/core/ktmb/types.ts` defines a synthetic JSON schema, because
  the manual browser DevTools capture from the real KTMB booking site
  (Task 11 of the plan) was not performed in this release. Calls via
  `ktmb.fares.get(...)`, `GET /v1/schedules/:trainNo/availability`, and
  the `get_fare_availability` MCP tool will return `upstream_error` until
  the real endpoint is captured. (Resolved in Unreleased — see the
  Unreleased section above for the live KITS client.)
- **GTFS Realtime trip updates and service alerts are not available.**
  `data.gov.my` has not yet published these feeds (planned 2026 per
  portal docs). Only vehicle positions are surfaced today.
- **`Station.lines` is always undefined.** The field is declared in the
  public schema but `StationsService` does not derive it. Tracked in
  Unreleased.
- **`tsgo` is a preview compiler.** It receives daily builds and may
  occasionally regress; it is pinned to a specific dev version
  (`^7.0.0-dev.20260426.1`) to keep builds reproducible.
- **Synthetic test fixture.** The Komuter trip in
  `tests/unit/core/gtfs/_make-fixture.ts` (`K2412`) goes KUL → PKG to
  match Klang Valley geography; real data lives in the GTFS feed and
  may differ.

### Production-ready surface

The following operations work end-to-end against `data.gov.my` and
are safe to depend on in v0.1.0:

- Station search, lookup, and country tagging (incl. Woodlands CIQ → SG).
- Schedule listing for ETS, Intercity, and Shuttle Tebrau (cross-day journeys
  represented correctly with `+08:00` ISO timestamps and
  `journeyDurationMinutes`).
- Komuter line listing and per-station timetables.
- Live vehicle positions (lat/lon, optional bearing/speed, ISO timestamp).

[Unreleased]: https://github.com/zhunhao/ktmb/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/zhunhao/ktmb/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/zhunhao/ktmb/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zhunhao/ktmb/releases/tag/v0.1.0
