/**
 * Elemental molecular formulas as a family, generated from ELEMENTAL_FORMS
 * (spec V2 §52A). A lone element with a count is usually an identifier; these
 * known elemental molecules are chemistry on their own.
 */
import { describe, expect, it } from "vitest";
import { ELEMENTAL_FORMS } from "@amper/chemistry";
import { LABEL_WORDS, productSettings, SAFE_PUNCTUATION } from "@amper/core";
import { setup } from "./virtual-editor";

const product = productSettings();
const TRIGGERS = [" ", "\n", ...SAFE_PUNCTUATION];
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const rendered = (symbol: string, count: number) => symbol + [...String(count)].map((d) => SUB[Number(d)]).join("");

function convertsEverywhere(input: string, output: string): string[] {
  const failures: string[] = [];
  for (const trigger of TRIGGERS) {
    const { editor } = setup(product);
    editor.type(input + trigger);
    if (editor.text !== output + trigger) failures.push(`${JSON.stringify(input + trigger)} → ${JSON.stringify(editor.text)}`);
    else if (editor.visibleSuggestions) failures.push(`${JSON.stringify(input + trigger)}: needed Tab`);
    editor.press("Backspace");
    if (editor.text !== input) failures.push(`${JSON.stringify(input + trigger)} Backspace → ${JSON.stringify(editor.text)}`);
  }
  return failures;
}

const auto = ELEMENTAL_FORMS.filter((f) => f.standalone === "auto");
const held = ELEMENTAL_FORMS.filter((f) => f.standalone === "suggest");

describe("elemental molecules: table", () => {
  it("covers every common diatomic element plus O₃, S₈ and P₄", () => {
    expect(ELEMENTAL_FORMS.map((f) => `${f.symbol}${f.count}`)).toEqual(["H2", "N2", "O2", "F2", "Cl2", "Br2", "I2", "O3", "S8", "P4"]);
  });

  it("pins the tiers, so the generated suites below cannot silently shrink", () => {
    expect(auto.map((f) => `${f.symbol}${f.count}`)).toEqual(["H2", "N2", "O2", "F2", "Cl2", "Br2", "I2", "O3", "S8"]);
    expect(held.map((f) => `${f.symbol}${f.count}`)).toEqual(["P4"]);
    expect(ELEMENTAL_FORMS.filter((f) => !f.lowercase).map((f) => f.symbol + f.count)).toEqual([]);
  });
});

describe("standalone: converts immediately, no Tab, at every boundary", () => {
  it.each(auto.map((f) => [`${f.symbol}${f.count}`, f]))("%s", (_formula, f) => {
    const input = `${f.symbol}${f.count}`;
    expect(convertsEverywhere(input, rendered(f.symbol, f.count))).toEqual([]);
  });

  it.each(auto.filter((f) => f.lowercase).map((f) => [`${f.symbol}${f.count}`.toLowerCase(), f]))("lowercase %s", (input, f) => {
    expect(convertsEverywhere(input, rendered(f.symbol, f.count))).toEqual([]);
  });

  it("n2[Space] → N₂, Backspace → n2 (exact original)", () => {
    const { editor } = setup(product);
    editor.type("n2 ");
    expect(editor.text).toBe("N₂ ");
    editor.press("Backspace");
    expect(editor.text).toBe("n2");
  });

  it("in a blank paragraph after other text", () => {
    expect(setup(product).editor.type("Air is mostly\nN2 and O2.\n").text).toBe("Air is mostly\nN₂ and O₂.\n");
  });

  it("native Undo reverts each in one step", () => {
    for (const f of auto) {
      const input = `${f.symbol}${f.count}`;
      expect(setup(product).editor.type(`${input} `).undo().text, input).toBe(`${input} `);
    }
  });
});

