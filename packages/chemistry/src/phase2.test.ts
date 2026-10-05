import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { formulaToAscii, formulaToUnicode } from "@chemly/renderer";
import { cloneFormula, type FormulaNode } from "./formulas/ast";
import { interpretCharge } from "./formulas/charges";
import { parseFormula } from "./formulas/parser";
import { parseConfigToken } from "./electron-config";
import { parseArrowToken, parseElectronToken, parseReactionSuffix, type TextToken } from "./reactions";

function node(input: string): FormulaNode {
  const result = parseFormula(input);
  if (!result.ok) throw new Error(`${input}: ${result.error.message}`);
  return result.value;
}

/** Best reading's Unicode rendering. */
const best = (input: string) => formulaToUnicode(interpretCharge(node(input))?.readings[0]?.node ?? node(input));

describe("charges: AST records notation, never guesses", () => {
  it("caret charges are explicit", () => {
    expect(node("SO4^2-").charge).toEqual({ magnitude: 2, sign: "-", notation: "caret" });
    expect(node("O2^+").charge).toEqual({ magnitude: 1, sign: "+", notation: "caret" });
    expect(node("Fe^3+").components[0]).toMatchObject({ symbol: "Fe" });
  });

  it("implicit charges keep trailing digits as a count in the AST", () => {
    const fe = node("Fe3+");
    expect(fe.components[0]).toMatchObject({ symbol: "Fe", count: 3 });
    expect(fe.charge).toEqual({ magnitude: 1, sign: "+", notation: "implicit" });
  });

  it("rendered charges round-trip", () => {
    expect(node("Fe³⁺").charge).toEqual({ magnitude: 3, sign: "+", notation: "rendered" });
    expect(node("SO₄²⁻").charge).toMatchObject({ magnitude: 2, sign: "-" });
    expect(node("Na⁺").charge).toMatchObject({ magnitude: 1, sign: "+" });
  });

  it.each([
    ["Fe3+", "Fe³⁺"],
    ["Ca2+", "Ca²⁺"],
    ["Al3+", "Al³⁺"],
    ["S2-", "S²⁻"],
    ["Na+", "Na⁺"],
    ["Cl-", "Cl⁻"],
    ["NH4+", "NH₄⁺"],
    ["NO3-", "NO₃⁻"],
    ["H3O+", "H₃O⁺"],
    ["OH-", "OH⁻"],
    ["[Fe(CN)6]3-", "[Fe(CN)₆]³⁻"],
    ["[Cu(NH3)4]2+", "[Cu(NH₃)₄]²⁺"],
    ["SO4^2-", "SO₄²⁻"],
    ["Hg2^2+", "Hg₂²⁺"],
  ])("best reading of %s is %s", (input, expected) => {
    expect(best(input)).toBe(expected);
  });

  it("classifies certainty", () => {
    const certainty = (s: string) => interpretCharge(node(s))?.certainty;
    expect(certainty("SO4^2-")).toBe("certain");
    expect(certainty("Fe3+")).toBe("likely");
    expect(certainty("NH4+")).toBe("likely");
    expect(certainty("[Fe(CN)6]3-")).toBe("likely");
    for (const ambiguous of ["O2+", "O2-", "N3-", "I3-", "H2+", "SO42-", "Fe(OH)2+", "B+", "C-", "O+"]) {
      expect(certainty(ambiguous), ambiguous).toBe("ambiguous");
    }
  });

  it("orders readings by plausibility for the O2± family", () => {
    const readings = (s: string) => interpretCharge(node(s))!.readings.map((r) => formulaToUnicode(r.node));
    expect(readings("O2+")).toEqual(["O₂⁺", "O²⁺"]); // dioxygenyl first: O²⁺ is not a common ion
    expect(readings("O2-")).toEqual(["O²⁻", "O₂⁻"]); // oxide and superoxide are both real
    expect(readings("I3-")).toEqual(["I₃⁻", "I³⁻"]);
    expect(readings("SO42-")).toEqual(["SO₄²⁻", "SO₄₂⁻"]);
  });

  it("rejects malformed charges", () => {
    for (const bad of ["C++", "Fe^3", "Fe^", "Fe3+-", "Na^12+", "^2-", "Fe³+", "Fe+3"]) {
      expect(parseFormula(bad).ok, bad).toBe(false);
    }
  });
});

