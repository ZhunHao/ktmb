# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Tracked follow-ups for the next minor release. Each item links to a known gap
that did not block v0.1.0 but will improve completeness, correctness, or
ergonomics.

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

### Fixed

- **Route classification now matches the real `data.gov.my` GTFS feed.**
  Added an end-to-end smoke check against the live feed which surfaced that
  the original `classifyRoute` keyed off route_id prefixes (`ETS-*`, `KOM-*`)
  that don't appear in real KTMB data. The classifier now uses GTFS
  `route_type=0` as the primary Komuter signal (covering both Klang Valley
  and Komuter Utara), `route_id="ETS"` plus the `"Electric Train Service"`
  long-name substring for ETS, and `route_id="ST"` plus the literal
  `"Shuttle Tebrau"` long-name substring for ShuttleTebrau. The synthetic
  prefix-based fallbacks (`ETS-`, `KOM`, `STT`) are kept so existing fixtures
  keep working. Verified against the actual nine routes the live feed
  publishes: `KC05_KB18`, `KA15_KD19`, `100_47300`, `100_9000`, `SH`, `ERT`,
  `ES`, `ST`, `ETS`. Critical edge case: `SH` (Intercity Shuttle Tumpat –
  Gemas) is now correctly classified as `Intercity` rather than misread as
  Shuttle Tebrau.

### Planned

- **Periodic GTFS refresh in the bin processes.** `GtfsLoader.refresh()`
  already exists but is never scheduled. Wire it into `ktmb-api` and
  `ktmb-mcp` (cold-start refresh + every 6h) so a freshly published feed
  is picked up without a process restart. Pairs with the concurrent-refresh
  guard below.
- **KTMB fallback for forward-dated schedule queries beyond the GTFS
  window.** Once the real KTMB booking endpoint is captured (see next
  item), extend `SchedulesService.listSchedules` to route `(from, to,
  date)` queries to the KTMB live client when `date > calendarWindow.endDate`
  and `date <= today + 30`. The existing `from + to + date` API contract
  matches what the booking site requires, so no shape change is needed —
  GTFS remains primary for in-window dates, KTMB is the typed fallback.
- **Capture real KTMB live booking endpoint and replace synthetic schema.**
  Run the manual procedure in [`scripts/inspect-ktmb.md`](scripts/inspect-ktmb.md)
  to capture real network traffic from `online.ktmb.com.my`, then update
  `src/core/ktmb/types.ts` (Zod schema) and `src/core/ktmb/client.ts` (URL
  + request body) to match. Once landed, `ktmb.fares.get(...)`, the
  `/v1/schedules/:trainNo/availability` REST route, and the
  `get_fare_availability` MCP tool will return live fares + seat counts.
- **Surface GTFS Realtime trip updates and service alerts** when
  `data.gov.my` publishes them (planned 2026 per the portal docs). The
  GTFS adapter's shape already accommodates them.
- **Populate `Station.lines`.** The public `Station` type declares
  optional `lines: ("ETS"|"Intercity"|"Komuter"|"ShuttleTebrau")[]`, but
  `StationsService` does not derive it today. The data is available via
  the route classifier + `tripsForRoute` + `stopTimesForTrip`.
- **Re-export `parseDateMyt`** from the public surface. Library consumers
  writing custom transports cannot validate dates the same way the
  built-in REST/MCP layers do without it.
- **Fold `Hono.notFound` envelope through `errorResponse`.** The 404
  response in `src/api/server.ts` is hand-rolled; reusing the helper
  prevents drift if the envelope shape ever changes.
- **MCP server start/dispatch tests.** `src/mcp/server.ts` is at 0% line
  coverage today; tool handlers are covered via direct invocation, but
  the `buildMcpServer` registration and `runStdio` wiring are not.
- **Nightly CI smoke job** that exports `KTMB_SMOKE=1` and runs
  `tests/smoke/gtfs.test.ts` against the real `data.gov.my` feeds.
  Today the smoke tests are skipped on every CI run.
- **File-backed cache for the parsed GTFS Static feed** to reduce
  cold-start time across bin restarts. Currently the loader re-downloads
  on every process start.
- **Concurrent-refresh guard in `GtfsLoader`.** Two overlapping
  `refresh()` calls today both fetch and the later resolution wins. A
  one-line in-flight `Promise` cache would dedupe.
- **HTTP/SSE MCP transport** for shared remote instances. v0.1.0 is
  stdio-only.
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
  the real endpoint is captured. See [`scripts/inspect-ktmb.md`](scripts/inspect-ktmb.md)
  for the procedure.
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

[Unreleased]: https://github.com/zhunhao/ktmb/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/zhunhao/ktmb/releases/tag/v0.1.0
