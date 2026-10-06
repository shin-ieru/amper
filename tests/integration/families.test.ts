/**
 * Rule-family completeness (spec V2 §52A). Every suite here is generated from
 * the same canonical tables the product uses, so adding a letter, alias or
 * trigger is automatically tested, and a bug in one member cannot hide behind
 * a single passing example.
 */
import { describe, expect, it } from "vitest";
import { ARROW_DEFINITIONS, arrowGlyph } from "@amper/chemistry";
import { productSettings, SAFE_PUNCTUATION, type AmperSettingsInput } from "@amper/core";
import { GREEK_LETTERS, GREEK_VARIANTS } from "@amper/rules";
import { setup } from "./virtual-editor";

const TRIGGERS = [" ", "\n", ...SAFE_PUNCTUATION] as const;
const product = productSettings();
const cp = (s: string) => Array.from(s).map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
const caseVariants = (phrase: string) => [
  phrase,
  phrase.replace(/\b\w/g, (c) => c.toUpperCase()),
  phrase.toUpperCase(),
];

/** Types `input + trigger`, expects `output + trigger`, then Backspace → exactly `input`. Returns failures. */
function check(input: string, output: string, settings: AmperSettingsInput = product): string[] {
  const failures: string[] = [];
  for (const trigger of TRIGGERS) {
    const { editor } = setup(settings);
    editor.type(input + trigger);
    if (editor.text !== output + trigger) {
      failures.push(`${JSON.stringify(input + trigger)} → ${JSON.stringify(editor.text)} (want ${JSON.stringify(output + trigger)})`);
      continue;
    }
    if (editor.visibleSuggestions) failures.push(`${JSON.stringify(input + trigger)}: converted but also left a suggestion open`);
    editor.press("Backspace");
    if (editor.text !== input) failures.push(`${JSON.stringify(input + trigger)} Backspace → ${JSON.stringify(editor.text)} (want ${JSON.stringify(input)})`);
  }
  return failures;
}

describe("Greek family: all 24 letters × every form × every trigger (spec V2 §9.6)", () => {
  it("covers exactly the 24 letters", () => {
    expect(GREEK_LETTERS).toHaveLength(24);
  });

  it.each(GREEK_LETTERS.map((l) => [l.name, l]))("%s", (_name, { name, lower, upper }) => {
    const failures: string[] = [];
    // Bare names: case-insensitive, always the lowercase letter.
    for (const form of caseVariants(name)) failures.push(...check(form, lower));
    // Explicit commands: one atomic phrase, never "capital σ".
    for (const qualifier of ["capital", "uppercase", "upper case"]) {
      for (const form of caseVariants(`${qualifier} ${name}`)) failures.push(...check(form, upper));
    }
    for (const qualifier of ["lowercase", "lower case", "small"]) {
      for (const form of caseVariants(`${qualifier} ${name}`)) failures.push(...check(form, lower));
    }
    expect(failures).toEqual([]);
  });

  it("explicit phrases win over the bare name inside a sentence, for every letter", () => {
    const failures: string[] = [];
    for (const { name, upper } of GREEK_LETTERS) {
      const { editor } = setup(product);
      editor.type(`The Capital ${name} bond `);
      if (editor.text !== `The ${upper} bond `) failures.push(`${name}: ${editor.text}`);
    }
    expect(failures).toEqual([]);
  });

  it("variant glyphs only on explicit request", () => {
    const failures: string[] = [];
    for (const { phrase, char } of GREEK_VARIANTS) {
      for (const form of caseVariants(phrase)) failures.push(...check(form, char));
    }
    expect(failures).toEqual([]);
    // Canonical defaults stay canonical.
    expect(setup(product).editor.type("epsilon theta phi ").text).toBe("ε θ φ ");
  });

  it("native Undo reverts a Greek conversion in one step", () => {
    for (const phrase of ["sigma", "capital sigma", "small theta"]) {
      const { editor } = setup(product);
      editor.type(`${phrase} `).undo();
      expect(editor.text, phrase).toBe(`${phrase} `);
    }
  });
});

