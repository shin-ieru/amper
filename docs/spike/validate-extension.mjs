// Loads the built extension (apps/google-docs-extension/dist) into Playwright's Chromium and checks it
// against a live, public, view-only Google Doc: MAIN-world bridge injection, iframe attachment, trusted
// key observation, Backspace/Tab interception plumbing, and the probe message. Edits are impossible in
// view-only mode, so conversion itself is NOT exercised here.
// Usage: node docs/spike/validate-extension.mjs
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ext = fileURLToPath(new URL("../../apps/google-docs-extension/dist", import.meta.url));
const DOC = "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit";
const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "chemly-")), {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  locale: "en-US",
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
let [worker] = context.serviceWorkers();
const page = await context.newPage();
const logs = [];
page.on("console", (m) => m.text().includes("[Chemly]") && logs.push(m.text()));
await page.goto(DOC, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);

const results = {};
// The MAIN-world bridge answers from the page's own world.
results.bridgeInMainWorld = await page.evaluate(() => {
  let raw;
  const on = (e) => (raw = e.detail);
  document.addEventListener("chemly:bridge-response", on);
  document.dispatchEvent(new CustomEvent("chemly:bridge-request", { detail: JSON.stringify({ op: "ping" }) }));
  document.removeEventListener("chemly:bridge-response", on);
  return raw ?? null;
});
// Find the extension id and ask the content script for its probe via an extension page.
const extPage = await context.newPage();
await extPage.goto("chrome://extensions");
const extensionId = await extPage.evaluate(async () => (await chrome.management.getAll()).find((e) => e.name === "Chemly")?.id);
await extPage.close();
results.extensionLoaded = !!extensionId;

// Enable diagnostics so the content script logs (never text), then reload so options apply.
const popup = await context.newPage();
await popup.goto(`chrome-extension://${extensionId}/popup.html`);
await popup.evaluate(() => chrome.storage.local.set({ "chemly.extension": { strategy: "keypress", verifyBeforeReplace: true, diagnostics: true } }));
await page.bringToFront();
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await page.mouse.click(476, 180);
await page.waitForTimeout(300);
// Trusted typing: in view-only mode Docs ignores the characters, but Chemly must observe them.
await page.keyboard.type("capital sig");
await page.waitForTimeout(300);
results.overlayShownForTrustedTyping = await page.evaluate(() => {
  const host = document.querySelector("chemly-suggestions");
  const list = host?.shadowRoot?.querySelector(".list");
  return !!list && !list.hidden && list.textContent.includes("Σ");
});
results.overlayPosition = await page.evaluate(() => {
  const r = document.querySelector("chemly-suggestions")?.shadowRoot?.querySelector(".list")?.getBoundingClientRect();
  return r ? { x: Math.round(r.x), y: Math.round(r.y) } : null;
});
await page.screenshot({ path: process.argv[2] ?? join(tmpdir(), "chemly-ext.png") });
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
results.escapeDismissed = await page.evaluate(() => document.querySelector("chemly-suggestions")?.shadowRoot?.querySelector(".list")?.hidden ?? null);
await page.mouse.click(476, 180);
results.probe = await popup.evaluate(async () => {
  // Chemly has no "tabs" permission (by design), so URL filters are unavailable: ask every tab.
  for (const tab of await chrome.tabs.query({})) {
    try {
      const reply = await chrome.tabs.sendMessage(tab.id, { type: "chemly:probe" });
      if (reply) return reply;
    } catch {}
  }
  return null;
});
results.diagnosticLogs = logs;
console.log(JSON.stringify(results, null, 2));
await context.close();
