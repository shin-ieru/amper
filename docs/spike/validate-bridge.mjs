// Validates the built MAIN-world bridge (apps/google-docs-extension/dist/bridge.js) against a live,
// public, view-only Google Doc. View-only mode permits caret movement, selection and copy, but not edits.
// Usage: node docs/spike/validate-bridge.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const bridgePath = fileURLToPath(new URL("../../apps/google-docs-extension/dist/bridge.js", import.meta.url));
const DOC = "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
await page.goto(DOC, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
// Docs enforces Trusted Types, so <script> injection is refused; evaluate the bundle directly (the
// manifest's "world": "MAIN" content script is injected by Chrome and is not subject to that).
await page.evaluate(readFileSync(bridgePath, "utf8"));

const call = (request) =>
  page.evaluate((request) => {
    let raw;
    const on = (e) => (raw = e.detail);
    document.addEventListener("amper:bridge-response", on);
    document.dispatchEvent(new CustomEvent("amper:bridge-request", { detail: JSON.stringify(request) }));
    document.removeEventListener("amper:bridge-response", on);
    return raw ? JSON.parse(raw) : { ok: false, error: "no answer" };
  }, request);
const placeCaretAtEnd = async () => { await page.mouse.click(600, 180); await page.mouse.click(476, 180); await page.waitForTimeout(300); };

const results = {};
results.ping = await call({ op: "ping" });
results.probe = (await call({ op: "probe" })).report;

await placeCaretAtEnd();
await call({ op: "selectBack", count: 3 });
results.selectBack3 = (await call({ op: "copySelection" })).text;

await placeCaretAtEnd();
await call({ op: "moveLeft", count: 4 });
await call({ op: "selectBack", count: 3 });
results.stepLeft4ThenSelect3 = (await call({ op: "copySelection" })).text;

// Collapse (moveRight 1) + step back (moveRight 4) must return the caret to the end: selecting 3 again gives "doc".
await call({ op: "moveRight", count: 1 });
await call({ op: "moveRight", count: 4 });
await call({ op: "selectBack", count: 3 });
results.afterCollapseAndReturn = (await call({ op: "copySelection" })).text;

await placeCaretAtEnd();
results.copyWithCollapsedCaret = (await call({ op: "copySelection" })).text;

await placeCaretAtEnd();
await call({ op: "selectBack", count: 4 });
results.selectAcrossSpace = (await call({ op: "copySelection" })).text;

const expected = { selectBack3: "doc", stepLeft4ThenSelect3: "ple", afterCollapseAndReturn: "doc", selectAcrossSpace: " doc" };
results.pass = Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, results[k] === v]));
console.log(JSON.stringify(results, null, 2));
await browser.close();
