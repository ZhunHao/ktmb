/* eslint-disable no-console */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseHomePage } from "../src/core/ktmb/parse-home.js";

const html = readFileSync(
  resolve(import.meta.dirname, "../tests/fixtures/ktmb/home.html"),
  "utf8",
);
const result = parseHomePage(html);
if (!result.ok) {
  console.error("parseHomePage failed:", result.error);
  process.exit(1);
}
for (const s of result.data.stations) {
  console.log(
    `${s.id.padEnd(7)} ${s.description.padEnd(40)} ${s.state.padEnd(20)} ${s.trainServices.join(",")}`,
  );
}
console.log(`\nTotal: ${result.data.stations.length}`);
