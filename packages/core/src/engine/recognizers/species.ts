import {
  analyzeFormula,
  interpretCharge,
  parseArrowToken,
  parseElectronToken,
  parseFormula,
  type FormulaNode,
} from "@chemly/chemistry";
import { formulaToUnicode } from "@chemly/renderer";
import { PRIORITY } from "@chemly/rules";
import { nonProseReason } from "../../confidence/context";
import { scoreSpecies } from "../../confidence/policy";
import type { ChemlyCategory, ChemlyMode, Recognition, Rejection } from "../../types";
import { previousWord, trimFormulaToken, wordTokens, type WordToken } from "../text";

/** Characters that mean a token may render differently: digits, caret, signs, non-canonical dots. */
const CONVERTIBLE = /[0-9^+\-−*•∙⋅]/;
const COEFFICIENT_TOKEN = /^[1-9][0-9]{0,2}$/;

export interface SpeciesReading {
  node: FormulaNode;
  replacement: string;
  confidence: number;
  reasons: string[];
  label: string;
  ruleId: string;
  category: ChemlyCategory;
  priority: number;
}

export type SpeciesEvaluation = { ok: true; readings: SpeciesReading[] } | { ok: false; reason: string };

function classify(node: FormulaNode, typedCaret: boolean): Pick<SpeciesReading, "ruleId" | "category" | "priority"> {
  const explicit = typedCaret ? PRIORITY.explicitChargeOrIsotope : PRIORITY.formula;
  const features = analyzeFormula(node);
  if (features.hasIsotope) return { ruleId: "isotope.mass", category: "isotope", priority: explicit };
  if (node.charge) {
    return { ruleId: node.charge.notation === "caret" ? "charge.caret" : "charge.implicit", category: "charge", priority: explicit };
  }
  if (features.hasAdducts) return { ruleId: "formula.hydrate", category: "formula", priority: PRIORITY.formula };
  return { ruleId: "formula.neutral", category: "formula", priority: PRIORITY.formula };
}

/**
 * Parses one candidate as a chemical species and scores every reading.
 * Readings that render identically to the input are dropped (nothing to do).
 */
export function evaluateSpecies(
  candidate: string,
  context: { mode: ChemlyMode; previousWord: string | undefined; inReaction: boolean },
): SpeciesEvaluation {
  const parsed = parseFormula(candidate);
  if (!parsed.ok) return { ok: false, reason: `not a species: ${parsed.error.message} at ${parsed.error.position}` };

  const typedCaret = candidate.includes("^");
  const interpretation = interpretCharge(parsed.value);
  const candidates = interpretation?.readings ?? [{ node: parsed.value, description: "", kind: "as-written" as const }];
  const ambiguous = interpretation?.certainty === "ambiguous";

  const readings: SpeciesReading[] = [];
  let firstRejection: string | undefined;
  candidates.forEach((reading, index) => {
    const replacement = formulaToUnicode(reading.node);
    if (replacement === candidate) return;
    const scored = scoreSpecies(candidate, analyzeFormula(reading.node), {
      ...context,
      chargeCertainty: interpretation?.certainty ?? "none",
      typedCaret,
    });
    if (scored.confidence === 0) {
      firstRejection ??= scored.reasons[scored.reasons.length - 1];
      return;
    }
    if (interpretation && interpretation.certainty !== "certain") scored.reasons.push(interpretation.reason);
    readings.push({
      node: reading.node,
      replacement,
      // Later readings rank just below earlier ones.
      confidence: Math.max(0, scored.confidence - index * 0.01),
      reasons: scored.reasons,
      label: ambiguous ? `${replacement} (${reading.description})` : replacement,
      ...classify(reading.node, typedCaret),
    });
  });
  if (readings.length === 0) return { ok: false, reason: firstRejection ?? "renders unchanged" };
  return { ok: true, readings };
}

