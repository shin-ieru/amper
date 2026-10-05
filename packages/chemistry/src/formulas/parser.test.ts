import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { ELEMENT_SYMBOLS } from "../elements";
import { analyzeFormula } from "./features";
import { parseFormula, MAX_FORMULA_LENGTH } from "./parser";

function parsed(input: string) {
  const result = parseFormula(input);
  if (!result.ok) throw new Error(`${input}: ${result.error.message}`);
  return result.value;
}

describe("element table", () => {
  it("has the 118 IUPAC symbols with no duplicates", () => {
    expect(ELEMENT_SYMBOLS).toHaveLength(118);
    expect(new Set(ELEMENT_SYMBOLS).size).toBe(118);
  });
});

describe("parseFormula: neutral formulas (spec §12.2)", () => {
  it.each([
    "H2O", "CO2", "NH3", "CH4", "H2SO4", "HNO3", "CaCO3", "NaHCO3", "C6H12O6",
    "KMnO4", "K2Cr2O7", "Ca(OH)2", "Al2(SO4)3", "(NH4)2SO4", "CH3CH2OH", "[Cu(NH3)4]",
  ])("parses %s", (input) => {
    expect(parseFormula(input).ok).toBe(true);
  });

  it("builds element and count nodes", () => {
    const node = parsed("H2SO4");
    expect(node.components.map((c) => [c.type === "element" && c.symbol, c.count])).toEqual([
      ["H", 2],
      ["S", undefined],
      ["O", 4],
    ]);
  });

  it("splits by case: Co is cobalt, CO is carbon + oxygen", () => {
    expect(analyzeFormula(parsed("Co")).elementTokens).toEqual(["Co"]);
    expect(analyzeFormula(parsed("CO")).elementTokens).toEqual(["C", "O"]);
  });

  it("parses nested groups", () => {
    const node = parsed("Al2(SO4)3");
    const group = node.components[1];
    expect(group).toMatchObject({ type: "group", bracket: "paren", count: 3 });
    expect(analyzeFormula(node).maxDepth).toBe(1);
    expect(analyzeFormula(parsed("[Cu(NH3)4]")).maxDepth).toBe(2);
  });

  it("keeps a leading coefficient separate from subscripts (spec §12.4)", () => {
    const node = parsed("3Ca(OH)2");
    expect(node.coefficient).toBe(3);
    expect(node.components[0]).toMatchObject({ symbol: "Ca" });
  });

  it("records source spans", () => {
    expect(parsed("Ca(OH)2").components[1]!.span).toEqual({ start: 2, end: 7 });
  });

  it("accepts already-rendered subscripts so re-evaluation is a no-op", () => {
    expect(parsed("H₂SO₄").components[0]!.count).toBe(2);
  });
});

describe("parseFormula: malformed input fails safely", () => {
  it.each([
    ["", "empty input"],
    ["Xy2", "unknown element"],
    ["Hx2", "unknown element"],
    ["h2o", "unexpected character"],
    ["Ca(OH2", "unclosed bracket"],
    ["CaOH)2", "unmatched closing bracket"],
    ["Ca(OH]2", "mismatched brackets"],
    ["()2", "empty group"],
    ["H0", "count cannot be zero"],
    ["H02", "leading zero"],
    ["ISO9001", "too long"],
    ["2", "expected an element"],
    ["₂H", "subscript"],
    ["H2O(l)", "unexpected character"],
    ["C3.ai", "unexpected character"],
    ["((((((H))))))", "nested too deeply"],
  ])("%j → %s", (input, message) => {
    const result = parseFormula(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain(message);
  });

  it("rejects over-long input without lexing it", () => {
    expect(parseFormula("H".repeat(MAX_FORMULA_LENGTH + 1)).ok).toBe(false);
  });
});

describe("analyzeFormula", () => {
  it("flags explicit counts of one and repeated single elements", () => {
    expect(analyzeFormula(parsed("F1")).hasExplicitOne).toBe(true);
    expect(analyzeFormula(parsed("B2B")).singleElementRepeated).toBe(true);
    expect(analyzeFormula(parsed("H2O")).singleElementRepeated).toBe(false);
  });
});

describe("parser properties", () => {
  it("never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 80 }), (input) => {
        parseFormula(input);
      }),
      { numRuns: 2000 },
    );
  });

  it("never throws on formula-shaped noise", () => {
    const piece = fc.constantFrom("H", "He", "C", "Ca", "O", "(", ")", "[", "]", "2", "0", "12", "₂", "x", "+", "-", "^");
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 30 }), (pieces) => {
        parseFormula(pieces.join(""));
      }),
      { numRuns: 2000 },
    );
  });

  it("stays fast on pathological input", () => {
    const started = performance.now();
    for (let i = 0; i < 1000; i++) parseFormula("(".repeat(30) + "H" + ")".repeat(30));
    expect(performance.now() - started).toBeLessThan(500);
  });
});
