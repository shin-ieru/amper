import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
const page = await ctx.newPage();
const url = "https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit";
const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(8000);
const report = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  const iframe = document.querySelector("iframe.docs-texteventtarget-iframe");
  let inner = null;
  try {
    const d = iframe?.contentDocument;
    const ce = d?.querySelector("[contenteditable]");
    inner = { src: iframe.getAttribute("src"), sameOrigin: !!d, readyState: d?.readyState, contentEditable: ce ? { tag: ce.tagName, value: ce.getAttribute("contenteditable"), role: ce.getAttribute("role") } : null, bodyTextLength: d?.body?.innerText?.length };
  } catch (e) { inner = { error: String(e) }; }
  return {
    title: document.title,
    url: location.href,
    canvasTiles: q("canvas.kix-canvas-tile-content"),
    canvases: q("canvas"),
    legacyWordNodes: q(".kix-wordhtmlgenerator-word-node"),
    lineviews: q(".kix-lineview"),
    appview: q(".kix-appview-editor"),
    cursor: q(".kix-cursor"),
    cursorCaret: q(".kix-cursor-caret"),
    texteventIframe: !!iframe,
    inner,
    annotateGlobal: typeof window._docs_annotate_canvas_by_ext,
    svgTextNodes: q(".kix-canvas-tile-content svg text, svg.kix-canvas-tile-content text"),
    ariaLiveRegions: q("[aria-live]"),
    viewOnlyBadge: /view only|viewing/i.test(document.body.innerText.slice(0, 4000)),
  };
});
console.log(JSON.stringify({ status: res?.status(), ...report }, null, 2));
await page.screenshot({ path: process.argv[2] });
await browser.close();
