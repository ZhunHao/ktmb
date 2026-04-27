import { GtfsLoader } from "../src/core/gtfs/loader.js";
import { fetchVehiclePositions } from "../src/core/gtfs/realtime.js";
import { ktmbGetAvailability } from "../src/core/index.js";
import { createKtmb } from "../src/core/index.js";
import { buildMcpServer, runStdio } from "../src/mcp/server.js";

const FEED_STATIC = "https://api.data.gov.my/gtfs-static/ktmb";
const FEED_RT = "https://api.data.gov.my/gtfs-realtime/vehicle-position/ktmb";

const main = async (): Promise<void> => {
  const loader = new GtfsLoader(FEED_STATIC);
  const r = await loader.load();
  if (!r.ok) {
    console.error("[ktmb-mcp] initial GTFS load failed:", r.error);
    process.exit(1);
  }
  const ktmb = createKtmb({
    store: r.data,
    fareGetter: ktmbGetAvailability,
    realtimeFetcher: () => fetchVehiclePositions(FEED_RT),
  });
  const server = buildMcpServer(ktmb);
  await runStdio(server);
};

main().catch((e) => {
  console.error("[ktmb-mcp]", e);
  process.exit(1);
});
