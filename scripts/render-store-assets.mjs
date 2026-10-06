import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const iconSvg = readFileSync(resolve(root, "assets/brand/amper-icon.svg"), "utf8");
const promoSvg = readFileSync(resolve(root, "assets/store/amper-small-promo-440x280.svg"), "utf8");
const iconDir = resolve(root, "apps/google-docs-extension/static/icons");
const storeDir = resolve(root, "assets/store");
const siteAssetDir = resolve(root, "site/assets");
mkdirSync(iconDir, { recursive: true });
mkdirSync(storeDir, { recursive: true });
mkdirSync(siteAssetDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(iconSvg);
    await page.screenshot({ path: resolve(iconDir, `icon${size}.png`), omitBackground: true });
    await page.close();
  }
  const promo = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await promo.setContent(promoSvg);
  await promo.screenshot({ path: resolve(storeDir, "amper-small-promo-440x280.png") });
  await promo.close();
} finally {
  await browser.close();
}

copyFileSync(resolve(iconDir, "icon128.png"), resolve(siteAssetDir, "amper-icon-128.png"));
copyFileSync(resolve(iconDir, "icon32.png"), resolve(siteAssetDir, "amper-icon-32.png"));
console.log("Rendered 16, 32, 48, and 128 px extension icons and the 440×280 store promo image.");
