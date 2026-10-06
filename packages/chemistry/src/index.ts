export { atomicNumber, ELEMENT_SYMBOLS, isElementSymbol, type ElementSymbol } from "./elements";
export {
  cloneFormula,
  type Adduct,
  type Charge,
  type ChargeNotation,
  type ElementComponent,
  type FormulaComponent,
  type FormulaNode,
  type GroupComponent,
  type PhysicalState,
  type Span,
} from "./formulas/ast";
export {
  lexFormula,
  MAX_NUMBER_DIGITS,
  type FormulaToken,
  type LexError,
  type LexResult,
  type NumberScript,
} from "./formulas/lexer";
export {
  MAX_CHARGE,
  MAX_FORMULA_LENGTH,
  MAX_GROUP_DEPTH,
  MAX_MASS_NUMBER,
  parseFormula,
  type ParseError,
  type ParseResult,
} from "./formulas/parser";
export { analyzeFormula, type FormulaFeatures } from "./formulas/features";
export {
  AMBIGUOUS_BARE_SIGN_SYMBOLS,
  interpretCharge,
  KNOWN_HOMONUCLEAR_IONS,
  TYPICAL_ION_CHARGES,
  type ChargeInterpretation,
  type ChargeReading,
  type ReadingKind,
} from "./formulas/charges";
export { parseConfigToken, type ConfigToken, type Orbital, type Subshell } from "./electron-config";
export { ARROW_DEFINITIONS, arrowGlyph, type ArrowDefinition } from "./arrows";
export {
  parseArrowToken,
  parseElectronToken,
  parseReactionSuffix,
  type ArrowInfo,
  type ArrowKind,
  type ParsedReaction,
  type ReactionItem,
  type SpeciesParser,
  type TextToken,
} from "./reactions";
export { caseCandidates, MAX_CASE_CANDIDATES } from "./case-recovery";
export { ELEMENTAL_FORMS, elementalFormOf, type ElementalForm } from "./elemental";
export { COMMON_FORMULAS, DIGIT_FREE_RECOVERABLE, formulaKey, looksLikeCompound } from "./common-formulas";
