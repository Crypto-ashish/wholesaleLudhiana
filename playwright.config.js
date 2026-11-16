// End-to-end tests: real Worker (wrangler dev, local D1) + a local mock of the
// Razorpay Orders API. Needs .dev.vars — see tests/e2e/README in README.md.
import { defineConfig, devices } from "@playwright/test";

const PORT = process.env.E2E_PORT || 8787;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off", screenshot: "only-on-failure", serviceWorkers: "block" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 850 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    { command: "node tests/e2e/mock-razorpay.mjs", url: "http://127.0.0.1:8799/health", reuseExistingServer: true },
    { command: `npx wrangler d1 migrations apply wholesaleludhiana --local && npx wrangler dev --port ${PORT}`, url: `http://localhost:${PORT}/api/health`, reuseExistingServer: true, timeout: 120_000 },
  ],
});
