import { fetchWithRetry } from "../src/core/client/http.js";
import { unzipSync, strFromU8 } from "fflate";

const URL = "https://api.data.gov.my/gtfs-static/ktmb";

const main = async (): Promise<void> => {
  const r = await fetchWithRetry(URL);
  if (!r.ok) {
    console.error(r.error);
    process.exit(1);
  }
  const buf = new Uint8Array(await r.data.arrayBuffer());
  const files = unzipSync(buf);
  console.log("Files in feed:");
  for (const name of Object.keys(files).sort()) {
    console.log(`  ${name}: ${files[name]!.byteLength} bytes`);
  }
  for (const name of ["agency.txt", "routes.txt", "calendar.txt", "stops.txt"]) {
    const f = files[name];
    if (!f) continue;
    const lines = strFromU8(f).split(/\r?\n/);
    console.log(`\n--- ${name} (head) ---`);
    console.log(lines.slice(0, 6).join("\n"));
    console.log(`(total lines: ${lines.length})`);
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
