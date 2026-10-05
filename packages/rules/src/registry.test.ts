import { describe, expect, it } from "vitest";
import { GREEK_LETTERS } from "./greek";
import { compileCustomRules, createDefaultRegistry, defaultRules, normalizePhrase } from "./registry";

const registry = createDefaultRegistry();
const replacementFor = (phrase: string) => registry.lookup(phrase).map((r) => r.replacement);

describe("rule data integrity", () => {
  it("has unique rule ids", () => {
    const ids = defaultRules().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never maps one phrase to two different auto replacements", () => {
    for (const entry of registry.entries) {
      const autos = new Set(registry.lookup(entry.phrase).filter((r) => r.mode === "auto").map((r) => r.replacement));
      expect(autos.size, entry.phrase).toBeLessThanOrEqual(1);
    }
  });

  it("uses Greek code points for all 48 letters, never Latin look-alikes", () => {
    expect(GREEK_LETTERS).toHaveLength(24);
    for (const { lower, upper } of GREEK_LETTERS) {
      for (const ch of [lower, upper]) {
        const cp = ch.codePointAt(0)!;
        expect(cp >= 0x0391 && cp <= 0x03c9, `${ch} U+${cp.toString(16)}`).toBe(true);
      }
    }
  });
});

describe("Greek lookup (spec §9)", () => {
  it.each(GREEK_LETTERS.map((l) => [l.name, l.lower, l.upper]))("%s → %s / %s", (name, lower, upper) => {
    for (const q of ["capital", "uppercase", "upper case"]) expect(replacementFor(`${q} ${name}`)).toEqual([upper]);
    for (const q of ["lowercase", "lower case"]) expect(replacementFor(`${q} ${name}`)).toEqual([lower]);
  });

  it("matches case-insensitively and with irregular spacing", () => {
    expect(replacementFor("CAPITAL  Sigma")).toEqual(["Σ"]);
  });

  it("maps explicit variants only", () => {
    expect(replacementFor("variant phi")).toEqual(["ϕ"]);
    expect(replacementFor("final sigma")).toEqual(["ς"]);
    expect(replacementFor("phi")).toEqual(["φ"]);
  });

  it("keeps bare names and prose-like qualifiers as suggestions", () => {
    expect(registry.lookup("sigma")[0]).toMatchObject({ mode: "suggest", confidence: 0.75 });
    expect(registry.lookup("small delta")[0]).toMatchObject({ mode: "suggest" });
  });
});

describe("symbol lookup (spec §10, §11, §20)", () => {
  it.each([
    ["plus minus", "±"],
    ["minus plus", "∓"],
    ["approximately equal", "≈"],
    ["not equals", "≠"],
    ["less than or equal to", "≤"],
    ["greater than or equal", "≥"],
    ["proportional to", "∝"],
    ["infinity symbol", "∞"],
    ["therefore symbol", "∴"],
    ["because symbol", "∵"],
    ["degree symbol", "°"],
    ["angstrom", "Å"],
    ["nabla", "∇"],
    ["partial derivative", "∂"],
    ["middle dot", "·"],
    ["center dot", "·"],
    ["multiplication sign", "×"],
    ["square root symbol", "√"],
    ["integral symbol", "∫"],
    ["summation symbol", "∑"],
    ["product symbol", "∏"],
    ["reaction arrow", "→"],
    ["forward reaction arrow", "→"],
    ["backward arrow", "←"],
    ["equilibrium arrow", "⇌"],
    ["subscript 0", "₀"],
    ["subscript 9", "₉"],
    ["superscript 2", "²"],
    ["superscript plus", "⁺"],
    ["superscript minus", "⁻"],
  ])("%s → %s", (phrase, symbol) => {
    expect(replacementFor(phrase)).toEqual([symbol]);
  });

  it("knows which phrases can still grow", () => {
    expect(registry.canGrow("not equal")).toBe(true);
    expect(registry.canGrow("not equals")).toBe(false);
    expect(registry.canGrow("capital sigma")).toBe(false);
  });

  it("does not register prose words on their own", () => {
    for (const word of ["degree", "times", "product", "union", "integral", "arrow", "right arrow"]) {
      expect(registry.lookup(word), word).toEqual([]);
    }
  });
});

describe("custom rules (spec §30)", () => {
  const base = { caseSensitive: false, triggerMode: "automatic" as const, enabled: true };

  it("compiles enabled rules with top priority", () => {
    const [rule] = compileCustomRules([{ id: "1", input: "my catalyst", output: "Pt/C", ...base }]);
    expect(rule).toMatchObject({ id: "custom.1", category: "custom", priority: 1, mode: "auto", replacement: "Pt/C" });
  });

  it("drops disabled, empty and identity rules", () => {
    expect(
      compileCustomRules([
        { id: "a", input: "x", output: "y", ...base, enabled: false },
        { id: "b", input: " ", output: "y", ...base },
        { id: "c", input: "Same", output: "same", ...base },
      ]),
    ).toEqual([]);
  });

  it("honours case sensitivity", () => {
    const reg = createDefaultRegistry().withRules(
      compileCustomRules([{ id: "1", input: "EqA", output: "⇌", ...base, caseSensitive: true }]),
    );
    expect(reg.lookup("EqA").map((r) => r.id)).toEqual(["custom.1"]);
    expect(reg.lookup("eqa")).toEqual([]);
  });

  it("normalises phrases", () => {
    expect(normalizePhrase("  Capital\tSIGMA ")).toBe("capital sigma");
  });
});
