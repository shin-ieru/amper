import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../apps/google-docs-extension/dist", import.meta.url));

base("production build omits developer and testing controls", () => {
  const popupHtml = readFileSync(join(dist, "popup.html"), "utf8");
  const popupJs = readFileSync(join(dist, "popup.js"), "utf8");
  const contentJs = readFileSync(join(dist, "content.js"), "utf8");
  const bridgeJs = readFileSync(join(dist, "bridge.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.json"), "utf8")) as {
    icons: Record<string, string>;
    action: { default_icon: Record<string, string> };
  };
  expect(popupHtml).not.toContain('class="dev"');
  expect(popupJs).not.toContain("amper:probe");
  expect(contentJs).not.toContain("amper:probe");
  expect(bridgeJs).not.toContain("kix-canvas-tile-content");
  expect(manifest.icons).toEqual({
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  });
  expect(manifest.action.default_icon).toEqual({
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
  });
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = readFileSync(join(dist, path));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(Number(size));
    expect(png.readUInt32BE(20)).toBe(Number(size));
  }
});

const test = base.extend<{ context: BrowserContext; extensionId: string; popup: Page }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "amper-ext-")), {
      channel: "chromium",
      headless: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const page = await context.newPage();
    await page.goto("chrome://extensions");
    const id = await page.evaluate(async () => (await chrome.management.getAll()).find((e) => e.name === "Amper")?.id);
    await page.close();
    await use(id!);
  },
  popup: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.setViewportSize({ width: 300, height: 640 });
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});

const rows = (page: Page, list: string) => page.locator(`#${list} li`);

test("first run presents the disclosure and keeps processing disabled", async ({ popup }) => {
  await expect(popup.locator("#consentDisclosure")).toBeVisible();
  await expect(popup.locator("#try")).toBeHidden();
  await expect(popup.locator("#productControls")).toBeHidden();
  await expect(popup.locator("#consentDisclosure")).toContainText("reads the text you type in Google Docs");
  await expect(popup.locator("#consentDisclosure")).toContainText("solely to detect and format chemistry notation");
  await expect(popup.locator("#consentDisclosure")).toContainText("Processing happens locally in your browser");
  await expect(popup.locator("#consentDisclosure")).toContainText("not sent to Amper servers or third parties");
  await expect(popup.getByRole("button", { name: "Enable Amper", exact: true })).toBeVisible();
});

test("Google Docs typing is not processed before consent and is processed after Enable Amper", async ({ context, popup }) => {
  await context.addInitScript(() => {
    if (window.top !== window) return;
    const events: { type: string; detail: unknown }[] = [];
    Object.defineProperty(window, "__amperTestEvents", { value: events });
    document.addEventListener("amper:bridge-request", (event) => {
      events.push({ type: "request", detail: (event as CustomEvent).detail });
    });
    document.addEventListener("amper:bridge-active", (event) => {
      events.push({ type: "active", detail: (event as CustomEvent).detail });
    });
  });
  await context.route("https://docs.google.com/document/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><iframe class="docs-texteventtarget-iframe" src="about:blank"></iframe></body></html>',
    }),
  );

  const docs = await context.newPage();
  await docs.goto("https://docs.google.com/document/d/consent-test/edit");
  const editor = docs.frameLocator("iframe.docs-texteventtarget-iframe").locator("body");
  await editor.evaluate((body) => {
    body.setAttribute("contenteditable", "true");
    body.setAttribute("role", "textbox");
  });
  await editor.pressSequentially("h2o ");
  await expect(editor).toHaveText("h2o ");
  await docs.waitForTimeout(100);
  const requestsBeforeConsent = await docs.evaluate(() =>
    (window as unknown as { __amperTestEvents: { type: string }[] }).__amperTestEvents.filter((event) => event.type === "request"),
  );
  expect(requestsBeforeConsent).toHaveLength(0);

  await popup.getByRole("button", { name: "Enable Amper", exact: true }).click();
  await expect.poll(() => docs.evaluate(() =>
    (window as unknown as { __amperTestEvents: { type: string; detail: unknown }[] }).__amperTestEvents.some(
      (event) => event.type === "active" && event.detail === true,
    ),
  )).toBe(true);
  await editor.pressSequentially("h2o ");
  await expect.poll(() => docs.evaluate(() =>
    (window as unknown as { __amperTestEvents: { type: string }[] }).__amperTestEvents.filter((event) => event.type === "request").length,
  )).toBeGreaterThan(0);
  await docs.close();
});

