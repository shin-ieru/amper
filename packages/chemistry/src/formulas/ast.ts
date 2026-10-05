/** Half-open source range [start, end) within the parsed input. */
export interface Span {
  start: number;
  end: number;
}

export interface ElementComponent {
  type: "element";
  symbol: string;
  /** Explicit atom count; undefined means the implicit 1. */
  count?: number;
  /** Isotope mass number written before the symbol (^14C, ¹⁴C). */
  massNumber?: number;
  span: Span;
}

export interface GroupComponent {
  type: "group";
  bracket: "paren" | "square";
  components: FormulaComponent[];
  count?: number;
  span: Span;
}

export type FormulaComponent = ElementComponent | GroupComponent;

/**
 * How a charge was written. Only "implicit" is ambiguous: in "O2-" the parser
 * keeps the 2 as a count, and charges.ts offers the alternative readings.
 */
export type ChargeNotation = "caret" | "implicit" | "rendered";

export interface Charge {
  magnitude: number;
  sign: "+" | "-";
  notation?: ChargeNotation;
}

export type PhysicalState = "s" | "l" | "g" | "aq";

/** One "·"-joined part of an adduct or hydrate: the "5H2O" in CuSO4·5H2O. */
export interface Adduct {
  coefficient?: number;
  components: FormulaComponent[];
}

/** A single chemical species: coefficient, body, adducts, charge, physical state. */
export interface FormulaNode {
  type: "formula";
  /** Leading stoichiometric coefficient ("2" in 2H2O); rendered full-size. */
  coefficient?: number;
  components: FormulaComponent[];
  adducts?: Adduct[];
  charge?: Charge;
  state?: PhysicalState;
}

/**
 * Deep copy of a species AST. Written out per node type rather than using
 * structuredClone (a host API absent from the engine's ES-only lib) or a JSON
 * round-trip (which would silently drop any future non-JSON field). The key
 * lists below must name every field of each node type, so adding a field to
 * the AST without copying it here is a compile error.
 */
const FORMULA_KEYS: Record<keyof FormulaNode, true> = { type: true, coefficient: true, components: true, adducts: true, charge: true, state: true };
const ELEMENT_KEYS: Record<keyof ElementComponent, true> = { type: true, symbol: true, count: true, massNumber: true, span: true };
const GROUP_KEYS: Record<keyof GroupComponent, true> = { type: true, bracket: true, components: true, count: true, span: true };
const ADDUCT_KEYS: Record<keyof Adduct, true> = { coefficient: true, components: true };
const CHARGE_KEYS: Record<keyof Charge, true> = { magnitude: true, sign: true, notation: true };
void [FORMULA_KEYS, ELEMENT_KEYS, GROUP_KEYS, ADDUCT_KEYS, CHARGE_KEYS];

export function cloneFormula(node: FormulaNode): FormulaNode {
  const out: FormulaNode = { type: "formula", components: node.components.map(cloneComponent) };
  if (node.coefficient !== undefined) out.coefficient = node.coefficient;
  if (node.adducts) {
    out.adducts = node.adducts.map((a) => ({
      ...(a.coefficient !== undefined && { coefficient: a.coefficient }),
      components: a.components.map(cloneComponent),
    }));
  }
  if (node.charge) {
    out.charge = { magnitude: node.charge.magnitude, sign: node.charge.sign };
    if (node.charge.notation !== undefined) out.charge.notation = node.charge.notation;
  }
  if (node.state !== undefined) out.state = node.state;
  return out;
}

function cloneComponent(component: FormulaComponent): FormulaComponent {
  const span = { start: component.span.start, end: component.span.end };
  if (component.type === "element") {
    return {
      type: "element",
      symbol: component.symbol,
      ...(component.count !== undefined && { count: component.count }),
      ...(component.massNumber !== undefined && { massNumber: component.massNumber }),
      span,
    };
  }
  return {
    type: "group",
    bracket: component.bracket,
    components: component.components.map(cloneComponent),
    ...(component.count !== undefined && { count: component.count }),
    span,
  };
}
