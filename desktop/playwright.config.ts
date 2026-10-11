import { defineConfig } from "@playwright/test";

// End-to-end tests drive the real built Electron app (out/) against a real
// API and PostgreSQL. e2e/global-setup.ts creates a throwaway database
// (bcis_billing_e2e), migrates and seeds it, and starts the API on port
// 3199; global-teardown.ts stops it and drops the database. The dev
// (bcis_billing) and automated-test (bcis_billing_test) databases are never
// touched. Run with `npm run e2e` (builds first).
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.e2e\.ts$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "e2e-report", open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { screenshot: "only-on-failure", trace: "retain-on-failure" },
});
