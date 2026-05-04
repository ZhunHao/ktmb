/**
 * Deno Deploy² entry. Bootstraps the same Hono app as `ktmb-api` and serves
 * the static demo from `site/` on the same origin. The library's GTFS feed
 * is loaded once on cold-start, held in memory, and refreshed every 6 h via
 * the shared `createKtmbRuntime` factory.
 *
 * Local dev: `deno task deploy:dev`
 * Deployed via Deno Deploy's GitHub source integration (auto-builds on every
 * push to `main`; no GitHub Actions workflow involved).
 */
// Keep this version in sync with the `hono` entry in package.json — Deno
// resolves npm: specifiers independently of the pnpm lockfile.
import { serveStatic } from "npm:hono@4.12.16/deno";

// Imports resolve directly to TypeScript source under `src/` via Deno's
// sloppy-imports unstable feature (see deno.json). This avoids depending on
// the tsup-bundled `dist/`, which strips `node:` prefixes and confuses Deno.
import { buildApp } from "../src/api/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";
const REFRESH_MS = Number(Deno.env.get("KTMB_REFRESH_MS") ?? 6 * 60 * 60 * 1000);

const log = (...args: unknown[]): void => {
  console.log("[ktmb-deno]", ...args);
};

const rt = await createKtmbRuntime({
  feedStaticUrl: FEED_STATIC,
  feedRealtimeUrl: FEED_RT,
  refreshIntervalMs: REFRESH_MS,
  logger: {
    info: (msg, err) => (err === undefined ? log(msg) : log(msg, err)),
    error: (msg, err) => (err === undefined ? log(msg) : log(msg, err)),
  },
});
const store = rt.loader.currentStore();
log(
  "loaded GTFS:",
  store?.listStops().length ?? 0,
  "stops,",
  store?.listRoutes().length ?? 0,
  "routes",
);

const app = buildApp(rt.ktmb);

// Static demo at /, /ktmb-demo.js, etc. Registered after buildApp so that
// /v1/* and /healthz keep their handlers; serveStatic only matches files that
// actually exist under ./site.
app.get("/", serveStatic({ path: "./site/index.html" }));
app.get("/ktmb-demo.js", serveStatic({ path: "./site/ktmb-demo.js" }));
app.get("/data/*", serveStatic({ root: "./site" }));

Deno.serve({ port: Number(Deno.env.get("PORT") ?? 8000) }, app.fetch);
