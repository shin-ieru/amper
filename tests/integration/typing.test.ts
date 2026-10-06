import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { setup } from "./virtual-editor";

const chemistry = { mode: "chemistry" as const };

describe("milestone 1: conversion while typing", () => {
  it("capital sigma[Space] → Σ", () => {
    const { editor } = setup();
    editor.type("capital sigma ");
    expect(editor.text).toBe("Σ ");
  });

  it("capital delta[Space] → Δ", () => {
    expect(setup().editor.type("capital delta ").text).toBe("Δ ");
  });

  it("H2O → H₂O in Chemistry Mode", () => {
    expect(setup(chemistry).editor.type("H2O ").text).toBe("H₂O ");
  });

  it("Ca(OH)2 → Ca(OH)₂ in Chemistry Mode", () => {
    expect(setup(chemistry).editor.type("Ca(OH)2 ").text).toBe("Ca(OH)₂ ");
  });

  it("M2 MacBook remains unchanged in both modes", () => {
    expect(setup().editor.type("I bought an M2 MacBook. ").text).toBe("I bought an M2 MacBook. ");
    expect(setup(chemistry).editor.type("I bought an M2 MacBook. ").text).toBe("I bought an M2 MacBook. ");
  });

  it("converts mid-sentence and keeps surrounding text", () => {
    const { editor } = setup(chemistry);
    editor.type("Dissolve CaCO3 in HCl, then dry the H2SO4.\n");
    expect(editor.text).toBe("Dissolve CaCO₃ in HCl, then dry the H₂SO₄.\n");
  });

  it("converts on Enter as well as Space", () => {
    expect(setup().editor.type("plus minus\n").text).toBe("±\n");
  });

  it("preserves trailing punctuation", () => {
    expect(setup().editor.type("(capital sigma), ").text).toBe("(Σ), ");
  });

  it("does not convert while the word is still being typed", () => {
    expect(setup().editor.type("capital sigma").text).toBe("capital sigma");
  });
});

describe("immediate Backspace restoration (spec §8)", () => {
  it("restores capital sigma exactly", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("Backspace");
    expect(editor.text).toBe("capital sigma");
    expect(editor.caret).toBe("capital sigma".length);
  });

  it("restores H2SO4 exactly", () => {
    const { editor } = setup(chemistry);
    editor.type("H2SO4 ").press("Backspace");
    expect(editor.text).toBe("H2SO4");
  });

  it("preserves the user's original capitalisation and spacing", () => {
    const { editor } = setup();
    editor.type("Capital  SIGMA ").press("Backspace");
    expect(editor.text).toBe("Capital  SIGMA");
  });

  it("does not re-convert the restored text at the next boundary", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("Backspace").type(" is a letter ");
    expect(editor.text).toBe("capital sigma is a letter ");
  });

  it("a second Backspace behaves normally", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("Backspace").press("Backspace");
    expect(editor.text).toBe("capital sigm");
  });

  it("allows normal editing after restoration, and later conversions still work", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("Backspace").type(" and capital delta ");
    expect(editor.text).toBe("capital sigma and Δ ");
  });

  it("is one-shot: typing after a conversion cancels it", () => {
    const { editor } = setup();
    editor.type("capital sigma x").press("Backspace").press("Backspace");
    expect(editor.text).toBe("Σ");
  });

  it("is cancelled by moving the caret", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("ArrowLeft").press("ArrowRight").press("Backspace");
    expect(editor.text).toBe("Σ");
  });

  it("converts at safe punctuation, and immediate Backspace there restores the phrase", () => {
    // Product milestone: "," is a trigger, so the conversion (and its one-shot restore) happens at the comma.
    const { editor } = setup();
    editor.type("plus minus,");
    expect(editor.text).toBe("±,");
    editor.press("Backspace");
    expect(editor.text).toBe("plus minus");
  });

  it("restores trailing punctuation typed before a Space boundary", () => {
    const { editor } = setup();
    editor.type("capital sigma. ").press("Backspace");
    expect(editor.text).toBe("capital sigma.");
  });

  it("respects the backspaceRestore setting", () => {
    const { editor } = setup({ backspaceRestore: false });
    editor.type("capital sigma ").press("Backspace");
    expect(editor.text).toBe("Σ");
  });

  it("works on hosts that cannot intercept Backspace (post-delete restore)", () => {
    const { editor } = setup(chemistry, { interceptKeys: false });
    editor.type("H2SO4 ").press("Backspace");
    expect(editor.text).toBe("H2SO4");
    editor.type(" ");
    expect(editor.text).toBe("H2SO4 ");
  });

  it("stops autocorrecting an input the user keeps restoring (spec §56)", () => {
    const { editor } = setup();
    editor.type("capital sigma ").press("Backspace").type(" ");
    editor.type("capital sigma ").press("Backspace").type(" ");
    editor.type("capital sigma ");
    expect(editor.text).toBe("capital sigma capital sigma capital sigma ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("Σ");
  });

  it("reversal restores the exact original for arbitrary explicit phrases", () => {
    const phrases = ["capital sigma", "lowercase pi", "plus minus", "equilibrium arrow", "subscript 2", "degree symbol"];
    fc.assert(
      fc.property(
        fc.constantFrom(...phrases),
        fc.array(fc.constantFrom("", " "), { maxLength: 2 }),
        fc.boolean(),
        (phrase, extraSpaces, upper) => {
          const typed = (upper ? phrase.toUpperCase() : phrase).replace(" ", " " + extraSpaces.join(""));
          const { editor } = setup();
          editor.type(`${typed} `);
          expect(editor.text).not.toBe(`${typed} `);
          editor.press("Backspace");
          expect(editor.text).toBe(typed);
        },
      ),
    );
  });
});

