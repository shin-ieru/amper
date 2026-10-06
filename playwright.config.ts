import { defineConfig } from "@playwright/test";

/**
 * Browser E2E for the playground harness. Uses the locally installed Google
 * Chrome with a throwaway profile (no user data). Google Docs itself is not
 * automated here; see docs/google-docs-spike.md for why.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 20_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: { channel: "chrome", headless: true, baseURL: "http://localhost:5198" },
  // A production build behind `vite preview`, on its own port: a dev server can reload
  // the page mid-test when it re-optimises dependencies, which made one run flaky.
  webServer: {
    command: "npm run build -w @amper/playground && npm run preview -w @amper/playground -- --port 5198",
    url: "http://localhost:5198",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
