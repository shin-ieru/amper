import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const dist = resolve(root, "apps/google-docs-extension/dist");
const output = resolve(root, "assets/store/screenshots");
mkdirSync(output, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "amper-store-shots-"));

const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

try {
  const extensionPage = await context.newPage();
  await extensionPage.goto("chrome://extensions");
  const extensionId = await extensionPage.evaluate(async () =>
    (await chrome.management.getAll()).find((extension) => extension.name === "Amper")?.id,
  );
  await extensionPage.close();
  if (!extensionId) throw new Error("Could not find the built Amper extension in Chromium.");

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 1280, height: 800 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator("#enableAmper").click();
  await popup.waitForFunction(() => !document.querySelector("#productControls")?.hasAttribute("hidden"));
  await popup.screenshot({
    path: resolve(output, "amper-popup-settings-1280x800.png"),
    animations: "disabled",
    style: "html { display: grid !important; place-items: center !important; min-height: 100vh !important; background: #f4f7fb !important; } body { margin: 0 !important; transform: scale(1.7) !important; box-shadow: 0 18px 48px rgba(31, 59, 91, .14) !important; }",
  });
  await popup.close();

  const reference = await context.newPage();
  await reference.setViewportSize({ width: 1280, height: 800 });
  await reference.goto(`chrome-extension://${extensionId}/reference.html`);
  await reference.locator("#q").fill("equi");
  await reference.screenshot({ path: resolve(output, "amper-reference-equi-1280x800.png"), animations: "disabled" });
  await reference.close();
  console.log(`Captured actual built popup and reference UI in ${output}.`);
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

function dirname(path) {
  return path.slice(0, path.lastIndexOf("/"));
}
