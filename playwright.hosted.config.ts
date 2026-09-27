import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests-hosted",
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    ...devices["Desktop Chrome"],
  },
  timeout: 30000,
});
