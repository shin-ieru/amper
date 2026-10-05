import type { FormulaComponent, FormulaNode } from "@chemly/chemistry";

const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"] as const;
const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"] as const;

export const SUPERSCRIPT_PLUS = "⁺";
export const SUPERSCRIPT_MINUS = "⁻";

export function toSubscriptDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => SUBSCRIPT[Number(d)]!);
}

export function toSuperscriptDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => SUPERSCRIPT[Number(d)]!);
}

const BRACKETS = { paren: ["(", ")"], square: ["[", "]"] } as const;

function renderComponents(components: FormulaComponent[], count: (n: number) => string): string {
  let out = "";
  for (const component of components) {
    if (component.type === "element") {
      out += component.symbol;
    } else {
      const [open, close] = BRACKETS[component.bracket];
      out += open + renderComponents(component.components, count) + close;
    }
    if (component.count !== undefined) out += count(component.count);
  }
  return out;
}

function renderCharge(node: FormulaNode): string {
  if (!node.charge) return "";
  const sign = node.charge.sign === "+" ? SUPERSCRIPT_PLUS : SUPERSCRIPT_MINUS;
  return (node.charge.magnitude === 1 ? "" : toSuperscriptDigits(node.charge.magnitude)) + sign;
}

/** Unicode-first rendering (ADR-002): editable, searchable, portable text. */
export function formulaToUnicode(node: FormulaNode): string {
  const coefficient = node.coefficient === undefined ? "" : String(node.coefficient);
  const state = node.state ? `(${node.state})` : "";
  return coefficient + renderComponents(node.components, toSubscriptDigits) + renderCharge(node) + state;
}

/** Plain ASCII normal form (H₂SO₄ → H2SO4); used for normalisation and round-trip tests. */
export function formulaToAscii(node: FormulaNode): string {
  const coefficient = node.coefficient === undefined ? "" : String(node.coefficient);
  const charge = node.charge ? `^${node.charge.magnitude === 1 ? "" : node.charge.magnitude}${node.charge.sign}` : "";
  const state = node.state ? `(${node.state})` : "";
  return coefficient + renderComponents(node.components, String) + charge + state;
}
