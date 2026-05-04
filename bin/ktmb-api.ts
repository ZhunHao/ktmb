import { serve } from "@hono/node-server";
import { buildApp } from "../src/api/server.js";
import {
  DATA_GOV_MY_GTFS_REALTIME_URL,
  DATA_GOV_MY_GTFS_STATIC_URL,
} from "../src/core/config.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const main = async (): Promise<void> => {
  const port = Number(process.env.PORT ?? 8787);
  const refreshOverride = process.env.KTMB_REFRESH_MS
    ? Number(process.env.KTMB_REFRESH_MS)
    : undefined;
  const rt = await createKtmbRuntime({
    feedStaticUrl: DATA_GOV_MY_GTFS_STATIC_URL,
    feedRealtimeUrl: DATA_GOV_MY_GTFS_REALTIME_URL,
    ...(refreshOverride !== undefined ? { refreshIntervalMs: refreshOverride } : {}),
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
