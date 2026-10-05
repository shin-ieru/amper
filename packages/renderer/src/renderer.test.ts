import { describe, expect, it } from "vitest";
import { parseFormula } from "@chemly/chemistry";
import { formulaToAscii, formulaToUnicode, toSubscriptDigits, toSuperscriptDigits } from "./index";

function render(input: string) {
  const parsed = parseFormula(input);
  if (!parsed.ok) throw new Error(`failed to parse ${input}: ${parsed.error.message}`);
  return { unicode: formulaToUnicode(parsed.value), ascii: formulaToAscii(parsed.value) };
}

describe("digit helpers", () => {
  it("maps every digit", () => {
    expect(toSubscriptDigits(1234567890)).toBe("₁₂₃₄₅₆₇₈₉₀");
    expect(toSuperscriptDigits(1234567890)).toBe("¹²³⁴⁵⁶⁷⁸⁹⁰");
  });
});

describe("formulaToUnicode", () => {
  it.each([
    ["H2O", "H₂O"],
    ["C6H12O6", "C₆H₁₂O₆"],
    ["Ca(OH)2", "Ca(OH)₂"],
    ["(NH4)2SO4", "(NH₄)₂SO₄"],
    ["K4[Fe(CN)6]", "K₄[Fe(CN)₆]"],
    ["2H2O", "2H₂O"],
    ["12CO2", "12CO₂"],
  ])("%s → %s", (input, expected) => {
    expect(render(input).unicode).toBe(expected);
  });

  it("keeps the coefficient full-size", () => {
    expect(render("3Ca(OH)2").unicode).toBe("3Ca(OH)₂");
  });

  it("renders reserved charge/state fields when present", () => {
    expect(
      formulaToUnicode({
        type: "formula",
        components: [{ type: "element", symbol: "Fe", span: { start: 0, end: 2 } }],
        charge: { magnitude: 3, sign: "+" },
      }),
    ).toBe("Fe³⁺");
  });
});

describe("formulaToAscii", () => {
  it("normalises rendered Unicode back to typed form", () => {
    expect(render("H₂SO₄").ascii).toBe("H2SO4");
    expect(render("Al₂(SO₄)₃").ascii).toBe("Al2(SO4)3");
  });
});
