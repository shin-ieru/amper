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
 * Reserved for Phase 2. The neutral-formula parser never populates these, but
 * the AST carries them so renderers and the reaction parser can grow into them
 * without a breaking change.
 */
export interface Charge {
  magnitude: number;
  sign: "+" | "-";
}

export type PhysicalState = "s" | "l" | "g" | "aq";

export interface FormulaNode {
  type: "formula";
  /** Leading stoichiometric coefficient ("2" in 2H2O); rendered full-size. */
  coefficient?: number;
  components: FormulaComponent[];
  charge?: Charge;
  state?: PhysicalState;
}
