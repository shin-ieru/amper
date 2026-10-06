import { defineConfig } from "@playwright/test";

/**
 * Browser tests of the built extension's own pages (popup, reference). They load
 * apps/google-docs-extension/dist into Playwright's Chromium, because branded
 * Chrome 137+ ignores --load-extension. Run `npm run build:extension` first.
 */
export default defineConfig({
  testDir: "tests/e2e-extension",
  timeout: 30_000,
  workers: 1,
  reporter: [["list"]],
});
