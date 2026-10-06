import type { CustomRule } from "@amper/rules";

export type { CustomRule };

export type AmperMode = "standard" | "chemistry";

export type AmperCategory =
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

export type AmperTrigger = "space" | "enter" | "tab" | "punctuation" | "shortcut" | "manual";

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

export interface AmperSettings {
  enabled: boolean;
  mode: AmperMode;
  /** When false, anything that would autocorrect is offered as a suggestion instead. */
  autoConvert: boolean;
  autocomplete: boolean;
  backspaceRestore: boolean;
  categories: Record<ToggleableCategory, boolean>;
  /** Exact inputs (case-insensitive) that Amper must never touch. */
  neverConvert: string[];
  customRules: CustomRule[];
}

export const DEFAULT_SETTINGS: AmperSettings = Object.freeze({
  enabled: true,
  mode: "standard",
  autoConvert: true,
  autocomplete: true,
  backspaceRestore: true,
  categories: Object.freeze(Object.fromEntries(TOGGLEABLE_CATEGORIES.map((c) => [c, true])) as Record<ToggleableCategory, boolean>),
  neverConvert: [],
  customRules: [],
}) as AmperSettings;

/** Settings as callers and storage provide them: any subset, including a subset of categories. */
export type AmperSettingsInput = Partial<Omit<AmperSettings, "categories">> & {
  categories?: Partial<Record<ToggleableCategory, boolean>>;
};

export function resolveSettings(partial: AmperSettingsInput = {}): AmperSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    categories: { ...DEFAULT_SETTINGS.categories, ...partial.categories },
    neverConvert: partial.neverConvert ?? [],
    customRules: partial.customRules ?? [],
  };
}

/**
 * The product profile (Google Docs extension, playground default): chemistry-aware
 * autocorrect is simply what an enabled Amper does. "standard" remains an
 * engine-level conservative profile for tests and diagnostics, not a user setting.
 */
export function productSettings(input: AmperSettingsInput = {}): AmperSettings {
  return resolveSettings({ ...input, mode: "chemistry" });
}

/** One recogniser's claim over a span of the text before the boundary. */
export interface Recognition {
  recognizer: "named" | "formula" | "electron" | "reaction";
  ruleId: string;
  category: AmperCategory;
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

export interface AmperSuggestion {
  ruleId: string;
  category: AmperCategory;
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
  | { action: "suggest"; suggestions: AmperSuggestion[]; debug: DebugInfo }
  | { action: "none"; debug: DebugInfo };

/**
 * The single editing primitive Amper needs: delete N characters immediately
 * before the caret and insert text in their place, leaving the caret after it.
 * Caret-relative (rather than absolute offsets) because Google Docs exposes no
 * document offsets to an extension; see ADR-003.
 */
export interface TailRewrite {
  deleteCount: number;
  insertText: string;
}

/** Spec §7 transaction, plus the caret-relative data reversal needs. */
export interface AmperTransaction {
  id: string;
  kind: "convert" | "restore";
  ruleId: string;
  category: AmperCategory;
  originalText: string;
  replacementText: string;
  /** Offsets within the bounded context window the decision was made on. */
  startOffset: number;
  endOffsetBefore: number;
  endOffsetAfter: number;
  trigger: AmperTrigger;
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
