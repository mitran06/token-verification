import { defineConfig } from "@playwright/test";

// e2e runs `next dev` (NODE_ENV=development → cookies not marked Secure, so they
// work over plain-http localhost) against a fresh Dockerized Postgres.
const DB_URL = "postgres://postgres:postgres@localhost:5432/token_system";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: DB_URL,
      SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-32",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
