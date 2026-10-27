import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  webServer: { command: "pnpm dev -p 3100", url: "http://127.0.0.1:3100/api/health", reuseExistingServer: true, timeout: 120_000 },
  use: { baseURL: "http://127.0.0.1:3100" },
});