describe("Arrow family: every shorthand and alias from the canonical table (spec V2 §20)", () => {
  it("defines the four arrows by exact code point", () => {
    expect(ARROW_DEFINITIONS.map((d) => [d.kind, cp(arrowGlyph(d))])).toEqual([
      ["forward", "U+2192"],
      ["backward", "U+2190"],
      ["bidirectional", "U+21C4"],
      ["equilibrium", "U+21CC"],
    ]);
  });

  it.each(ARROW_DEFINITIONS.map((d) => [d.kind, d]))("%s: every natural-language alias × case × trigger", (_kind, d) => {
    const glyph = arrowGlyph(d);
    const failures: string[] = [];
    for (const phrase of d.phrases) for (const form of caseVariants(phrase)) failures.push(...check(form, glyph));
    expect(failures).toEqual([]);
  });

  it.each(ARROW_DEFINITIONS.map((d) => [d.kind, d]))("%s: shorthand after a species, alone, and inside a reaction", (_kind, d) => {
    const glyph = arrowGlyph(d);
    for (const shorthand of d.shorthand) {
      const after = setup(product).editor.type(`H2O ${shorthand} `).text;
      expect(cp(after.slice(4, -1)), `H2O ${shorthand}`).toBe(cp(glyph));

      const reaction = setup(product).editor.type(`N2 + 3H2 ${shorthand} 2NH3 `).text;
      expect(reaction, shorthand).toBe(`N₂ + 3H₂ ${glyph} 2NH₃ `);

      // With nothing chemical before it, the arrow is offered (still the exact glyph), not applied.
      const { editor } = setup(product);
      editor.type(`x ${shorthand} `);
      expect(editor.text).toBe(`x ${shorthand} `);
      expect(cp(editor.visibleSuggestions?.items[0]?.replacement ?? "")).toBe(cp(glyph));
    }
  });

  it("shorthand and aliases never diverge", () => {
    for (const d of ARROW_DEFINITIONS) {
      const viaPhrase = setup(product).editor.type(`${d.phrases[0]} `).text.trim();
      const viaShorthand = setup(product).editor.type(`H2O ${d.shorthand[0]} `).text.split(" ")[1]!;
      expect(cp(viaPhrase), d.kind).toBe(cp(viaShorthand));
    }
  });

  it("equilibrium and bidirectional stay distinct, and look-alikes never appear", () => {
    const text = setup(product).editor.type("equilibrium arrow bidirectional arrow H2O <=> H2O <-> H2O ").text;
    expect(text).toBe("⇌ ⇄ H₂O ⇌ H₂O ⇄ H₂O ");
    expect(text).not.toMatch(/[⇔↔⇋]/u);
  });

  it("Backspace restores shorthand and alias exactly", () => {
    expect(setup(product).editor.type("H2O <=> ").press("Backspace").text).toBe("H₂O <=>");
    expect(setup(product).editor.type("Equilibrium Arrow ").press("Backspace").text).toBe("Equilibrium Arrow");
  });
});

