import type { CustomRule } from "@chemly/rules";

export type { CustomRule };

export type ChemlyMode = "standard" | "chemistry";

export type ChemlyCategory =
  | "greek"
  | "symbol"
  | "formula"
  | "charge"
  | "isotope"
  | "reaction"
  | "unit"
  | "electron"
  | "custom"
  | "other";

export type ChemlyTrigger = "space" | "enter" | "tab" | "punctuation" | "shortcut" | "manual";

/** Categories that can be switched off in settings (spec §49). */
export type ToggleableCategory =
  | "greek"
  | "symbol"
  | "formula"
  | "charge"
  | "isotope"
  | "reaction"
  | "electron"
  | "custom";

export const TOGGLEABLE_CATEGORIES: readonly ToggleableCategory[] = [
  "greek",
  "symbol",
  "formula",
  "charge",
  "isotope",
  "reaction",
  "electron",
  "custom",
];

export interface ChemlySettings {
  enabled: boolean;
  mode: ChemlyMode;
  /** When false, anything that would autocorrect is offered as a suggestion instead. */
  autoConvert: boolean;
  autocomplete: boolean;
  backspaceRestore: boolean;
  categories: Record<ToggleableCategory, boolean>;
  /** Exact inputs (case-insensitive) that Chemly must never touch. */
  neverConvert: string[];
  customRules: CustomRule[];
}

export const DEFAULT_SETTINGS: ChemlySettings = Object.freeze({
  enabled: true,
  mode: "standard",
  autoConvert: true,
  autocomplete: true,
  backspaceRestore: true,
  categories: Object.freeze(Object.fromEntries(TOGGLEABLE_CATEGORIES.map((c) => [c, true])) as Record<ToggleableCategory, boolean>),
  neverConvert: [],
  customRules: [],
}) as ChemlySettings;

/** Settings as callers and storage provide them: any subset, including a subset of categories. */
export type ChemlySettingsInput = Partial<Omit<ChemlySettings, "categories">> & {
  categories?: Partial<Record<ToggleableCategory, boolean>>;
};

export function resolveSettings(partial: ChemlySettingsInput = {}): ChemlySettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    categories: { ...DEFAULT_SETTINGS.categories, ...partial.categories },
    neverConvert: partial.neverConvert ?? [],
    customRules: partial.customRules ?? [],
  };
}

/** One recogniser's claim over a span of the text before the boundary. */
export interface Recognition {
  recognizer: "named" | "formula" | "electron" | "reaction";
  ruleId: string;
  category: ChemlyCategory;
  /** Offsets into the evaluated text (the text before the boundary). */
  start: number;
  end: number;
  original: string;
  replacement: string;
  confidence: number;
  priority: number;
  label: string;
  reasons: string[];
}

export interface ChemlySuggestion {
  ruleId: string;
  category: ChemlyCategory;
  label: string;
  original: string;
  replacement: string;
  confidence: number;
  start: number;
  end: number;
  source: "ambiguous" | "completion" | "fuzzy";
}

export interface Rejection {
  recognizer: string;
  candidate: string;
  reason: string;
}

export interface DebugInfo {
  text: string;
  recognitions: Recognition[];
  rejections: Rejection[];
  elapsedMs: number;
}

export type EngineDecision =
  | { action: "autocorrect"; recognition: Recognition; debug: DebugInfo }
  | { action: "suggest"; suggestions: ChemlySuggestion[]; debug: DebugInfo }
  | { action: "none"; debug: DebugInfo };

/**
 * The single editing primitive Chemly needs: delete N characters immediately
 * before the caret and insert text in their place, leaving the caret after it.
 * Caret-relative (rather than absolute offsets) because Google Docs exposes no
 * document offsets to an extension; see ADR-003.
 */
export interface TailRewrite {
  deleteCount: number;
  insertText: string;
}

/** Spec §7 transaction, plus the caret-relative data reversal needs. */
export interface ChemlyTransaction {
  id: string;
  kind: "convert" | "restore";
  ruleId: string;
  category: ChemlyCategory;
  originalText: string;
  replacementText: string;
  /** Offsets within the bounded context window the decision was made on. */
  startOffset: number;
  endOffsetBefore: number;
  endOffsetAfter: number;
  trigger: ChemlyTrigger;
  confidence: number;
  timestamp: number;
  reversible: boolean;
  /** Exact text removed from before the caret. */
  removedTail: string;
  /** Exact text inserted before the caret. */
  insertedTail: string;
  /** What immediate Backspace puts back. */
  restoreText: string;
}

export interface Disposable {
  dispose(): void;
}
