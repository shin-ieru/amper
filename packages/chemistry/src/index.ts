export { ELEMENT_SYMBOLS, isElementSymbol, type ElementSymbol } from "./elements";
export type {
  Charge,
  ElementComponent,
  FormulaComponent,
  FormulaNode,
  GroupComponent,
  PhysicalState,
  Span,
} from "./formulas/ast";
export { lexFormula, MAX_NUMBER_DIGITS, type FormulaToken, type LexError, type LexResult } from "./formulas/lexer";
export { parseFormula, MAX_FORMULA_LENGTH, MAX_GROUP_DEPTH, type ParseError, type ParseResult } from "./formulas/parser";
export { analyzeFormula, type FormulaFeatures } from "./formulas/features";
