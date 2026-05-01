/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../tests/fixtures/ktmb/layout-v2.json");
const before = readFileSync(path, "utf8");
const after = before
  .replace(/CfDJ8[\w\-+/=]+/g, "<RVT_REDACTED>")
  .replace(/[A-Za-z0-9+/]{40,}={0,2}/g, "<TOKEN_REDACTED>");
writeFileSync(path, after);
console.log(`Redacted ${path} (${before.length} → ${after.length} bytes)`);
