import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  // Smoke runs against the PRODUCTION build, not `pnpm dev`: dev-mode
  // hydration is slow and racy (clicks before hydration are lost, which
  // made the smoke suite flake and stall in CI), while CI already builds
  // in the previous step. Local runs need `pnpm build` first, or an
  // already-running server on 3100 (reuseExistingServer).
  webServer: {
    command: "pnpm start -p 3100",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: "http://127.0.0.1:3100" },
});
