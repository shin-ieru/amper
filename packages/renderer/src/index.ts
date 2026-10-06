import type { ConfigToken, FormulaComponent, FormulaNode, ReactionItem } from "@amper/chemistry";

const SUBSCRIPT = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"] as const;
const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"] as const;

export const SUPERSCRIPT_PLUS = "⁺";
export const SUPERSCRIPT_MINUS = "⁻";
/** Canonical adduct/hydrate separator (U+00B7 MIDDLE DOT), whatever dot the user typed. */
export const ADDUCT_DOT = "·";

export function toSubscriptDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => SUBSCRIPT[Number(d)]!);
}

export function toSuperscriptDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => SUPERSCRIPT[Number(d)]!);
}

const BRACKETS = { paren: ["(", ")"], square: ["[", "]"] } as const;

interface Style {
  count: (n: number) => string;
  mass: (n: number) => string;
  charge: (magnitude: number, sign: "+" | "-") => string;
  dot: string;
}

const UNICODE: Style = {
  count: toSubscriptDigits,
  mass: toSuperscriptDigits,
  charge: (magnitude, sign) => (magnitude === 1 ? "" : toSuperscriptDigits(magnitude)) + (sign === "+" ? SUPERSCRIPT_PLUS : SUPERSCRIPT_MINUS),
  dot: ADDUCT_DOT,
};

/** Amper's explicit ASCII input syntax: the normal form for search and round-trips. */
const ASCII: Style = {
  count: String,
  mass: (n) => `^${n}`,
  charge: (magnitude, sign) => `^${magnitude === 1 ? "" : magnitude}${sign}`,
  dot: ADDUCT_DOT,
};

function renderComponents(components: FormulaComponent[], style: Style): string {
  let out = "";
  for (const component of components) {
    if (component.type === "element") {
      if (component.massNumber !== undefined) out += style.mass(component.massNumber);
      out += component.symbol;
    } else {
      const [open, close] = BRACKETS[component.bracket];
      out += open + renderComponents(component.components, style) + close;
    }
    if (component.count !== undefined) out += style.count(component.count);
  }
  return out;
}

function render(node: FormulaNode, style: Style): string {
  let out = node.coefficient === undefined ? "" : String(node.coefficient);
  out += renderComponents(node.components, style);
  for (const adduct of node.adducts ?? []) {
    out += style.dot + (adduct.coefficient === undefined ? "" : String(adduct.coefficient)) + renderComponents(adduct.components, style);
  }
  if (node.charge) out += style.charge(node.charge.magnitude, node.charge.sign);
  if (node.state) out += `(${node.state})`;
  return out;
}

/** Unicode-first rendering (ADR-002): editable, searchable, portable text. */
export function formulaToUnicode(node: FormulaNode): string {
  return render(node, UNICODE);
}

/** Plain ASCII normal form (H₂SO₄ → H2SO4, SO₄²⁻ → SO4^2-, ¹⁴C → ^14C). */
export function formulaToAscii(node: FormulaNode): string {
  return render(node, ASCII);
}

export function configTokenToUnicode(token: ConfigToken): string {
  if (token.kind === "core") return `[${token.symbol}]`;
  const { n, subshell, electrons } = token.orbital;
  return `${n}${subshell}${toSuperscriptDigits(electrons)}`;
}

/** One reaction item rendered on its own; the caller preserves the user's whitespace between tokens. */
export function reactionItemToUnicode(item: ReactionItem): string[] {
  switch (item.kind) {
    case "plus":
      return ["+"];
    case "arrow":
      return [item.arrow.unicode];
    case "electron": {
      const electron = `e${SUPERSCRIPT_MINUS}`;
      return [item.coefficient === undefined ? electron : `${item.coefficient}${electron}`];
    }
    case "species": {
      // A separate coefficient token ("2 H2O") stays its own token.
      if (item.tokens.length === 2) {
        const { coefficient: _coefficient, ...rest } = item.node;
        return [item.tokens[0]!.text, formulaToUnicode(rest)];
      }
      return [formulaToUnicode(item.node)];
    }
  }
}

/**
 * Range of the physical-state label "(aq)" within formulaToUnicode(node). The
 * label is always rendered last, as baseline text; this range lets hosts apply
 * native subscript formatting without changing the text (spec V2 §15.2).
 */
export function stateLabelRange(node: FormulaNode): { start: number; end: number } | undefined {
  if (!node.state) return undefined;
  const text = formulaToUnicode(node);
  return { start: text.length - node.state.length - 2, end: text.length };
}
