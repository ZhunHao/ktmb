import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "node22",
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: false,
  },
  {
    entry: {
      "bin/ktmb-mcp": "bin/ktmb-mcp.ts",
      "bin/ktmb-api": "bin/ktmb-api.ts",
    },
    format: ["esm", "cjs"],
    target: "node22",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
  },
  {
    // ESM-only, no banner — consumed by bin/ktmb-deno.ts (Deno Deploy entry).
    entry: { "api/server": "src/api/server.ts" },
    format: ["esm"],
    target: "node22",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
  },
]);
