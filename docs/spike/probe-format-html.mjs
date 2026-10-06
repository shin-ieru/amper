// Does Docs' synthetic-copy HTML encode vertical alignment? If it does, Amper can read back
// whether a range is subscript (verify formatting, detect leaks) instead of trusting a toggle.
// Runs on a public, view-only Doc, so it can only observe ordinary baseline text.
// Usage: node docs/spike/probe-format-html.mjs
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" })).newPage();
await page.goto("https://docs.google.com/document/d/195j9eDD3ccgjQRttHhJPymLJUCOUjs-jmwTrekvdjFE/edit", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);
await page.mouse.click(476, 180);
await page.waitForTimeout(300);
for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowLeft");
const html = await page.evaluate(() => {
  const d = document.querySelector("iframe.docs-texteventtarget-iframe").contentDocument;
  const dt = new DataTransfer();
  d.querySelector("[contenteditable]").dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
  return dt.getData("text/html");
});
console.log(JSON.stringify({
  length: html.length,
  hasVerticalAlign: /vertical-align/.test(html),
  verticalAlignValues: [...new Set([...html.matchAll(/vertical-align:\s*([a-z-]+)/g)].map((m) => m[1]))],
  hasSubTag: /<sub[\s>]/i.test(html),
  spanStyleSample: (html.match(/<span[^>]*style="[^"]*"/) ?? [""])[0].slice(0, 400),
}, null, 2));
await browser.close();
