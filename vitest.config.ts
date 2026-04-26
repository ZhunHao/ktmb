import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/types.ts", "src/**/index.ts"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 },
    },
  },
});
