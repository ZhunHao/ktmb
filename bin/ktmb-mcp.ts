import { buildMcpServer, runStdio } from "../src/mcp/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const server = buildMcpServer(rt.ktmb);

  const stop = (signal: string): void => {
    console.error(`[ktmb-mcp] ${signal} received, shutting down`);
    rt.shutdown();
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  await runStdio(server);
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