describe("states (spec §15)", () => {
  it.each([
    ["H2O(l)", "H₂O(l)"],
    ["CO2(g)", "CO₂(g)"],
    ["NaCl(aq)", "NaCl(aq)"],
    ["CaCO3(s)", "CaCO₃(s)"],
    ["Fe3+(aq)", "Fe³⁺(aq)"],
    ["SO4^2-(aq)", "SO₄²⁻(aq)"],
  ])("%s → %s", (input, expected) => {
    expect(best(input)).toBe(expected);
  });

  it("only allows a state at the end and only s, l, g, aq", () => {
    for (const bad of ["H2O(l)2", "H2O(x)", "(aq)", "H2O(aq)(s)", "H2O(L)"]) expect(parseFormula(bad).ok, bad).toBe(false);
    expect(node("Ca(S)").components[1]).toMatchObject({ type: "group" }); // uppercase S is sulfur, not solid
  });
});

describe("hydrates and adducts (spec §16)", () => {
  it.each([
    ["CuSO4·5H2O", "CuSO₄·5H₂O"],
    ["CoCl2·6H2O", "CoCl₂·6H₂O"],
    ["CuSO4*5H2O", "CuSO₄·5H₂O"],
    ["CuSO4•5H2O", "CuSO₄·5H₂O"],
    ["Na2CO3·10H2O", "Na₂CO₃·10H₂O"],
    ["CaSO4·2H2O", "CaSO₄·2H₂O"],
    ["BF3·NH3", "BF₃·NH₃"],
  ])("%s → %s", (input, expected) => {
    expect(best(input)).toBe(expected);
  });

  it("never reads a period as a hydrate dot", () => {
    expect(parseFormula("CuSO4.5H2O").ok).toBe(false);
  });

  it("rejects dangling dots", () => {
    for (const bad of ["CuSO4·", "·5H2O", "CuSO4··5H2O"]) expect(parseFormula(bad).ok, bad).toBe(false);
  });
});

describe("isotopes (spec §17)", () => {
  it.each([
    ["^14C", "¹⁴C"],
    ["^13C", "¹³C"],
    ["^2H", "²H"],
    ["^3H", "³H"],
    ["^235U", "²³⁵U"],
    ["^13CO2", "¹³CO₂"],
    ["^18O2", "¹⁸O₂"],
    ["2^14C", "2¹⁴C"],
  ])("%s → %s", (input, expected) => {
    expect(best(input)).toBe(expected);
  });

  it("records the mass number on the element", () => {
    expect(node("^235U").components[0]).toMatchObject({ symbol: "U", massNumber: 235 });
    expect(node("¹⁴C").components[0]).toMatchObject({ symbol: "C", massNumber: 14 });
  });

  it("validates mass numbers against atomic numbers", () => {
    expect(parseFormula("^2C").ok).toBe(false); // carbon has Z = 6
    expect(parseFormula("^400U").ok).toBe(false);
    expect(parseFormula("^0C").ok).toBe(false);
  });

  it("leaves prose-style mass numbers alone: 14C is a coefficient and renders unchanged", () => {
    expect(formulaToUnicode(node("14C"))).toBe("14C");
  });
});

describe("normalisation round-trip", () => {
  it.each(["SO4^2-", "Fe^3+", "^14CO2", "CuSO4·5H2O", "H2O(l)", "[Fe(CN)6]^3-"])("%s → ascii → unicode is stable", (input) => {
    const unicode = formulaToUnicode(node(input));
    expect(formulaToAscii(node(unicode))).toBe(formulaToAscii(node(input)));
    expect(formulaToUnicode(node(formulaToAscii(node(unicode))))).toBe(unicode);
  });
});

describe("cloneFormula", () => {
  it("deep-copies every field", () => {
    for (const input of ["2^13CH4", "[Fe(CN)6]^3-(aq)", "CuSO4·5H2O(s)", "Fe3+"]) {
      const original = node(input);
      const copy = cloneFormula(original);
      expect(copy).toEqual(original);
      expect(copy).not.toBe(original);
      expect(copy.components[0]).not.toBe(original.components[0]);
    }
  });

  it("does not let reading construction mutate the parsed AST", () => {
    const original = node("Fe3+");
    interpretCharge(original);
    expect(original.components[0]).toMatchObject({ count: 3 });
  });
});

