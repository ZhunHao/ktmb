# ktmb

Read-only TypeScript library, REST API, and MCP server for KTMB rail data.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Schedules and station data come from Malaysia's Open Data Portal
> (`data.gov.my`) GTFS feeds. Fares and seat availability come from the
> public KTMB booking site (`online.ktmb.com.my`) — used politely, with
> conservative caching and an honest User-Agent. Do not deploy as a public
> proxy without adding your own rate limiting.

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

## License

MIT.
