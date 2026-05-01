import { serve } from "@hono/node-server";
import { buildApp } from "../src/api/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? 8787);
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const app = buildApp(rt.ktmb);
  const server = serve({ fetch: app.fetch, port });
  console.log(`[ktmb-api] listening on http://localhost:${port}`);

  const stop = (signal: string): void => {
    console.log(`[ktmb-api] ${signal} received, shutting down`);
    rt.shutdown();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5_000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
};

main().catch((e) => {
  console.error("[ktmb-api]", e);
  process.exit(1);
});
