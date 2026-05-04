/* eslint-disable no-console */
import { fetchWithRetry } from "../src/core/client/http.js";
import { DATA_GOV_MY_GTFS_STATIC_URL } from "../src/core/config.js";
import { unzipSync, strFromU8 } from "fflate";

const main = async (): Promise<void> => {
  const r = await fetchWithRetry(DATA_GOV_MY_GTFS_STATIC_URL);
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  const buf = new Uint8Array(await r.data.arrayBuffer());
  const files = unzipSync(buf);
  const stops = strFromU8(files["stops.txt"]!).split(/\r?\n/);
  for (const line of stops.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    console.log(`${cols[0]!.padEnd(8)} ${cols[1]}`);
  }
  console.log(`\nTotal: ${stops.length - 2}`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
