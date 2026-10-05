export type RuleCategory = "greek" | "symbol" | "custom";

/**
 * Optional context guards. They never make a rule fire; they only demote an
 * "auto" rule to a suggestion when prose context makes intent ambiguous.
 */
export type RuleGuard =
  /** "the values are not equal" is prose; "x not equal y" is notation. */
  | "after-copula"
  /**
   * Never fire right after a Greek qualifier word: "Capital sigma" must become Σ
   * as a whole, never "Capital σ" via the bare-name rule.
   */
  | "not-after-qualifier";

/** A named, phrase-triggered replacement (spec §31). Parser-driven features are not rules. */
export interface NamedRule {
  id: string;
  category: RuleCategory;
  /** Canonical phrase shown in autocomplete. */
  label: string;
  /** Every accepted spelling, matched case-insensitively with whitespace collapsed. */
  patterns: string[];
  replacement: string;
  mode: "auto" | "suggest";
  /** Lower number wins conflicts (spec §54). */
  priority: number;
  confidence: number;
  guards?: RuleGuard[];
  /**
   * Autocomplete eligibility. Absent: the first word must be typed in full plus
   * at least one character of the next word. A number: a single partial word of
   * at least that many characters may complete to this rule.
   */
  completeFromChars?: number;
  /** Excluded from autocomplete entirely (e.g. shorthand aliases that would duplicate entries). */
  noCompletion?: boolean;
  /** Custom rules only: match the typed text exactly instead of case-insensitively. */
  caseSensitive?: boolean;
}

export interface CustomRule {
  id: string;
  input: string;
  output: string;
  caseSensitive: boolean;
  triggerMode: "automatic" | "suggestion";
  enabled: boolean;
}

/** Conflict priorities from spec §54. */
export const PRIORITY = {
  custom: 1,
  command: 2,
  namedSymbol: 3,
  explicitChargeOrIsotope: 4,
  reaction: 5,
  formula: 6,
  unit: 7,
  autocomplete: 8,
  semantic: 9,
} as const;
