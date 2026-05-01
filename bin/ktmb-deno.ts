/**
 * Deno Deploy² entry. Bootstraps the same Hono app as `ktmb-api` and serves
 * the static demo from `site/` on the same origin. The library's GTFS feed
 * is loaded once on cold-start, held in memory, and refreshed every 6 h.
 *
 * Local dev: `deno task deploy:dev`
 * Deployed by `.github/workflows/deno-deploy.yml` (and Deno Deploy's GitHub
 * source integration).
 */
import { serveStatic } from "npm:hono@4.12.15/deno";

// Imports resolve directly to TypeScript source under `src/` via Deno's
// sloppy-imports unstable feature (see deno.json). This avoids depending on
// the tsup-bundled `dist/`, which strips `node:` prefixes and confuses Deno.
import { buildApp } from "../src/api/server.js";
import {
  GtfsLoader,
  createKtmb,
  fetchVehiclePositions,
  ktmbGetAvailability,
} from "../src/core/index.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const REFRESH_MS = Number(Deno.env.get("KTMB_REFRESH_MS") ?? 6 * 60 * 60 * 1000);

const log = (...args: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log("[ktmb-deno]", ...args);
};

const loader = new GtfsLoader(FEED_STATIC);
const initial = await loader.load();
if (!initial.ok) {
  throw new Error(`GTFS load failed: ${initial.error.code} ${initial.error.message}`);
}
log("loaded GTFS:", initial.data.listStops().length, "stops,", initial.data.listRoutes().length, "routes");

const ktmb = createKtmb({
  store: initial.data,
  fareGetter: ktmbGetAvailability,
  realtimeFetcher: () => fetchVehiclePositions(FEED_RT),
});

// Background refresh — keep schedule data current across the calendar window
// rollover. Deno Deploy's isolates are short-lived, so the timer mostly serves
// long-running isolates handling many requests.
if (REFRESH_MS > 0) {
  // The runtime facade exposes `swapStore` via `createKtmb`, but it's not in
  // the public type. Cast through `unknown` so the cast is explicit.
  const swap = (ktmb as unknown as { swapStore: (s: unknown) => void }).swapStore;
  setInterval(() => {
    void loader.refresh().then((rr) => {
      if (rr.ok) {
        swap(rr.data);
        log("refreshed GTFS:", rr.data.listStops().length, "stops");
      } else {
        log("refresh failed:", rr.error.code, rr.error.message);
      }
    });
  }, REFRESH_MS);
}

const app = buildApp(ktmb);

// Static demo at /, /ktmb-demo.js, etc. Registered after buildApp so that
// /v1/* and /healthz keep their handlers; serveStatic only matches files that
// actually exist under ./site.
app.get("/", serveStatic({ path: "./site/index.html" }));
app.get("/ktmb-demo.js", serveStatic({ path: "./site/ktmb-demo.js" }));
app.get("/data/*", serveStatic({ root: "./site" }));

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, app.fetch);
