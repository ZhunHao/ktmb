import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "node20",
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
    target: "node20",
    splitting: false,
    sourcemap: true,
    clean: false,
    dts: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
