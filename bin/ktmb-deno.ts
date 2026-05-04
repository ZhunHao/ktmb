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
// Hono is pinned to an exact version in `package.json` (no caret) so this
// `npm:` specifier — which Deno resolves independently of the pnpm lockfile —
// cannot drift on a routine `pnpm update`. Bumping requires editing both.
import { serveStatic } from "npm:hono@4.12.16/deno";

// Imports resolve directly to TypeScript source under `src/` via Deno's
// sloppy-imports unstable feature (see deno.json). This avoids depending on
// the tsup-bundled `dist/`, which strips `node:` prefixes and confuses Deno.
import { buildApp } from "../src/api/server.js";
import {
  DATA_GOV_MY_GTFS_REALTIME_URL,
  DATA_GOV_MY_GTFS_STATIC_URL,
} from "../src/core/config.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const refreshOverrideRaw = Deno.env.get("KTMB_REFRESH_MS");
const refreshOverride = refreshOverrideRaw ? Number(refreshOverrideRaw) : undefined;

const log = (...args: unknown[]): void => {
  console.log("[ktmb-deno]", ...args);
};

const rt = await createKtmbRuntime({
  feedStaticUrl: DATA_GOV_MY_GTFS_STATIC_URL,
  feedRealtimeUrl: DATA_GOV_MY_GTFS_REALTIME_URL,
  ...(refreshOverride !== undefined ? { refreshIntervalMs: refreshOverride } : {}),
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
