import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
await page.goto("https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
const tile = page.locator("canvas.kix-canvas-tile-content").first();
const box = await tile.boundingBox();
// click roughly into the first paragraph of body text
await page.mouse.click(box.x + 120, box.y + 140);
await page.waitForTimeout(800);
const caret = () => page.evaluate(() => { const c = document.querySelector(".kix-cursor"); const r = c?.getBoundingClientRect(); return r ? { x: Math.round(r.x), y: Math.round(r.y), h: Math.round(r.height), display: getComputedStyle(c).display, visibility: getComputedStyle(c).visibility } : null; });
const results = {};
results.activeElementIsIframe = await page.evaluate(() => document.activeElement?.classList.contains("docs-texteventtarget-iframe"));
results.caretAfterClick = await caret();
// install probe listeners in the iframe (capture phase at its window)
await page.evaluate(() => {
  const win = document.querySelector("iframe.docs-texteventtarget-iframe").contentWindow;
  window.__probe = { seen: [], block: false };
  win.addEventListener("keydown", (e) => { window.__probe.seen.push(`${e.type}:${e.key}:${e.isTrusted}`); if (window.__probe.block) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  win.addEventListener("beforeinput", (e) => window.__probe.seen.push(`beforeinput:${e.inputType}`), true);
});
// 1. trusted ArrowRight x3
const c0 = await caret();
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const c1 = await caret();
results.trustedArrow = { before: c0, after: c1, moved: c0?.x !== c1?.x, seen: await page.evaluate(() => window.__probe.seen.splice(0)) };
// 2. trusted ArrowRight while our capture listener blocks
await page.evaluate(() => (window.__probe.block = true));
for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(300);
const c2 = await caret();
results.blockedTrustedArrow = { before: c1, after: c2, moved: c1?.x !== c2?.x, seen: await page.evaluate(() => window.__probe.seen.splice(0)) };
await page.evaluate(() => (window.__probe.block = false));
// 3. synthetic (untrusted) ArrowRight x3 dispatched to the iframe's contenteditable
const synth = (key, keyCode, shift = false) => page.evaluate(([key, keyCode, shift]) => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  const target = d.querySelector("[contenteditable]") ?? d.body;
  const W = d.defaultView;
  const init = { key, code: key, keyCode, which: keyCode, shiftKey: shift, bubbles: true, cancelable: true };
  const ev = new W.KeyboardEvent("keydown", init);
  Object.defineProperty(ev, "keyCode", { get: () => keyCode });
  Object.defineProperty(ev, "which", { get: () => keyCode });
  target.dispatchEvent(ev);
  target.dispatchEvent(new W.KeyboardEvent("keyup", init));
}, [key, keyCode, shift]);
for (let i = 0; i < 3; i++) await synth("ArrowRight", 39);
await page.waitForTimeout(300);
const c3 = await caret();
results.syntheticArrow = { before: c2, after: c3, moved: c2?.x !== c3?.x };
// 4. synthetic Shift+ArrowLeft x5: selection? text mirrored into iframe?
for (let i = 0; i < 5; i++) await synth("ArrowLeft", 37, true);
await page.waitForTimeout(400);
results.syntheticSelect = await page.evaluate(() => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  return {
    iframeText: d.body.innerText,
    iframeHtmlLength: d.body.innerHTML.length,
    selectionOverlays: document.querySelectorAll(".kix-selection-overlay").length,
    caret: (() => { const r = document.querySelector(".kix-cursor")?.getBoundingClientRect(); return r && Math.round(r.x); })(),
  };
});
// 5. trusted Shift+ArrowLeft x5 for comparison
await page.keyboard.press("ArrowRight");
for (let i = 0; i < 5; i++) await page.keyboard.press("Shift+ArrowLeft");
await page.waitForTimeout(400);
results.trustedSelect = await page.evaluate(() => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  return { iframeText: d.body.innerText, selectionOverlays: document.querySelectorAll(".kix-selection-overlay").length };
});
// 6. which caret/selection-related classes exist
results.kixClasses = await page.evaluate(() => [...new Set([...document.querySelectorAll("[class*='kix-']")].flatMap((e) => [...e.classList].filter((c) => c.startsWith("kix-"))))].sort().slice(0, 80));
console.log(JSON.stringify(results, null, 2));
await page.screenshot({ path: process.argv[2] });
await browser.close();