describe("Trigger family: every boundary × every rule family (spec V2 §6)", () => {
  const families: [string, string, string][] = [
    ["Greek, bare", "omega", "ω"],
    ["Greek, explicit", "CAPITAL OMEGA", "Ω"],
    ["symbol phrase", "plus minus", "±"],
    ["formula", "H2SO4", "H₂SO₄"],
    ["case-recovered formula", "fecl3", "FeCl₃"],
    ["caret charge", "SO4^2-", "SO₄²⁻"],
    ["implicit charge", "Fe3+", "Fe³⁺"],
    ["isotope", "^235U", "²³⁵U"],
    ["state", "CO2(g)", "CO₂(g)"],
    ["hydrate", "CuSO4*5H2O", "CuSO₄·5H₂O"],
    ["reaction", "2H2 + O2 -> 2H2O", "2H₂ + O₂ → 2H₂O"],
    ["electron configuration", "1s2 2s2", "1s² 2s²"],
    ["arrow phrase", "equilibrium arrow", "⇌"],
  ];

  it.each(families)("%s", (_family, input, output) => {
    // Inputs with spaces convert progressively; check the final step's restore separately.
    if (input.includes(" ")) {
      const failures: string[] = [];
      for (const trigger of TRIGGERS) {
        const { editor } = setup(product);
        editor.type(input + trigger);
        if (editor.text !== output + trigger) failures.push(`${JSON.stringify(input + trigger)} → ${JSON.stringify(editor.text)}`);
      }
      expect(failures).toEqual([]);
    } else {
      expect(check(input, output)).toEqual([]);
    }
  });

  it("the period is never a trigger, for any family", () => {
    for (const [, input] of families) {
      const { editor } = setup(product);
      editor.type(`${input}.`);
      expect(editor.text.endsWith(`${input.split(" ").at(-1)}.`), input).toBe(true);
    }
  });
});

describe("State-label family: (s), (l), (g), (aq) (spec V2 §15)", () => {
  const STATES = ["s", "l", "g", "aq"];
  const BASES: [string, string][] = [
    ["H2O", "H₂O"],
    ["NaCl", "NaCl"],
    ["Fe3+", "Fe³⁺"],
    ["SO4^2-", "SO₄²⁻"],
    ["CuSO4·5H2O", "CuSO₄·5H₂O"],
    ["fecl3", "FeCl₃"],
  ];

  it("product default: text is unchanged baseline characters and the whole label is marked subscript", () => {
    expect(product.stateLabels).toBe("subscript");
    for (const state of STATES) {
      for (const [input, output] of BASES) {
        const { editor } = setup(product);
        editor.type(`${input}(${state}) `);
        expect(editor.text).toBe(`${output}(${state}) `);
        expect(editor.formatted).toEqual([{ text: `(${state})`, style: "subscript" }]);
      }
    }
  });

  it("the baseline preference requests no formatting", () => {
    for (const state of STATES) {
      const { editor } = setup(productSettings({ stateLabels: "baseline" }));
      editor.type(`H2O(${state}) `);
      expect(editor.text).toBe(`H₂O(${state}) `);
      expect(editor.formatted).toEqual([]);
    }
  });

  it("consecutive formulas format each label independently and nothing else", () => {
    const { editor } = setup(product);
    editor.type("H2O(l) NaCl(aq) CO2(g) CaCO3(s) is water. ");
    expect(editor.text).toBe("H₂O(l) NaCl(aq) CO₂(g) CaCO₃(s) is water. ");
    expect(editor.formatted).toEqual([
      { text: "(l)", style: "subscript" },
      { text: "(aq)", style: "subscript" },
      { text: "(g)", style: "subscript" },
      { text: "(s)", style: "subscript" },
    ]);
  });

  it("formats with every trigger", () => {
    for (const state of STATES) {
      for (const trigger of TRIGGERS) {
        const { editor } = setup(product);
        editor.type(`CO2(${state})${trigger}`);
        expect(editor.formatted, JSON.stringify(trigger)).toEqual([{ text: `(${state})`, style: "subscript" }]);
      }
    }
  });

  it("every state label converts with every trigger and restores exactly", () => {
    const failures: string[] = [];
    for (const state of STATES) failures.push(...check(`CO2(${state})`, `CO₂(${state})`));
    expect(failures).toEqual([]);
  });

  it("explicit subscript presentation keeps identical text and asks to format exactly the whole label", () => {
    const subscript = productSettings({ stateLabels: "subscript" });
    for (const state of STATES) {
      for (const [input, output] of BASES) {
        const { editor } = setup(subscript);
        editor.type(`${input}(${state}) `);
        expect(editor.text, `${input}(${state})`).toBe(`${output}(${state}) `);
        expect(editor.formatted, `${input}(${state})`).toEqual([{ text: `(${state})`, style: "subscript" }]);
      }
    }
  });

  it("subscript presentation formats every converted state label inside a reaction", () => {
    const { editor } = setup(productSettings({ stateLabels: "subscript" }));
    editor.type("AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq) ");
    expect(editor.text).toBe("AgNO₃(aq) + NaCl(aq) → AgCl(s) + NaNO₃(aq) ");
    // Each species' label is formatted as it is typed; the last rewrite formats the last one.
    expect(editor.formatted.map((f) => f.text)).toEqual(["(aq)", "(aq)", "(s)", "(aq)"]);
  });

  it("Backspace after a formatted conversion restores the typed text", () => {
    const { editor } = setup(productSettings({ stateLabels: "subscript" }));
    editor.type("H2O(l) ").press("Backspace");
    expect(editor.text).toBe("H2O(l)");
  });

  it("the AST and Unicode text never depend on the presentation", () => {
    for (const state of STATES) {
      const baseline = setup(product).editor.type(`H2O(${state}) `).text;
      const subscript = setup(productSettings({ stateLabels: "subscript" })).editor.type(`H2O(${state}) `).text;
      expect(subscript).toBe(baseline);
    }
  });
});