describe("native Undo (spec §4.3)", () => {
  it("one Undo reverts the conversion and keeps the typed boundary", () => {
    const { editor } = setup(chemistry);
    editor.type("H2SO4 ").undo();
    expect(editor.text).toBe("H2SO4 ");
  });

  it("Undo cancels the pending one-shot restore", () => {
    const { editor, session } = setup();
    editor.type("capital sigma ");
    expect(session.pendingTransaction).toBeDefined();
    editor.undo();
    expect(session.pendingTransaction).toBeUndefined();
    editor.press("Backspace");
    expect(editor.text).toBe("capital sigma");
  });
});

describe("suggestions and autocomplete (spec §28)", () => {
  it("suggests while typing and Tab accepts", () => {
    const { editor } = setup();
    editor.type("capital sig");
    expect(editor.visibleSuggestions?.items.map((s) => s.replacement)).toEqual(["Σ"]);
    editor.press("Tab");
    expect(editor.text).toBe("Σ");
    expect(editor.visibleSuggestions).toBeUndefined();
  });

  it("Backspace right after accepting restores the typed partial", () => {
    const { editor } = setup();
    editor.type("capital sig").press("Tab").press("Backspace");
    expect(editor.text).toBe("capital sig");
  });

  it("equilib… suggests the equilibrium arrow", () => {
    const { editor } = setup();
    editor.type("equilib");
    expect(editor.visibleSuggestions?.items[0]).toMatchObject({ label: "equilibrium arrow", replacement: "⇌" });
  });

  it("Escape dismisses without changing text, and the key is consumed", () => {
    const { editor } = setup();
    editor.type("capital sig").press("Escape");
    expect(editor.visibleSuggestions).toBeUndefined();
    editor.press("Tab");
    expect(editor.text).toBe("capital sig\t");
  });

  it("arrow keys navigate multiple suggestions", () => {
    const { editor } = setup();
    editor.type("capital p");
    const items = editor.visibleSuggestions!.items;
    expect(items.map((s) => s.label)).toEqual(expect.arrayContaining(["capital pi", "capital phi", "capital psi"]));
    editor.press("ArrowDown");
    expect(editor.visibleSuggestions?.selected).toBe(1);
    editor.press("ArrowUp").press("ArrowUp");
    expect(editor.visibleSuggestions?.selected).toBe(items.length - 1);
    editor.press("ArrowDown").press("ArrowDown").press("Tab");
    expect(editor.text).toBe(items[1]!.replacement);
  });

  it("typing updates and eventually closes the suggestion", () => {
    const { editor } = setup();
    editor.type("equilib");
    expect(editor.visibleSuggestions).toBeDefined();
    editor.type("rium constant");
    expect(editor.visibleSuggestions).toBeUndefined();
  });

  it("caret movement dismisses", () => {
    const { editor } = setup();
    editor.type("capital sig").press("ArrowLeft");
    expect(editor.visibleSuggestions).toBeUndefined();
  });

  it("a bare Greek name is suggested, not converted", () => {
    const { editor } = setup();
    editor.type("The sigma ");
    expect(editor.text).toBe("The sigma ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("σ");
    editor.press("Tab");
    expect(editor.text).toBe("The σ ");
  });

  it("Standard Mode suggests formulas instead of converting them", () => {
    const { editor } = setup();
    editor.type("H2SO4 ");
    expect(editor.text).toBe("H2SO4 ");
    editor.press("Tab");
    expect(editor.text).toBe("H₂SO₄ ");
  });

  it("fuzzy phrases are suggested, never auto-applied", () => {
    const { editor } = setup();
    editor.type("equlibrium arrow ");
    expect(editor.text).toBe("equlibrium arrow ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("⇌");
  });

  it("Tab without a visible suggestion is left to the host", () => {
    const { editor } = setup();
    editor.type("hello").press("Tab");
    expect(editor.text).toBe("hello\t");
  });

  it("respects the autocomplete setting", () => {
    const { editor } = setup({ autocomplete: false });
    editor.type("capital sig");
    expect(editor.visibleSuggestions).toBeUndefined();
  });
});

describe("settings", () => {
  it("disabling Amper stops all conversion", () => {
    expect(setup({ enabled: false }).editor.type("capital sigma ").text).toBe("capital sigma ");
  });

  it("category toggles", () => {
    const { editor } = setup({ categories: { greek: false, symbol: true, formula: true, custom: true } });
    editor.type("capital sigma plus minus ");
    expect(editor.text).toBe("capital sigma ± ");
  });

  it("autoConvert=false turns conversions into suggestions", () => {
    const { editor } = setup({ autoConvert: false });
    editor.type("capital sigma ");
    expect(editor.text).toBe("capital sigma ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("Σ");
  });

  it("never-convert list wins over every rule", () => {
    const { editor } = setup({ mode: "chemistry", neverConvert: ["Capital Sigma", "H2O"] });
    editor.type("capital sigma H2O CO2 ");
    expect(editor.text).toBe("capital sigma H2O CO₂ ");
  });

  it("custom rules apply with top priority", () => {
    const { editor } = setup({
      customRules: [
        { id: "1", input: "my catalyst", output: "Pt/C", caseSensitive: false, triggerMode: "automatic", enabled: true },
        { id: "2", input: "plus minus", output: "+/-", caseSensitive: false, triggerMode: "automatic", enabled: true },
      ],
    });
    editor.type("my catalyst plus minus ");
    expect(editor.text).toBe("Pt/C +/- ");
  });

  it("custom rules cannot chain into each other", () => {
    const { editor } = setup({
      customRules: [
        { id: "a", input: "foo", output: "bar", caseSensitive: false, triggerMode: "automatic", enabled: true },
        { id: "b", input: "bar", output: "foo", caseSensitive: false, triggerMode: "automatic", enabled: true },
      ],
    });
    editor.type("foo ");
    expect(editor.text).toBe("bar ");
  });
});

describe("IME / composition (spec §47)", () => {
  it("does not evaluate composed text until committed, and multi-char commits reset state", () => {
    const { editor } = setup();
    editor.compose("capital sigma ");
    expect(editor.text).toBe("capital sigma ");
  });
});
