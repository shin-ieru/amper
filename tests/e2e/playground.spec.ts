import { expect, test, type Page } from "@playwright/test";

const modKey = process.platform === "darwin" ? "Meta" : "Control";

async function open(page: Page, mode: "standard" | "chemistry" = "standard") {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  if (mode === "chemistry") await page.getByText("Chemistry", { exact: true }).click();
  const editor = page.locator("#editor");
  await editor.click();
  return editor;
}

const suggestionItems = (page: Page) => page.locator("chemly-suggestions").locator(".item");

test.describe("milestone 1 in a real browser", () => {
  test("capital sigma → Σ, Backspace restores", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("capital sigma ");
    await expect(editor).toHaveValue("Σ ");
    await page.keyboard.press("Backspace");
    await expect(editor).toHaveValue("capital sigma");
    await page.keyboard.type(" stays");
    await expect(editor).toHaveValue("capital sigma stays");
  });

  test("capital delta → Δ", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("capital delta ");
    await expect(editor).toHaveValue("Δ ");
  });

  test("H2O and Ca(OH)2 convert in Chemistry Mode; H2SO4 Backspace restores", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("H2O and Ca(OH)2 then H2SO4 ");
    await expect(editor).toHaveValue("H₂O and Ca(OH)₂ then H₂SO₄ ");
    await page.keyboard.press("Backspace");
    await expect(editor).toHaveValue("H₂O and Ca(OH)₂ then H2SO4");
  });

  test("M2 MacBook remains unchanged", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("I bought an M2 MacBook. ");
    await expect(editor).toHaveValue("I bought an M2 MacBook. ");
  });

  test("native Undo reverts the conversion as one step", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("H2SO4 ");
    await expect(editor).toHaveValue("H₂SO₄ ");
    await page.keyboard.press(`${modKey}+z`);
    await expect(editor).toHaveValue("H2SO4 ");
  });

  test("caret stays where the user expects after conversion mid-text", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("end");
    await page.keyboard.press("Home");
    await page.keyboard.type("plus minus ");
    await expect(editor).toHaveValue("± end");
    const caret = await editor.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(caret).toBe(2);
  });
});

test.describe("autocomplete overlay", () => {
  test("appears, accepts with Tab, and Backspace restores the partial", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("capital sig");
    await expect(suggestionItems(page)).toHaveCount(1);
    await expect(suggestionItems(page).first()).toContainText("Σ");
    await page.keyboard.press("Tab");
    await expect(editor).toHaveValue("Σ");
    await expect(editor).toBeFocused();
    await page.keyboard.press("Backspace");
    await expect(editor).toHaveValue("capital sig");
  });

  test("Esc dismisses; clicking a suggestion accepts it", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("equilib");
    await expect(suggestionItems(page).first()).toContainText("⇌");
    await page.keyboard.press("Escape");
    await expect(suggestionItems(page)).toHaveCount(0);
    await page.keyboard.type("r");
    await expect(suggestionItems(page).first()).toContainText("⇌");
    await suggestionItems(page).first().click();
    await expect(editor).toHaveValue("⇌");
    await expect(editor).toBeFocused();
  });

  test("clicking elsewhere dismisses", async ({ page }) => {
    await open(page);
    await page.keyboard.type("capital sig");
    await expect(suggestionItems(page)).toHaveCount(1);
    await page.locator(".intro").click();
    await expect(suggestionItems(page)).toHaveCount(0);
  });
});

test.describe("settings and debug", () => {
  test("debug panel explains a decision", async ({ page }) => {
    await open(page, "chemistry");
    await page.keyboard.type("Ca(OH)2 ");
    const debug = page.locator("#debug");
    await expect(debug).toContainText("formula.neutral");
    await expect(debug).toContainText("valid bracket grouping");
    await expect(debug).toContainText("0.97 → autocorrect");
  });

  test("category toggle disables Greek", async ({ page }) => {
    const editor = await open(page);
    await page.getByLabel("Greek").uncheck();
    await editor.click();
    await page.keyboard.type("capital sigma ");
    await expect(editor).toHaveValue("capital sigma ");
  });

  test("never-convert from the transaction log", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("CO2 ");
    await page.keyboard.press("Backspace");
    await page.getByRole("button", { name: "Never convert" }).click();
    await editor.press("End");
    await page.keyboard.type(" CO2 ");
    await expect(editor).toHaveValue("CO2 CO2 ");
  });
});
