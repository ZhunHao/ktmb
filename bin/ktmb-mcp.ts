import { buildMcpServer, runStdio, runHttp } from "../src/mcp/server.js";
import { createKtmbRuntime } from "../src/runtime/bootstrap.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

type CliArgs = {
  transport: "stdio" | "http";
  port: number;
  host: string;
};

const parseArgs = (argv: readonly string[]): CliArgs => {
  let transport: "stdio" | "http" = "stdio";
  let port = Number(process.env.PORT ?? 3030);
  let host = process.env.HOST ?? "127.0.0.1";
  for (const arg of argv) {
    if (arg === "--transport=http") transport = "http";
    else if (arg === "--transport=stdio") transport = "stdio";
    else if (arg.startsWith("--port=")) port = Number(arg.slice("--port=".length));
    else if (arg.startsWith("--host=")) host = arg.slice("--host=".length);
  }
  return { transport, port, host };
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const refreshIntervalMs = Number(process.env.KTMB_REFRESH_MS ?? 6 * 60 * 60 * 1000);
  const rt = await createKtmbRuntime({
    feedStaticUrl: FEED_STATIC,
    feedRealtimeUrl: FEED_RT,
    refreshIntervalMs,
  });
  const server = buildMcpServer(rt.ktmb);

  let httpHandle: { stop: () => Promise<void> } | undefined;
  const stop = (signal: string): void => {
    console.error(`[ktmb-mcp] ${signal} received, shutting down`);
    rt.shutdown();
    if (httpHandle) {
      void httpHandle.stop();
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  if (args.transport === "http") {
    httpHandle = await runHttp(server, { port: args.port, host: args.host });
    console.error(`[ktmb-mcp] HTTP transport listening on http://${args.host}:${args.port}/mcp`);
  } else {
    await runStdio(server);
  }
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