test("Enable Amper records consent, enables processing, and remains enabled after reopening", async ({ popup }) => {
  await popup.getByRole("button", { name: "Enable Amper", exact: true }).click();
  await expect(popup.locator("#consentDisclosure")).toBeHidden();
  await expect(popup.locator("#try")).toBeVisible();
  await expect(popup.locator("#productControls")).toBeVisible();
  await expect(popup.locator("#try")).toContainText("Type a shortcut, then press Space.");
  await expect(rows(popup, "tryList")).toHaveText([
    /equi\s*→\s*⇌/,
    /sigma\s*→\s*σ/,
    /capital sigma\s*→\s*Σ/,
    /h2so4\s*→\s*H₂SO₄/,
    /so4\^2-\s*→\s*SO₄²⁻/,
  ]);
  const accepted = await popup.evaluate(async () => {
    const state = await chrome.storage.local.get(["amper.consentVersion", "amper.settings"]);
    return { version: state["amper.consentVersion"], enabled: (state["amper.settings"] as { enabled?: boolean })?.enabled };
  });
  expect(accepted).toEqual({ version: 1, enabled: true });
  await popup.reload();
  await expect(popup.locator("#consentDisclosure")).toBeHidden();
  await expect(popup.locator("#try")).toBeVisible();
});

test("settings are still the four product switches plus subscript labels", async ({ popup }) => {
  await popup.getByRole("button", { name: "Enable Amper", exact: true }).click();
  for (const id of ["enabled", "autoConvert", "autocomplete", "backspaceRestore", "subscriptStates"]) {
    await expect(popup.locator("input#" + id)).toBeVisible();
  }
  await expect(popup.locator("details.dev")).toHaveCount(0);
});

test("the user can disable Amper after accepting the disclosure", async ({ popup }) => {
  await popup.getByRole("button", { name: "Enable Amper", exact: true }).click();
  await popup.getByLabel("Enable Amper", { exact: true }).uncheck();
  await popup.reload();
  await expect(popup.locator("#consentDisclosure")).toBeHidden();
  await expect(popup.getByLabel("Enable Amper", { exact: true })).not.toBeChecked();
});

test("View all shortcuts opens the searchable reference", async ({ context, popup }) => {
  await popup.getByRole("button", { name: "Enable Amper", exact: true }).click();
  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: "View all shortcuts" }).first().click();
  const reference = await opened;
  await reference.waitForLoadState();
  expect(reference.url()).toMatch(/reference\.html$/);
  await expect(reference.locator("h2")).toHaveText(["Greek", "Reaction arrows", "Formatting shortcuts", "Formulas & charges", "States", "Scientific symbols"]);
});