describe("electron configurations (spec §19)", () => {
  it.each(["1s2", "2s2", "2p6", "3d10", "4f14", "4s1", "[Ne]", "[Ar]", "2p⁶"])("accepts %s", (t) => {
    expect(parseConfigToken(t)).toBeDefined();
  });

  it.each(["1p2", "2d6", "1s3", "2p7", "3d11", "4f15", "8s2", "1s0", "1s", "[Na]", "s2", "1S2", "1s02"])("rejects %s", (t) => {
    expect(parseConfigToken(t)).toBeUndefined();
  });
});

describe("reactions (spec §21)", () => {
  const tokens = (text: string): TextToken[] => {
    const out: TextToken[] = [];
    for (const m of text.matchAll(/\S+/g)) out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
    return out;
  };
  const kinds = (text: string) => parseReactionSuffix(tokens(text))?.items.map((i) => i.kind);

  it("parses each species independently and preserves separators", () => {
    expect(kinds("2H2 + O2 -> 2H2O")).toEqual(["species", "plus", "species", "arrow", "species"]);
    expect(parseReactionSuffix(tokens("N2 + 3H2 <=> 2NH3"))!.arrowCount).toBe(1);
  });

  it("starts after prose", () => {
    expect(kinds("The reaction is 2H2 + O2 -> 2H2O")).toHaveLength(5);
  });

  it("handles charged species and electrons", () => {
    expect(kinds("Fe3+ + e- -> Fe2+")).toEqual(["species", "plus", "electron", "arrow", "species"]);
    expect(kinds("Na+ + Cl- -> NaCl")).toEqual(["species", "plus", "species", "arrow", "species"]);
  });

  it("accepts spaced coefficients", () => {
    const parsed = parseReactionSuffix(tokens("2 H2 + O2 -> 2 H2O"))!;
    expect(parsed.items).toHaveLength(5);
    expect(parsed.items[0]).toMatchObject({ kind: "species", node: { coefficient: 2 } });
  });

  it("supports multi-step chains", () => {
    expect(parseReactionSuffix(tokens("A B C2H4 -> C2H6 -> CO2"))!.arrowCount).toBe(2);
  });

  it("does not split unspaced equations (a + there could be a charge)", () => {
    expect(parseReactionSuffix(tokens("2H2+O2->2H2O"))).toBeUndefined();
  });

  it("recognises arrows and electrons", () => {
    expect(parseArrowToken("<=>")).toEqual({ kind: "equilibrium", unicode: "⇌" });
    expect(parseArrowToken("<->")).toEqual({ kind: "bidirectional", unicode: "⇄" });
    expect(parseArrowToken("=>")).toBeUndefined();
    expect(parseElectronToken("2e-")).toEqual({ coefficient: 2 });
    expect(parseElectronToken("e-mail")).toBeUndefined();
  });
});

describe("Phase 2 parser properties", () => {
  it("never throws on chemistry-shaped noise", () => {
    const piece = fc.constantFrom("H", "Fe", "O", "(", ")", "[", "]", "2", "12", "^", "+", "-", "·", "*", "(aq)", "(s)", "⁺", "²", "₂", "e");
    fc.assert(fc.property(fc.array(piece, { maxLength: 24 }), (pieces) => {
      const result = parseFormula(pieces.join(""));
      if (result.ok) interpretCharge(result.value);
    }), { numRuns: 3000 });
  });

  it("every reading of a parsed implicit charge renders and re-parses", () => {
    const species = fc.constantFrom("Fe3+", "O2-", "SO42-", "Fe(OH)2+", "NH4+", "[Fe(CN)6]4-", "Cu2+(aq)", "N3-");
    fc.assert(fc.property(species, (s) => {
      for (const reading of interpretCharge(node(s))!.readings) {
        expect(parseFormula(formulaToUnicode(reading.node)).ok).toBe(true);
      }
    }));
  });
});
