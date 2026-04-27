# ktmb

Read-only TypeScript library, REST API, and MCP server for KTMB rail data.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Schedules and station data come from Malaysia's Open Data Portal
> (`data.gov.my`) GTFS feeds. Fares and seat availability come from the
> public KTMB booking site (`online.ktmb.com.my`) — used politely, with
> conservative caching and an honest User-Agent. Do not deploy as a public
> proxy without adding your own rate limiting.

## Known limitations (v0.1.0)

- **Fare and seat availability are not yet wired to real KTMB endpoints.** The
  KTMB live booking client (`src/core/ktmb/client.ts`) uses a placeholder URL
  and a synthetic JSON schema. Calls via `ktmb.fares.get(...)`,
  `GET /v1/schedules/:trainNo/availability`, or the `get_fare_availability`
  MCP tool will return an `upstream_error` until the real endpoint is captured
  (see [`scripts/inspect-ktmb.md`](scripts/inspect-ktmb.md) for the manual procedure).
- **GTFS Realtime trip updates and service alerts** are not yet published by
  `data.gov.my` (planned 2026). Only vehicle positions are available.
- **`Station.lines`** is declared in the public schema but always returns
  `undefined` in v0.1.0. Tracked in [`CHANGELOG.md`](CHANGELOG.md#unreleased).

Schedules, station search, Komuter timetables, and live vehicle positions
work against `data.gov.my`'s GTFS feeds and are production-ready.

For the full release notes and the v0.2 roadmap, see [`CHANGELOG.md`](CHANGELOG.md).

## Install

```bash
npm i ktmb
# or run directly
npx ktmb-mcp     # MCP stdio server
npx ktmb-api     # REST server on PORT (default 8787)
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

## Roadmap

Tracked in [`CHANGELOG.md`](CHANGELOG.md#unreleased). Headline items for v0.2:

- Capture the real KTMB live booking endpoint and replace the synthetic schema.
- Surface GTFS-RT trip updates and service alerts once `data.gov.my` ships them.
- Populate `Station.lines` from the route classifier.
- Re-export `parseDateMyt` from the public surface.
- File-backed cache for the parsed GTFS Static feed.
- HTTP/SSE MCP transport for shared remote instances.

## License

MIT. See [`LICENSE`](LICENSE) and [`CHANGELOG.md`](CHANGELOG.md) for release history.
