import type { FormulaFeatures } from "@chemly/chemistry";
import type { ChemlyMode } from "../types";
import { ACRONYM_STEMS, acronymStem, LABEL_WORDS, NEGATIVE_LEXICON } from "./context";

/** Spec §55: ≥ 0.95 autocorrect, 0.70–0.94 suggest, < 0.70 do nothing. */
export const AUTO_THRESHOLD = 0.95;
export const SUGGEST_THRESHOLD = 0.7;
/** Cap applied to anything that must not autocorrect regardless of its base score. */
export const SUGGEST_CAP = 0.9;

export type ConfidenceBand = "auto" | "suggest" | "none";

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= AUTO_THRESHOLD) return "auto";
  if (confidence >= SUGGEST_THRESHOLD) return "suggest";
  return "none";
}

export interface Scored {
  confidence: number;
  reasons: string[];
}

export interface SpeciesContext {
  mode: ChemlyMode;
  previousWord: string | undefined;
  /** The token follows "+" or a reaction arrow after another species. */
  inReaction: boolean;
  /** Certainty of the charge reading (charges.ts); "none" for neutral species. */
  chargeCertainty: "none" | "certain" | "likely" | "ambiguous";
  /** The user typed explicit caret syntax (SO4^2-, ^14C). */
  typedCaret: boolean;
}

/**
 * Deterministic species confidence (spec §55).
 *
 * Neutral formulas: Chemistry Mode 0.97 (auto), Standard Mode 0.90 (suggest).
 * A lone element with a count ("H2", "U2") is weaker unless a coefficient,
 * physical state, isotope or reaction context says it is chemistry.
 * Explicit caret syntax: 0.99 in both modes; it has no prose reading.
 * Implicit charges: "likely" follows the formula numbers; "ambiguous" only
 * ever suggests.
 */
export function scoreSpecies(token: string, features: FormulaFeatures, context: SpeciesContext): Scored {
  const reasons: string[] = [];
  const reject = (reason: string): Scored => ({ confidence: 0, reasons: [...reasons, reason] });

  // Guards see the identifier with any charge/state suffix removed, so "PS5+" and "USB3-" stay protected.
  const body = token.replace(/\((?:aq|s|l|g)\)$/, "").replace(/(?:\^\d*)?[+\-−]$/, "");
  for (const candidate of new Set([token, body])) {
    if (NEGATIVE_LEXICON.has(candidate)) return reject(`"${candidate}" is in the negative lexicon`);
    const stem = acronymStem(candidate);
    if (stem && ACRONYM_STEMS.has(stem)) return reject(`"${stem}" plus a version number is a product label`);
  }
  if (context.previousWord && LABEL_WORDS.has(context.previousWord)) {
    return reject(`preceded by label word "${context.previousWord}"`);
  }
  if (features.hasExplicitOne) return reject("explicit count of 1 is not formula notation");
  if (features.singleElementRepeated) return reject("same element repeated non-adjacently");

  reasons.push(`valid element tokens: ${features.elementTokens.join(" ")}`);
  if (features.hasGroup) reasons.push("valid bracket grouping");
  if (features.hasCoefficient) reasons.push("stoichiometric coefficient");
  if (features.hasAdducts) reasons.push("hydrate/adduct");
  if (features.hasState) reasons.push("physical state");
  if (features.hasIsotope) reasons.push("isotope mass number");
  if (context.inReaction) reasons.push("inside a reaction");

  const chemistry = context.mode === "chemistry";
  reasons.push(chemistry ? "Chemistry Mode" : "Standard Mode");

  if (context.chargeCertainty === "ambiguous") {
    reasons.push("charge is ambiguous: offered, not applied");
    const bareMonatomic = features.monatomicBody && !features.hasCount;
    return { confidence: chemistry ? 0.85 : bareMonatomic ? 0.6 : 0.8, reasons };
  }
  if (context.typedCaret) {
    reasons.push("explicit caret syntax");
    return { confidence: 0.99, reasons };
  }
  if (context.chargeCertainty === "likely") {
    reasons.push("conventional charge notation");
    return { confidence: chemistry ? 0.97 : 0.9, reasons };
  }

  if (features.distinctElements.length === 1 && !features.hasAdducts) {
    if (features.maxCount > 100) return reject("single element with an implausible count");
    if (features.hasCoefficient || context.inReaction || features.hasState || features.hasIsotope) {
      return { confidence: chemistry ? 0.97 : 0.85, reasons };
    }
    reasons.push("single element with a count is often an identifier (H2, U2, B12)");
    return { confidence: chemistry ? 0.85 : 0.65, reasons };
  }

  reasons.push(`${features.distinctElements.length} distinct elements`);
  return { confidence: chemistry ? 0.97 : 0.9, reasons };
}
