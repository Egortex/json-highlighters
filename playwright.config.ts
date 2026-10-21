import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5183",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  webServer: {
    command: "npx vite --port 5183 --strictPort",
    cwd: "./example",
    url: "http://localhost:5183",
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
