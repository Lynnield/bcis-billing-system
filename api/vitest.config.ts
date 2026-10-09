import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15000,
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    // Test files share one live Postgres database (bcis_billing_test) and
    // some routes (e.g. /api/v1/reports/dashboard, /api/v1/reports/aging)
    // intentionally aggregate across the whole database with no scoping
    // filter. Running files as truly concurrent processes makes those
    // global-aggregate assertions racy against other files' writes, so
    // files run sequentially against the shared database instead.
    fileParallelism: false,
  },
});
