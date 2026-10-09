try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional; real environment variables may be provided instead.
}

// Tests run against an isolated database, never the development database.
// The test URL reuses the credentials/host from DATABASE_URL but targets
// the dedicated *_test database.
const sourceUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (sourceUrl) {
  process.env.DATABASE_URL = sourceUrl.replace(/\/[^/?]+(\?|$)/, "/bcis_billing_test$1");
}
process.env.JWT_SECRET = "test-jwt-secret-not-for-production";

declare global {
  // eslint-disable-next-line no-var
  var __testPeriodCounter: number;
}

// Global period counter to ensure unique period dates across test files.
// Initialize only if not already set (setup may run per test file).
if (typeof globalThis.__testPeriodCounter !== 'number') {
  globalThis.__testPeriodCounter = 0;
}
