# ktmb

Read-only TypeScript library, REST API, and MCP server for KTMB rail data.

> **Live demo:** [zhunhao.github.io/ktmb](https://zhunhao.github.io/ktmb/) — interactive one-pager backed by real `data.gov.my` GTFS data, snapshotted daily at 03:00 MYT. See [Demo](#demo) for how the snapshot pipeline works.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Schedules and station data come from Malaysia's Open Data Portal
> (`data.gov.my`) GTFS feeds. Fares and seat availability come from the
> public KTMB booking site (`online.ktmb.com.my`) — used politely, with
> conservative caching and an honest User-Agent. Do not deploy as a public
> proxy without adding your own rate limiting.

## Known limitations (v0.2)

- **Fare and seat availability are not yet wired to real KTMB endpoints.** The
  KTMB live booking client (`src/core/ktmb/client.ts`) uses a placeholder URL
  and a synthetic JSON schema. Calls via `ktmb.fares.get(...)`,
  `GET /v1/schedules/:trainNo/availability`, or the `get_fare_availability`
  MCP tool will return an `upstream_error` until the real endpoint is captured
  (see [`scripts/inspect-ktmb.md`](scripts/inspect-ktmb.md) for the manual procedure).
- **GTFS Realtime trip updates and service alerts** are not yet published by
  `data.gov.my`. Only vehicle positions are available.
- **GTFS calendar window is narrow.** `data.gov.my` typically publishes a
  ~3-month window. Requests past `GtfsStore.calendarWindow.endDate` return
  `err("outside_calendar_window", …)` (HTTP 422 via REST). The library does
  not yet fall back to the KTMB booking site for forward-dated queries — see
  the Roadmap. To inspect the current window run
  `npx tsx scripts/inspect-schedules.ts YYYY-MM-DD`.

Schedules, station search, Komuter timetables, and live vehicle positions
work against `data.gov.my`'s GTFS feeds (within the published calendar window
exposed by `GtfsStore.calendarWindow`) and are production-ready.

For the full release notes and the roadmap, see [`CHANGELOG.md`](CHANGELOG.md).

## Install

> **Not yet published to npm.** v0.1.0 is source-only — install from the repo
> until the first registry release. Tracked in [`CHANGELOG.md`](CHANGELOG.md#unreleased).

```bash
# from a clone of this repo
npm install
npm run build

# run the bins directly
node dist/bin/ktmb-mcp.js   # MCP stdio server
node dist/bin/ktmb-api.js   # REST server on PORT (default 8787)

# or expose `ktmb-mcp` / `ktmb-api` on your PATH
npm link
```

To consume the library from another local project, run `npm link` here, then
`npm link ktmb` in the consumer.

Once published, the install path will be:

```bash
npm i ktmb
npx ktmb-mcp
npx ktmb-api
```

## Library

```ts
import { GtfsLoader, createKtmb, ktmbGetAvailability, fetchVehiclePositions } from "ktmb";

const loader = new GtfsLoader("https://api.data.gov.my/gtfs-static/ktmb");
const r = await loader.load();
if (!r.ok) throw new Error(r.error.message);

const ktmb = createKtmb({
  store: r.data,
  fareGetter: ktmbGetAvailability,
  realtimeFetcher: () =>
    fetchVehiclePositions("https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb"),
});

const stations = ktmb.stations.search("KL");
const trains = ktmb.schedules.listSchedules({ from: "KUL", to: "BTW", date: "2026-05-01" });
```

## REST endpoints

```
GET /v1/stations?q=KL
GET /v1/stations/:id
GET /v1/schedules?from=…&to=…&date=…
GET /v1/schedules/:trainNo/availability?from=…&to=…&date=…
GET /v1/komuter/lines
GET /v1/komuter/lines/:line/timetable?station=…&date=…
GET /v1/realtime/vehicles?route=…
```

All responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

## MCP tools

`search_stations`, `list_schedules`, `get_fare_availability`,
`list_komuter_lines`, `get_komuter_timetable`, `get_vehicle_positions`.

Configure in Claude Desktop / Claude Code:

```json
{
  "mcpServers": {
    "ktmb": { "command": "npx", "args": ["ktmb-mcp"] }
  }
}
```

## Notes on cross-border services

- **Shuttle Tebrau** (JB Sentral ↔ Woodlands CIQ): tickets sold via KTMB.
  Dual-currency (MYR / SGD) surfaced on each fare class.
- **Padang Besar**: KTMB ETS terminates at the Malaysia–Thailand border. Onward
  Thai SRT services are out of scope.

## Demo

A static one-page demo lives under [`site/`](site/) and is deployed to
GitHub Pages at <https://zhunhao.github.io/ktmb/>. It loads pre-computed
JSON snapshots from `site/data/` rather than calling the API at runtime,
so it works fully offline once loaded — and ships from a static origin
with no backend.

The snapshot pipeline:

1. [`scripts/build-snapshot.ts`](scripts/build-snapshot.ts) loads the
   live GTFS-Static + GTFS-Realtime feeds via the library and writes
   `site/data/{stations,komuter-lines,schedules,komuter,realtime,meta}.json`.
2. [`.github/workflows/pages.yml`](.github/workflows/pages.yml) runs that
   script on every push to `site/**`, on a daily 03:00 MYT cron, or on
   manual dispatch — then publishes `site/` as a Pages artifact.

To regenerate locally:

```bash
pnpm snapshot                   # writes site/data/*.json
npx serve site                  # or any static server
```

`site/data/` is gitignored — CI is the source of truth.

## Roadmap

Tracked in [`CHANGELOG.md`](CHANGELOG.md#unreleased). Outstanding items:

- Capture the real KTMB live booking endpoint and replace the synthetic schema.
- Surface GTFS-RT trip updates and service alerts once `data.gov.my` ships them.
- KTMB-side fallback for forward-dated `outside_calendar_window` responses.
- File-backed cache for the parsed GTFS Static feed.
- HTTP/SSE MCP transport for shared remote instances.

## License

MIT. See [`LICENSE`](LICENSE) and [`CHANGELOG.md`](CHANGELOG.md) for release history.
