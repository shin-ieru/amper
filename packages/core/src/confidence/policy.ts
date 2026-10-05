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

/**
 * Deterministic formula confidence (spec §55). Chemistry Mode: 0.97 (auto).
 * Standard Mode: 0.90 (suggest) — formulas only autocorrect in Chemistry Mode.
 * A lone element with a count ("H2", "U2") is weaker in both modes.
 */
export function scoreFormula(
  token: string,
  features: FormulaFeatures,
  context: { mode: ChemlyMode; previousWord: string | undefined },
): Scored {
  const reasons: string[] = [];
  const reject = (reason: string): Scored => ({ confidence: 0, reasons: [...reasons, reason] });

  if (NEGATIVE_LEXICON.has(token)) return reject(`"${token}" is in the negative lexicon`);
  const stem = acronymStem(token);
  if (stem && ACRONYM_STEMS.has(stem)) return reject(`"${stem}" plus a version number is a product label`);
  if (context.previousWord && LABEL_WORDS.has(context.previousWord)) {
    return reject(`preceded by label word "${context.previousWord}"`);
  }
  if (features.hasExplicitOne) return reject("explicit count of 1 is not formula notation");
  if (features.singleElementRepeated) return reject("same element repeated non-adjacently");

  reasons.push(`valid element tokens: ${features.elementTokens.join(" ")}`);
  if (features.hasGroup) reasons.push("valid bracket grouping");
  if (features.hasCoefficient) reasons.push("stoichiometric coefficient");

  const chemistry = context.mode === "chemistry";
  reasons.push(chemistry ? "Chemistry Mode" : "Standard Mode (formulas suggest only)");

  if (features.distinctElements.length === 1) {
    if (features.maxCount > 100) return reject("single element with an implausible count");
    if (features.hasCoefficient) {
      return { confidence: chemistry ? 0.97 : 0.85, reasons };
    }
    reasons.push("single element with a count is often an identifier (H2, U2, B12)");
    return { confidence: chemistry ? 0.85 : 0.65, reasons };
  }

  reasons.push(`${features.distinctElements.length} distinct elements`);
  return { confidence: chemistry ? 0.97 : 0.9, reasons };
}