describe("equi: the primary equilibrium shortcut", () => {
  const EQUILIBRIUM = String.fromCodePoint(0x21cc);

  it("converts case-insensitively at every boundary, restores exactly, and is the exact glyph", () => {
    const failures: string[] = [];
    for (const form of ["equi", "Equi", "EQUI", "eQuI"]) failures.push(...check(form, EQUILIBRIUM));
    expect(failures).toEqual([]);
  });

  it("Equi[Space] → ⇌ then Backspace → Equi", () => {
    const { editor } = setup(product);
    editor.type("Equi ");
    expect(editor.text).toBe(`${EQUILIBRIUM} `);
    expect(editor.text.codePointAt(0)).toBe(0x21cc);
    editor.press("Backspace");
    expect(editor.text).toBe("Equi");
  });

  it("native Undo reverts it in one step", () => {
    expect(setup(product).editor.type("equi ").undo().text).toBe("equi ");
  });

  it("works inside reactions, and matches <=> and equilibrium arrow exactly", () => {
    expect(setup(product).editor.type("N2 + 3H2 equi 2NH3 ").text).toBe(`N₂ + 3H₂ ${EQUILIBRIUM} 2NH₃ `);
    const all = setup(product).editor.type("equi H2O <=> H2O equilibrium arrow ").text;
    expect(all).toBe(`${EQUILIBRIUM} H₂O ${EQUILIBRIUM} H₂O ${EQUILIBRIUM} `);
  });

  it("stays distinct from <-> (⇄)", () => {
    expect(setup(product).editor.type("equi H2O <-> H2O ").text).toBe(`${EQUILIBRIUM} H₂O ⇄ H₂O `);
  });

  it("never converts words that merely begin with equi, at any boundary", () => {
    const words = ["equilibrium", "Equilibrium", "equilateral", "equipment", "equip", "equine", "equity", "equivalent", "equinox", "equidistant", "Equinor", "equi-molar", "equimolar", "unequi"];
    const changed: string[] = [];
    for (const word of words) {
      for (const trigger of TRIGGERS) {
        const { editor } = setup(product);
        editor.type(word + trigger);
        if (editor.text !== word + trigger) changed.push(`${JSON.stringify(word + trigger)} → ${JSON.stringify(editor.text)}`);
      }
    }
    expect(changed).toEqual([]);
  });

  it("is not converted before a boundary, nor by a period", () => {
    expect(setup(product).editor.type("equi").text).toBe("equi");
    expect(setup(product).editor.type("equi.").text).toBe("equi.");
  });
});