/** Does the token at `index` follow "+" or an arrow that itself follows a species? (spec §14 positive signal) */
export function inReactionContext(tokens: readonly WordToken[], index: number): boolean {
  let i = index - 1;
  if (tokens[i] && COEFFICIENT_TOKEN.test(tokens[i]!.text)) i -= 1;
  const separator = tokens[i];
  if (!separator || (separator.text !== "+" && !parseArrowToken(separator.text))) return false;
  const before = tokens[i - 1];
  if (!before) return false;
  return parseElectronToken(before.text) !== undefined || parseFormula(before.text).ok;
}

/** The last token as a species: neutral formulas, ions, states, hydrates, isotopes (spec §12–17). */
export function recognizeSpecies(text: string, from: number, mode: ChemlyMode, rejections: Rejection[]): Recognition[] {
  const tokens = wordTokens(text, from);
  const token = tokens[tokens.length - 1];
  if (!token || token.end !== text.length) return [];

  const span = trimFormulaToken(text, token.start, token.end);
  const candidate = text.slice(span.start, span.end);
  if (!candidate || !CONVERTIBLE.test(candidate)) return [];

  const reject = (reason: string) => {
    rejections.push({ recognizer: "formula", candidate, reason });
    return [];
  };
  const blocked = nonProseReason(token.text);
  if (blocked) return reject(blocked);

  const context = { mode, previousWord: previousWord(text, token.start, from), inReaction: inReactionContext(tokens, tokens.length - 1) };

  // A lone electron ("e-") is only notation in chemistry writing, and only ever offered.
  const electron = parseElectronToken(candidate);
  if (electron) {
    if (mode !== "chemistry" && !context.inReaction) return [];
    return [
      {
        recognizer: "formula",
        ruleId: "electron.symbol",
        category: "charge",
        start: span.start,
        end: span.end,
        original: candidate,
        replacement: `${electron.coefficient ?? ""}e⁻`,
        confidence: context.inReaction && mode === "chemistry" ? 0.97 : 0.85,
        priority: PRIORITY.formula,
        label: "electron",
        reasons: [context.inReaction ? "electron inside a reaction" : "lone e- may be prose; offered only"],
      },
    ];
  }

  const evaluation = evaluateSpecies(candidate, context);
  if (!evaluation.ok) {
    const hydrate = periodHydrate(candidate, context);
    if (hydrate) return [{ ...hydrate, start: span.start, end: span.end, original: candidate }];
    return reject(evaluation.reason);
  }
  return evaluation.readings.map((r) => ({
    recognizer: "formula",
    ruleId: r.ruleId,
    category: r.category,
    start: span.start,
    end: span.end,
    original: candidate,
    replacement: r.replacement,
    confidence: r.confidence,
    priority: r.priority,
    label: r.label,
    reasons: r.reasons,
  }));
}

/**
 * "CuSO4.5H2O": older texts write the hydrate dot as a period. Spec §16 forbids
 * converting periods, so this is only ever a suggestion.
 */
function periodHydrate(
  candidate: string,
  context: { mode: ChemlyMode; previousWord: string | undefined; inReaction: boolean },
): Omit<Recognition, "start" | "end" | "original"> | undefined {
  const match = /^([^.]+)\.(\d[^.]*)$/.exec(candidate);
  if (!match) return undefined;
  const evaluation = evaluateSpecies(`${match[1]}·${match[2]}`, context);
  if (!evaluation.ok) return undefined;
  const [best] = evaluation.readings;
  if (!best) return undefined;
  return {
    recognizer: "formula",
    ruleId: "formula.hydrate-period",
    category: "formula",
    replacement: best.replacement,
    confidence: Math.min(best.confidence, context.mode === "chemistry" ? 0.85 : 0.8),
    priority: PRIORITY.formula,
    label: `${best.replacement} (period read as hydrate dot)`,
    reasons: [...best.reasons, "a period is never converted automatically; type · or * for an automatic hydrate"],
  };
}
