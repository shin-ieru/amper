import { chromium, expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../../apps/google-docs-extension/dist", import.meta.url));

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

test("first run shows the onboarding card, not Try typing", async ({ popup }) => {
  await expect(popup.locator("#onboarding")).toBeVisible();
  await expect(popup.locator("#try")).toBeHidden();
  await expect(popup.locator("#onboarding")).toContainText("Space");
  await expect(popup.locator("#onboarding")).toContainText("Backspace");
  await expect(rows(popup, "onboardingList")).toHaveText([/h2so4\s*→\s*H₂SO₄/, /sigma\s*→\s*σ/, /equi\s*→\s*⇌/]);
});

test("Got it reveals Try typing and is remembered", async ({ popup }) => {
  await popup.getByRole("button", { name: "Got it" }).click();
  await expect(popup.locator("#onboarding")).toBeHidden();
  await expect(popup.locator("#try")).toBeVisible();
  await expect(popup.locator("#try")).toContainText("Type a shortcut, then press Space.");
  await expect(rows(popup, "tryList")).toHaveText([
    /equi\s*→\s*⇌/,
    /sigma\s*→\s*σ/,
    /capital sigma\s*→\s*Σ/,
    /h2so4\s*→\s*H₂SO₄/,
    /so4\^2-\s*→\s*SO₄²⁻/,
  ]);
  await popup.reload();
  await expect(popup.locator("#onboarding")).toBeHidden();
  await expect(popup.locator("#try")).toBeVisible();
});

test("settings are still the four product switches plus subscript labels", async ({ popup }) => {
  for (const name of ["Enable Amper", "Automatic conversion", "Autocomplete", "Backspace restores original", "Subscript state labels"]) {
    await expect(popup.getByLabel(name, { exact: false })).toBeVisible();
  }
  await expect(popup.locator("details.dev")).not.toHaveAttribute("open", "");
});

test("View all shortcuts opens the searchable reference", async ({ context, popup }) => {
  const opened = context.waitForEvent("page");
  await popup.getByRole("button", { name: "View all shortcuts" }).first().click();
  const reference = await opened;
  await reference.waitForLoadState();
  expect(reference.url()).toMatch(/reference\.html$/);
  await expect(reference.locator("h2")).toHaveText(["Greek", "Reaction arrows", "Formulas & charges", "States", "Scientific symbols"]);
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

  test("state labels are shown as real subscript", async ({ page }) => {
    await expect(page.locator("#states sub")).toHaveText(["(l)", "(g)", "(aq)", "(s)"]);
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
    await expect(page.locator("section:visible")).toHaveCount(5);
  });

  test("/ focuses search", async ({ page }) => {
    await page.locator("main").click();
    await page.keyboard.press("/");
    await expect(page.getByRole("searchbox", { name: "Search shortcuts" })).toBeFocused();
  });
});
