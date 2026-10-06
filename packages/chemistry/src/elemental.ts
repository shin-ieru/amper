import type { FormulaNode } from "./formulas/ast";

/**
 * Elemental substances that exist as molecules of one element (spec: "single-element
 * molecular formulas"). A lone element with a count is usually an identifier ("U2",
 * "B12", "K9"), so the general policy only suggests it; these forms are real
 * chemistry written exactly this way, and get their own tier.
 *
 * - standalone: confidence tier when typed on its own (no coefficient, state or reaction).
 * - lowercase: whether case recovery may restore it from lowercase input.
 */
export interface ElementalForm {
  symbol: string;
  count: number;
  name: string;
  standalone: "auto" | "suggest";
  lowercase: boolean;
  /** Why a form is held back, for reviewers. */
  note?: string;
}

export const ELEMENTAL_FORMS: readonly ElementalForm[] = [
  // Lowercase h2 recovers like the others: Amper is a chemistry-writing tool in Google Docs. Real
  // code/markup contexts are excluded by context instead (`h2`, <h2>, h2.title, URLs, paths).
  { symbol: "H", count: 2, name: "hydrogen", standalone: "auto", lowercase: true },
  { symbol: "N", count: 2, name: "nitrogen", standalone: "auto", lowercase: true },
  { symbol: "O", count: 2, name: "oxygen", standalone: "auto", lowercase: true },
  { symbol: "F", count: 2, name: "fluorine", standalone: "auto", lowercase: true },
  { symbol: "Cl", count: 2, name: "chlorine", standalone: "auto", lowercase: true },
  { symbol: "Br", count: 2, name: "bromine", standalone: "auto", lowercase: true },
  { symbol: "I", count: 2, name: "iodine", standalone: "auto", lowercase: true },
  { symbol: "O", count: 3, name: "ozone", standalone: "auto", lowercase: true },
  { symbol: "S", count: 8, name: "cyclooctasulfur", standalone: "auto", lowercase: true },
  {
    symbol: "P", count: 4, name: "white phosphorus", standalone: "suggest", lowercase: true,
    note: "P4 is also a common priority label (P0–P4) and processor name; converts in chemistry context",
  },
];

const BY_FORMULA = new Map(ELEMENTAL_FORMS.map((f) => [`${f.symbol}${f.count}`, f]));

/**
 * The elemental form a species is, if it is exactly one element with a count and
 * nothing else that changes its identity (no isotope, adduct or group). Charge,
 * coefficient and state are handled by their own rules, so they are ignored here.
 */
export function elementalFormOf(node: FormulaNode): ElementalForm | undefined {
  const [only] = node.components;
  if (node.components.length !== 1 || only?.type !== "element" || only.count === undefined) return undefined;
  if (only.massNumber !== undefined || node.adducts?.length) return undefined;
  return BY_FORMULA.get(`${only.symbol}${only.count}`);
}
