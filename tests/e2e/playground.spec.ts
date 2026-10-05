import { expect, test, type Page } from "@playwright/test";

const modKey = process.platform === "darwin" ? "Meta" : "Control";

async function open(page: Page, mode: "standard" | "chemistry" = "standard") {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // The playground now defaults to the product (chemistry-aware) profile; select explicitly either way.
  await page.getByText(mode === "chemistry" ? "Chemistry" : "Standard", { exact: true }).click();
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

test.describe("Phase 2 in a real browser (production build)", () => {
  const cases: [string, string][] = [
    ["Fe3+ ", "Fe³⁺ "],
    ["SO4^2- ", "SO₄²⁻ "],
    ["NH4+ ", "NH₄⁺ "],
    ["[Fe(CN)6]3- ", "[Fe(CN)₆]³⁻ "],
    ["H2O(l) ", "H₂O(l) "],
    ["CO2(g) ", "CO₂(g) "],
    ["CuSO4·5H2O ", "CuSO₄·5H₂O "],
    ["^14C ", "¹⁴C "],
    ["^235U ", "²³⁵U "],
    ["1s2 2s2 2p6 ", "1s² 2s² 2p⁶ "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["N2 + 3H2 <=> 2NH3 ", "N₂ + 3H₂ ⇌ 2NH₃ "],
  ];
  for (const [input, expected] of cases) {
    test(`${input.trim()} → ${expected.trim()}`, async ({ page }) => {
      const editor = await open(page, "chemistry");
      await page.keyboard.type(input);
      await expect(editor).toHaveValue(expected);
    });
  }

  test("Backspace restores a whole-reaction rewrite", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("N2 + 3H2 <=> 2NH3 ");
    await page.keyboard.press("Backspace");
    await expect(editor).toHaveValue("N2 + 3H₂ ⇌ 2NH3");
  });

  test("native Undo reverts a charge conversion and a reaction rewrite one step each", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("SO4^2- ");
    await page.keyboard.press(`${modKey}+z`);
    await expect(editor).toHaveValue("SO4^2- ");
    // Native undo leaves the restored text selected; put the caret at the end explicitly
    // (End does not collapse a textarea selection on macOS).
    await editor.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
    await page.keyboard.type("+ Ba2+ -> BaSO4 ");
    await expect(editor).toHaveValue("SO4^2- + Ba²⁺ → BaSO₄ ");
    await page.keyboard.press(`${modKey}+z`);
    await expect(editor).toHaveValue("SO4^2- + Ba²⁺ → BaSO4 ");
  });

  test("O2+ is offered, not converted; caret syntax converts", async ({ page }) => {
    const editor = await open(page, "chemistry");
    await page.keyboard.type("O2+ ");
    await expect(editor).toHaveValue("O2+ ");
    await expect(suggestionItems(page)).toHaveCount(2);
    await expect(suggestionItems(page).first()).toContainText("O₂⁺");
    await page.keyboard.press("Escape");
    await page.keyboard.type("O2^+ ");
    await expect(editor).toHaveValue("O2+ O₂⁺ ");
  });

  test("Standard Mode offers the whole reaction; Tab applies it", async ({ page }) => {
    const editor = await open(page);
    await page.keyboard.type("2H2 + O2 -> 2H2O ");
    await expect(editor).toHaveValue("2H2 + O2 -> 2H2O ");
    await expect(suggestionItems(page).first()).toContainText("2H₂ + O₂ → 2H₂O");
    await page.keyboard.press("Tab");
    await expect(editor).toHaveValue("2H₂ + O₂ → 2H₂O ");
  });
});

test.describe("product milestone: chemistry-aware by default (no profile selected)", () => {
  async function openDefault(page: Page) {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    const editor = page.locator("#editor");
    await editor.click();
    return editor;
  }

  const cases: [string, string][] = [
    ["H2O ", "H₂O "],
    ["H2SO4 ", "H₂SO₄ "],
    ["Ca(OH)2 ", "Ca(OH)₂ "],
    ["SO4^2- ", "SO₄²⁻ "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["Capital Sigma ", "Σ "],
    ["CAPITAL DELTA ", "Δ "],
    ["Lowercase Sigma ", "σ "],
    ["h2so4 ", "H₂SO₄ "],
    ["nacl ", "NaCl "],
    ["c6h12o6 ", "C₆H₁₂O₆ "],
    ["H2O, then ", "H₂O, then "],
  ];
  for (const [input, expected] of cases) {
    test(`${input.trim()} → ${expected.trim()} without Tab`, async ({ page }) => {
      const editor = await openDefault(page);
      await page.keyboard.type(input);
      await expect(editor).toHaveValue(expected);
      await expect(suggestionItems(page)).toHaveCount(0);
    });
  }

  test("h2so4: Backspace restores exactly what was typed; Undo is one step", async ({ page }) => {
    const editor = await openDefault(page);
    await page.keyboard.type("h2so4 ");
    await page.keyboard.press("Backspace");
    await expect(editor).toHaveValue("h2so4");
    await page.keyboard.type(" ");
    await expect(editor).toHaveValue("h2so4 ");
    await editor.evaluate((el: HTMLTextAreaElement) => {
      el.value = "";
    });
    await editor.click();
    await page.keyboard.type("fecl3 ");
    await expect(editor).toHaveValue("FeCl₃ ");
    await page.keyboard.press(`${modKey}+z`);
    await expect(editor).toHaveValue("fecl3 ");
  });

  test("protections hold by default", async ({ page }) => {
    const editor = await openDefault(page);
    const text = "I bought an M2 MacBook in Room H2 for B2B and usb3 work. ";
    await page.keyboard.type(text);
    await expect(editor).toHaveValue(text);
  });
});
