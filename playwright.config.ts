import { defineConfig, devices } from "@playwright/test";

const PORT = 3300;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 375, height: 812 } } },
  ],
  webServer: {
    // Production build; saved plans come from the fictional test fixtures, never live Qloo.
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/samples`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { OPENER_SAMPLES_DIR: "tests/fixtures/samples", OPENER_CACHE_DIR: ".cache/e2e" },
  },
});
