import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const host = "localhost";
const listenHost = "127.0.0.1";
const port = 3100;
const baseURL = `http://${host}:${port}`;
const root = process.cwd();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL,
    locale: "zh-TW",
    timezoneId: "Asia/Taipei",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --hostname ${listenHost} --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      AUTH_URL: baseURL,
      AUTH_SECRET: "e2e-only-auth-secret-with-at-least-32-characters",
      AUTH_TEST_MODE: "true",
      TEST_AUTH_SECRET: "local-playwright-test-secret",
      APP_DEFAULT_TIMEZONE: "Asia/Taipei",
      DATA_STORE_DIR: path.join(root, "tests/.tmp/e2e-data"),
      CALENDAR_FIXTURE_PATH: path.join(
        root,
        "tests/fixtures/google-calendar-events.json",
      ),
    },
  },
});