describe("held-back forms are offered standalone and convert in chemistry context", () => {
  it.each(held.map((f) => [`${f.symbol}${f.count}`, f]))("%s", (input, f) => {
    const { editor } = setup(product);
    editor.type(`${input} `);
    expect(editor.text).toBe(`${input} `);
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe(rendered(f.symbol, f.count));
    expect(setup(product).editor.type(`${input} + 5O2 -> P4O10 `).text).toBe(`${rendered(f.symbol, f.count)} + 5O₂ → P₄O₁₀ `);
  });

  it("lowercase h2 converts like the other elemental molecules, and Backspace restores h2", () => {
    const { editor } = setup(product);
    editor.type("h2 ");
    expect(editor.text).toBe("H₂ ");
    editor.press("Backspace");
    expect(editor.text).toBe("h2");
  });

  it("detectable code/markup contexts around h2 stay unchanged", () => {
    for (const text of ["`h2` ", "<h2> ", "h2.title ", "https://example.com/h2 ", "/docs/h2 ", "Room h2 ", "Model H2 "]) {
      expect(setup(product).editor.type(text).text, text).toBe(text);
    }
  });
});

describe("reaction context", () => {
  it.each([
    ["N2 + 3H2 equi 2NH3 ", "N₂ + 3H₂ ⇌ 2NH₃ "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["n2 + 3h2 equi 2nh3 ", "N₂ + 3H₂ ⇌ 2NH₃ "],
    ["H2 + Cl2 -> 2HCl ", "H₂ + Cl₂ → 2HCl "],
    ["H2 + Br2 -> 2HBr ", "H₂ + Br₂ → 2HBr "],
    ["H2 + I2 equi 2HI ", "H₂ + I₂ ⇌ 2HI "],
    ["H2 + F2 -> 2HF ", "H₂ + F₂ → 2HF "],
    ["3O2 equi 2O3 ", "3O₂ ⇌ 2O₃ "],
    ["S8 + 8O2 -> 8SO2 ", "S₈ + 8O₂ → 8SO₂ "],
    ["P4 + 5O2 -> P4O10 ", "P₄ + 5O₂ → P₄O₁₀ "],
  ])("%j → %j", (input, expected) => {
    expect(setup(product).editor.type(input).text).toBe(expected);
  });

  it("every form converts as a product too", () => {
    for (const f of ELEMENTAL_FORMS) {
      const input = `${f.symbol}${f.count}`;
      const expected = rendered(f.symbol, f.count);
      expect(setup(product).editor.type(`H2O2 -> ${input} `).text.endsWith(`${expected} `), input).toBe(true);
    }
  });
});

describe("false-positive protection is not weakened", () => {
  const LABELS = ["Room", "room", "Model", "model", "Version", "Gate", "Seat", "Galaxy", "press", "Press", "priority", "Level", "Type"];

  it("a label word before the token protects every elemental form", () => {
    const changed: string[] = [];
    for (const label of LABELS) {
      expect(LABEL_WORDS.has(label.toLowerCase()), label).toBe(true);
      for (const f of ELEMENTAL_FORMS) {
        const text = `${label} ${f.symbol}${f.count} `;
        const { editor } = setup(product);
        editor.type(text);
        if (editor.text !== text) changed.push(`${text} → ${editor.text}`);
      }
    }
    expect(changed).toEqual([]);
  });

  it.each([
    "Meet me in Room H2. ",
    "The Model H2 is new. ",
    "The B2B segment grew. ",
    "I bought an M2 MacBook. ",
    "The R2 score is 0.91. ",
    "The F1 race is on. ",
    "Use A4 paper. ",
    "Press F2 to rename. ",
    "My Galaxy S8 broke. ",
    "This is a priority P4 bug. ",
    "U2, B12 and K9 stay. ",
    "Sample C60 later. ",
  ])("%j is unchanged", (sentence) => {
    expect(setup(product).editor.type(sentence).text).toBe(sentence);
  });

  it("charges stay ambiguous where they were (O2+, O2-, N3-)", () => {
    for (const ion of ["O2+", "O2-", "N3-", "I3-"]) expect(setup(product).editor.type(`${ion} `).text, ion).toBe(`${ion} `);
  });

  it("other lone elements with counts are still only offered or ignored", () => {
    for (const token of ["Fe2", "U2", "B12", "K9", "C60", "S6", "N3", "H3"]) {
      expect(setup(product).editor.type(`${token} `).text, token).toBe(`${token} `);
    }
  });
});
