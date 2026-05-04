# ktmb

Read-only TypeScript library, REST API, and MCP server for KTMB rail data.

> **Live demo:** <https://ktmb-demo.zhunhao.deno.net/> — deployed to Deno Deploy². Both the live REST API at `/v1/*` and the static one-pager at `/` ship from the same origin. The realtime tile polls `/v1/realtime/vehicles` every 6 s for actually-live vehicle positions. See [Demo](#demo) for the deploy pipeline.

> **Unofficial.** Not affiliated with Keretapi Tanah Melayu Berhad.
> Schedules and station data come from Malaysia's Open Data Portal
> (`data.gov.my`) GTFS feeds. Fares and seat availability come from the
> public KTMB booking site (`online.ktmb.com.my`) — used politely, with
> conservative caching and an honest User-Agent. Do not deploy as a public
> proxy without adding your own rate limiting.

## KTMB booking client

### Live fares + seat availability

`getAvailability` queries `online.ktmb.com.my` directly. Two modes:

- **Anonymous (default)** — returns a single synthetic class per train with the listing's minimum fare and the listing's "Available seats" count. The count includes OKU/priority seats; `Fare.seatsLeftIncludesPriority` is `true` to make this explicit. Suitable for "is there anything available?" checks.
- **Authenticated (opt-in)** — set the `KTMB_COOKIE` environment variable to a Cookie header captured from a logged-in browser session at `https://online.ktmb.com.my/`. The client then drives `/Trip/LayoutV2` and returns one entry per coach class (e.g. Business, Standard) with OKU seats excluded.

To capture an auth cookie: log in to KITS in your browser, open DevTools → Application → Cookies, copy `name=value` pairs into a single `name=value; name=value` string. Store it in a secrets manager and inject as `KTMB_COOKIE` at runtime — the project does not ship or commit any session material.

To regenerate test fixtures: `pnpm tsx scripts/capture-ktmb-fixtures.ts` (anonymous flow only; the LayoutV2 fixture must be captured manually with an authenticated browser session — see the script's printed instructions).

### Forward-dated schedules

The bundled GTFS feed publishes 30–45 days ahead. When you request a date past the feed's calendar window, `list_schedules` returns `outside_calendar_window` by default.

Set `KTMB_FORWARD_FALLBACK=1` to fall through to the KITS booking site for those dates. The synthesised `TrainSchedule[]` carries train number, service category (ETS/Intercity), departure/arrival at the OD pair, and journey duration — but no intermediate stops, since the public listing doesn't include them. Combine with `KTMB_COOKIE` to also populate `classes` from `/Trip/LayoutV2`.

### GTFS feed cache

Set `KTMB_CACHE_DIR=/path/to/cache` to enable a file-backed cache for the GTFS static feed. Subsequent cold starts within `KTMB_CACHE_MAX_AGE_MS` (default `21600000` = 6h) skip the network fetch and parse from disk, taking the cold-start cost from ~2s down to ~150ms.

The cache key is derived from the feed URL only, so multiple binaries pointing at the same URL share the cache safely. Cache misses fall back to the network. `refresh()` always bypasses the cache.

### Transports

`ktmb-mcp` defaults to stdio. For shared/remote deployments, run with `--transport=http`:

`ktmb-mcp --transport=http --port=3030`

The server mounts a single `POST/GET /mcp` endpoint that speaks the MCP Streamable HTTP protocol. Bind address defaults to `127.0.0.1`; pass `--host=0.0.0.0` to expose externally — only behind a TLS-terminating reverse proxy with auth, since the server itself does no authn/z.

Environment variables: `PORT` and `HOST` provide defaults; CLI flags override.

## Known limitations

- **GTFS Realtime trip updates and service alerts** are not yet published by
  `data.gov.my`. Only vehicle positions are available.
- **GTFS calendar window is narrow.** `data.gov.my` typically publishes a
  ~3-month window. Requests past `GtfsStore.calendarWindow.endDate` return
  `err("outside_calendar_window", …)` (HTTP 422 via REST) by default. Set
  `KTMB_FORWARD_FALLBACK=1` to opt in to a KITS booking-site fallback for
  forward-dated queries — see [Forward-dated schedules](#forward-dated-schedules)
  above. To inspect the current window run
  `npx tsx scripts/inspect-schedules.ts YYYY-MM-DD`.

Schedules, station search, Komuter timetables, and live vehicle positions
work against `data.gov.my`'s GTFS feeds (within the published calendar window
exposed by `GtfsStore.calendarWindow`) and are production-ready.

For the full release notes and the roadmap, see [`CHANGELOG.md`](CHANGELOG.md).

## Install

```bash
npm i @zhun_hao/ktmb
# one-shot via npx
npx --package=@zhun_hao/ktmb ktmb-mcp
npx --package=@zhun_hao/ktmb ktmb-api
```

After a global install (`npm i -g @zhun_hao/ktmb`), the `ktmb-mcp` and `ktmb-api` binaries are on PATH directly.

To work from a clone instead:

```bash
pnpm install
pnpm build
node dist/bin/ktmb-mcp.js   # MCP stdio server
node dist/bin/ktmb-api.js   # REST server on PORT (default 8787)
```

## Library

```ts
import { GtfsLoader, createKtmb, ktmbGetAvailability, fetchVehiclePositions } from "@zhun_hao/ktmb";

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
    "ktmb": { "command": "npx", "args": ["--package=@zhun_hao/ktmb", "ktmb-mcp"] }
  }
}
```

## Notes on cross-border services

- **Shuttle Tebrau** (JB Sentral ↔ Woodlands CIQ): tickets sold via KTMB.
  Dual-currency (MYR / SGD) surfaced on each fare class.
- **Padang Besar**: KTMB ETS terminates at the Malaysia–Thailand border. Onward
  Thai SRT services are out of scope.

## Demo

A one-page demo lives under [`site/`](site/) and is deployed to **Deno
Deploy²** alongside a live REST API at `/v1/*`. The Deno entry
([`bin/ktmb-deno.ts`](bin/ktmb-deno.ts)) bootstraps the same Hono app as
`ktmb-api`, then mounts `serveStatic` for the demo on the same origin.
The demo loads pre-computed JSON snapshots from `/data/*.json` for
instant first paint, then polls `/v1/realtime/vehicles` every 6 s for
actually-live vehicle positions.

The deploy pipeline:

1. [`deno.json`](deno.json) declares the install/build/runtime steps for
   Deno Deploy. Build runs [`scripts/build-snapshot.ts`](scripts/build-snapshot.ts)
   to bake `site/data/*.json` into the deployed artifact.
2. Deno Deploy's GitHub source integration auto-builds and deploys on
   every push to `main` — no GitHub Actions workflow needed.

To preview locally:

```bash
pnpm install
pnpm snapshot                    # writes site/data/*.json
deno task deploy:dev             # serves on http://localhost:8000
```

`site/data/` is gitignored — the deploy build re-creates it.

## Roadmap

Tracked in [`CHANGELOG.md`](CHANGELOG.md#unreleased). Outstanding items:

- Surface GTFS-RT trip updates and service alerts once `data.gov.my` ships them.

## License

MIT. See [`LICENSE`](LICENSE) and [`CHANGELOG.md`](CHANGELOG.md) for release history.
