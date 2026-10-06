import { describe, expect, it } from "vitest";
import { createEngine, resolveSettings, type AmperMode } from "@amper/core";
import { setup } from "../integration/virtual-editor";
import { ALL_FORMULAS, FORMULA_CORPUS, SINGLE_ELEMENT_SUGGESTED } from "./formulas";
import { NEGATIVE_TOKENS, NO_CONVERSION_SENTENCES, SUPERSEDED_GREEK_PROSE } from "./negative";

const SUB = "₀₁₂₃₄₅₆₇₈₉";

/**
 * Independent test oracle: for inputs already known to be valid formulas,
 * subscript every digit run that follows a letter or closing bracket. Fine as
 * an oracle for curated valid input; exactly what the product must NOT do on
 * arbitrary text (spec §78).
 */
function oracle(formula: string): string {
  return formula.replace(/(?<=[A-Za-z)\]])\d+/g, (digits) => [...digits].map((d) => SUB[Number(d)]).join(""));
}

const engine = createEngine();
const evaluate = (text: string, mode: AmperMode) =>
  engine.evaluate({ textBefore: text, trigger: "space" }, resolveSettings({ mode }));

describe("positive formula corpus", () => {
  it("has hundreds of entries", () => {
    expect(ALL_FORMULAS.length).toBeGreaterThanOrEqual(300);
  });

  for (const [category, formulas] of Object.entries(FORMULA_CORPUS)) {
    it(`converts every ${category} formula in Chemistry Mode`, () => {
      const failures: string[] = [];
      for (const formula of formulas) {
        const decision = evaluate(formula, "chemistry");
        const expected = oracle(formula);
        // Digit-free formulas (ZnS, HCOOH) have nothing to subscript: correct outcome is a no-op.
        const got =
          decision.action === "autocorrect" ? decision.recognition.replacement : expected === formula && decision.action === "none" ? formula : `(${decision.action})`;
        if (got !== expected) failures.push(`${formula} → ${got}`);
      }
      expect(failures).toEqual([]);
    });
  }

  it("suggests (does not convert) single-element species without a coefficient", () => {
    for (const formula of SINGLE_ELEMENT_SUGGESTED) {
      const decision = evaluate(formula, "chemistry");
      expect(decision.action, formula).toBe("suggest");
      if (decision.action === "suggest") expect(decision.suggestions[0]!.replacement).toBe(oracle(formula));
    }
  });

  it("never autocorrects a formula in Standard Mode, but suggests multi-element ones", () => {
    for (const formula of ALL_FORMULAS) {
      const decision = evaluate(formula, "standard");
      expect(decision.action, formula).not.toBe("autocorrect");
    }
    expect(evaluate("H2SO4", "standard").action).toBe("suggest");
  });

  it("converts formulas typed in a sentence end-to-end", () => {
    const { editor } = setup({ mode: "chemistry" });
    editor.type("Titrate KHC8H4O4 against NaOH; then add (NH4)2SO4.\n");
    expect(editor.text).toBe("Titrate KHC₈H₄O₄ against NaOH; then add (NH₄)₂SO₄.\n");
  });
});

describe("negative corpus", () => {
  for (const mode of ["standard", "chemistry"] as const) {
    it(`never autocorrects any negative token in ${mode} mode`, () => {
      const changed: string[] = [];
      for (const token of NEGATIVE_TOKENS) {
        const { editor } = setup({ mode });
        editor.type(`${token} `);
        if (editor.text !== `${token} `) changed.push(`${token} → ${editor.text}`);
      }
      expect(changed).toEqual([]);
    });

    it(`leaves every no-conversion sentence byte-identical in ${mode} mode`, () => {
      for (const sentence of NO_CONVERSION_SENTENCES) {
        const { editor } = setup({ mode });
        editor.type(`${sentence}\n`);
        expect(editor.text, sentence).toBe(`${sentence}\n`);
      }
    });
  }

  it("does not even suggest for identifier-like tokens in Standard Mode", () => {
    const suggested: string[] = [];
    for (const token of NEGATIVE_TOKENS) {
      const decision = evaluate(token, "standard");
      if (decision.action !== "none") suggested.push(token);
    }
    expect(suggested).toEqual([]);
  });
});

describe("superseded no-conversion examples (spec V2 §9.1 over V1/V2 §68)", () => {
  it.each(SUPERSEDED_GREEK_PROSE)("%j now converts to %j", (input, expected) => {
    const { editor } = setup({ mode: "chemistry" });
    editor.type(`${input}\n`);
    expect(editor.text).toBe(`${expected}\n`);
  });
});
