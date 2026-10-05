import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
await page.goto("https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
const clip = { x: 380, y: 165, width: 140, height: 30 };
const shot = () => page.screenshot({ clip });
const placeCaret = async () => { await page.mouse.click(600, 180); await page.mouse.click(476, 180); await page.waitForTimeout(400); };
const setup = () => page.evaluate(() => {
  const win = document.querySelector("iframe.docs-texteventtarget-iframe").contentWindow;
  if (window.__installed) return; window.__installed = true;
  window.__block = false;
  win.addEventListener("keydown", (e) => { if (window.__block) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
});
const synth = (key, keyCode, shift) => page.evaluate(([key, keyCode, shift]) => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  const t = d.querySelector("[contenteditable]") ?? d.body; const W = d.defaultView;
  const ev = new W.KeyboardEvent("keydown", { key, code: key, shiftKey: shift, bubbles: true, cancelable: true });
  Object.defineProperty(ev, "keyCode", { get: () => keyCode }); Object.defineProperty(ev, "which", { get: () => keyCode });
  t.dispatchEvent(ev);
}, [key, keyCode, shift]);
await setup();
const r = {};
await placeCaret(); const base = await shot();
// synthetic selection
await placeCaret(); for (let i = 0; i < 3; i++) await synth("ArrowLeft", 37, true); await page.waitForTimeout(400); const synthSel = await shot();
// trusted selection
await placeCaret(); for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft"); await page.waitForTimeout(400); const trustedSel = await shot();
// trusted selection blocked by our capture listener
await placeCaret(); await page.evaluate(() => (window.__block = true)); for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft"); await page.waitForTimeout(400); const blockedSel = await shot(); await page.evaluate(() => (window.__block = false));
// synthetic event without keyCode override (modern-only fields)
await placeCaret(); await page.evaluate(() => { const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument; const t = d.querySelector("[contenteditable]"); for (let i = 0; i < 3; i++) t.dispatchEvent(new d.defaultView.KeyboardEvent("keydown", { key: "ArrowLeft", code: "ArrowLeft", shiftKey: true, bubbles: true, cancelable: true })); }); await page.waitForTimeout(400); const modernSynth = await shot();
r.baseDiffersFromTrustedSelection = !base.equals(trustedSel);
r.syntheticSelectionChangesCanvas = !base.equals(synthSel);
r.syntheticEqualsTrustedSelection = synthSel.equals(trustedSel);
r.blockedTrustedLeavesCanvasUnchanged = base.equals(blockedSel);
r.modernOnlySyntheticChangesCanvas = !base.equals(modernSynth);
// does a selection mirror text into the hidden iframe? (verify-before-replace idea)
await placeCaret(); for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft"); await page.waitForTimeout(300);
r.selectionMirroredIntoIframe = await page.evaluate(() => document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument.body.innerText.trim());
// copy event exposes selected text? listen for Docs' own copy handling
r.copyEventData = await page.evaluate(() => new Promise((resolve) => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  const dt = new DataTransfer();
  const ev = new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true });
  d.querySelector("[contenteditable]").dispatchEvent(ev);
  setTimeout(() => resolve({ types: [...dt.types], text: dt.getData("text/plain") }), 300);
}));
console.log(JSON.stringify(r, null, 2));
const fs = await import("node:fs");
const dir = process.argv[2];
fs.writeFileSync(`${dir}/sel-base.png`, base); fs.writeFileSync(`${dir}/sel-synth.png`, synthSel); fs.writeFileSync(`${dir}/sel-trusted.png`, trustedSel); fs.writeFileSync(`${dir}/sel-blocked.png`, blockedSel);
await browser.close();
