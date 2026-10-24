import { defineConfig } from "@playwright/test";

// Override the target with E2E_BASE_URL to test a deployed domain instead of
// the local dev server (webServer is skipped in that case).
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173";
const remote = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: BASE_URL, trace: "retain-on-failure" },
  ...(remote
    ? {}
    : {
        webServer: {
          command: "npm --prefix web run dev -- --host 127.0.0.1 --port 4173 --strictPort",
          url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI,
        },
      }),
});