test.describe("reference page", () => {
  test.beforeEach(async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/reference.html`);
  });

  test("equi is the recommended equilibrium shortcut; alternatives are listed", async ({ page }) => {
    const arrows = page.locator("#arrows li");
    await expect(arrows.first()).toContainText("equi");
    await expect(arrows.first()).toContainText("⇌");
    await expect(arrows.first().locator(".badge")).toHaveText("recommended");
    await expect(page.locator("#arrows li", { hasText: "equilibrium arrow" }).locator(".badge")).toHaveText("alternative");
    await expect(page.locator("#arrows li", { has: page.locator("kbd", { hasText: /^<=>$/ }) }).locator(".badge")).toHaveText("alternative");
    await expect(page.locator("#arrows li", { has: page.locator("kbd", { hasText: /^<->$/ }) })).toContainText("⇄");
  });

  test("Formatting shortcuts explains explicit commands and renders native scripts", async ({ page }) => {
    const section = page.locator("#formatting");
    await expect(section.locator("h2")).toHaveText("Formatting shortcuts");
    await expect(section.locator(".group-note")).toContainText("without guessing");
    await expect(section.locator(".group-note")).toContainText("inline fraction");
    await expect(section).toContainText("Compound fractions remain inline so inner superscript and subscript formatting can be preserved");
    await expect(section.locator("li", { has: page.locator("kbd", { hasText: /^x sup\(2\)$/ }) }).locator("sup")).toHaveText("2");
    await expect(section.locator("li", { has: page.locator("kbd", { hasText: /^V sub\(max\)$/ }) }).locator("sub")).toHaveText("max");
    await expect(section.locator("kbd", { hasText: /degK/i })).toHaveCount(0);
    await expect(section.locator(".badge.recommended")).toHaveCount(3);
    await expect(page.locator("main")).not.toContainText("°K");
  });

  test("state labels are shown as real subscript", async ({ page }) => {
    await expect(page.locator("#states sub")).toHaveText(["(l)", "(g)", "(aq)", "(s)"]);
  });

  test("the reference lists exact explicit underscore subscript examples", async ({ page }) => {
    for (const [typed, output] of [["x_2", "x₂"], ["x_12", "x₁₂"], ["V_max", "Vₘₐₓ"], ["x_-1", "x₋₁"]] as const) {
      const row = page.locator("#formatting li").filter({ has: page.locator("kbd").getByText(typed, { exact: true }) });
      await expect(row).toContainText(output);
    }
  });

  test("the reference renders arbitrary native subscript and superscript phrases", async ({ page }) => {
    const subscript = page.locator("#formatting li", { has: page.locator("kbd", { hasText: /^x_\(max\)$/ }) });
    const superscript = page.locator("#formatting li", { has: page.locator("kbd", { hasText: /^x\^\(effective\)$/ }) });
    await expect(subscript.locator(".out sub")).toHaveText("max");
    await expect(superscript.locator(".out sup")).toHaveText("effective");
  });

  test("the reference shows bare fractions as Tab suggestions with native scripts and a baseline fraction slash", async ({ page }) => {
    const fraction = page.locator("#formatting li", { has: page.locator("kbd", { hasText: /^x\/y$/ }) });
    await expect(fraction.locator(".out")).toHaveText("x⁄y");
    await expect(fraction.locator(".out sup")).toHaveText("x");
    await expect(fraction.locator(".out sub")).toHaveText("y");
    await expect(fraction.locator(".meta")).toContainText("Tab to accept");
    await expect(fraction).toContainText("suggestion");

    const integerFraction = page.locator("#formatting li", { has: page.locator("kbd", { hasText: /^12\/24$/ }) });
    await expect(integerFraction.locator(".out")).toHaveText("12⁄24");
    await expect(integerFraction.locator(".out sup")).toHaveText("12");
    await expect(integerFraction.locator(".out sub")).toHaveText("24");
  });

  test("search filters across groups, is case-insensitive, and reports no matches", async ({ page }) => {
    const search = page.getByRole("searchbox", { name: "Search shortcuts" });
    await expect(search).toBeFocused();
    await search.fill("EQUILIBRIUM");
    await expect(page.locator("section:visible h2")).toHaveText(["Reaction arrows"]);
    // Case-insensitive search is case-insensitive for Greek too: σ also finds capital Σ.
    await search.fill("σ");
    await expect(page.locator("section:visible li:visible .out")).toHaveText(["σ", "Σ"]);
    await search.fill("zzzz");
    await expect(page.locator("#empty")).toBeVisible();
    await expect(page.locator("section:visible")).toHaveCount(0);
    await search.press("Escape");
    await expect(page.locator("section:visible")).toHaveCount(6);
  });

  test("/ focuses search", async ({ page }) => {
    await page.locator("main").click();
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  });
});
