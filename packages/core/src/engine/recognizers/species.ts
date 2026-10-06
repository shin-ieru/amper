import {
  analyzeFormula,
  caseCandidates,
  COMMON_FORMULAS,
  DIGIT_FREE_RECOVERABLE,
  formulaKey,
  interpretCharge,
  looksLikeCompound,
  parseArrowToken,
  parseElectronToken,
  parseFormula,
  type FormulaNode,
} from "@amper/chemistry";
import { formulaToAscii, formulaToUnicode, stateLabelRange } from "@amper/renderer";
import { PRIORITY } from "@amper/rules";
import { ACRONYM_STEMS, acronymStem, NEGATIVE_LEXICON, nonProseReason } from "../../confidence/context";
import { scoreSpecies } from "../../confidence/policy";
import type { AmperCategory, AmperMode, FormatSpan, Recognition, Rejection, StateLabelStyle } from "../../types";
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
  category: AmperCategory;
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
type SpeciesContextInput = {
  mode: AmperMode;
  previousWord: string | undefined;
  inReaction: boolean;
  /** Keep readings whose text is unchanged (they may still carry formatting). */
  allowUnchanged?: boolean;
};

/** Native-subscript span for a species' state label, when that presentation is chosen. */
export function stateFormatting(node: FormulaNode, presentation: StateLabelStyle): FormatSpan[] | undefined {
  if (presentation !== "subscript") return undefined;
  const range = stateLabelRange(node);
  return range ? [{ ...range, style: "subscript" }] : undefined;
}

export function evaluateSpecies(candidate: string, context: SpeciesContextInput): SpeciesEvaluation {
  const strict = evaluateStrict(candidate, context);
  if (strict.ok || !strict.unparsable) return strict;
  return recoverCase(candidate, context) ?? strict;
}

/**
 * Evaluation of the text exactly as written; never attempts case recovery (so
 * recovery cannot recurse). `typed` is what is actually in the document: a
 * re-cased candidate ("NaCl" for typed "nacl") is a change even when it
 * renders identically to itself.
 */
function evaluateStrict(
  candidate: string,
  context: SpeciesContextInput,
  typed: string = candidate,
): SpeciesEvaluation & { unparsable?: boolean } {
  const parsed = parseFormula(candidate);
  if (!parsed.ok) {
    return { ok: false, reason: `not a species: ${parsed.error.message} at ${parsed.error.position}`, unparsable: true };
  }

  const typedCaret = candidate.includes("^");
  const interpretation = interpretCharge(parsed.value);
  const candidates = interpretation?.readings ?? [{ node: parsed.value, description: "", kind: "as-written" as const }];
  const ambiguous = interpretation?.certainty === "ambiguous";

  const readings: SpeciesReading[] = [];
  let firstRejection: string | undefined;
  candidates.forEach((reading, index) => {
    const replacement = formulaToUnicode(reading.node);
    if (replacement === typed && !context.allowUnchanged) return;
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

/**
 * Case recovery (product milestone): "h2so4" → H₂SO₄ without forced capitalisation.
 *
 * 1. enumerate every valid case-insensitive element tokenisation;
 * 2. restore canonical capitalisation and parse each candidate;
 * 3. rank by the common-formula lexicon;
 * 4. autocorrect only when exactly one interpretation is clear, offer the
 *    alternatives when capitalisation is chemically ambiguous ("cocl2": CoCl₂ or
 *    COCl₂), and stay silent otherwise.
 *
 * Digit-free words recover only to a short curated list ("nacl"), so ordinary
 * words ("bacon", "Koh") are never re-cased. Identifier guards also see the
 * typed token upper-cased, so "usb3", "css3" and "c3po" stay protected.
 */
function recoverCase(typed: string, context: SpeciesContextInput): SpeciesEvaluation | undefined {
  if (!/[a-z]/.test(typed)) return undefined;
  const upper = typed.toUpperCase();
  const upperBody = upper.replace(/\((?:AQ|S|L|G)\)$/, "").replace(/(?:\^\d*)?[+\-−]$/, "");
  for (const form of new Set([upper, upperBody])) {
    if (NEGATIVE_LEXICON.has(form)) return { ok: false, reason: `"${form}" is in the negative lexicon` };
    const stem = acronymStem(form);
    if (stem && ACRONYM_STEMS.has(stem)) return { ok: false, reason: `"${stem}" plus a version number is a product label` };
  }

  // Only pure-letter tokens are word-like; "na+", "oh-", "h2o(l)" carry chemistry syntax.
  const digitFree = /^[A-Za-z]+$/.test(typed);
  const lexicon = digitFree ? DIGIT_FREE_RECOVERABLE : COMMON_FORMULAS;
  const chemistry = context.mode === "chemistry";

  const options: { canonical: string; best: SpeciesReading; inLexicon: boolean; plausible: boolean }[] = [];
  for (const canonical of caseCandidates(typed)) {
    const evaluation = evaluateStrict(canonical, context, typed);
    if (!evaluation.ok) continue;
    const best = evaluation.readings[0]!;
    const features = analyzeFormula(best.node);
    // A lone recovered element ("h2", a heading tag) needs a charge, coefficient, state or reaction around it.
    if (
      features.distinctElements.length === 1 &&
      !best.node.charge &&
      !features.hasCoefficient &&
      !features.hasState &&
      !context.inReaction
    ) {
      continue;
    }
    // A truly monatomic ion with a conventional charge ("fe3+" → Fe³⁺) needs no lexicon entry.
    const monatomicIon = features.monatomicBody && !features.hasCount && !!best.node.charge && best.confidence >= 0.95;
    options.push({
      canonical,
      best,
      inLexicon: lexicon.has(formulaKey(best.node, formulaToAscii)) || (!digitFree && monatomicIon),
      plausible: looksLikeCompound(features),
    });
  }
  if (options.length === 0) return undefined;

  const hits = options.filter((o) => o.inLexicon);
  const note = (o: (typeof options)[number]) => `capitalisation recovered: ${typed} → ${o.canonical}`;
  const reading = (o: (typeof options)[number], cap: number, alternative: boolean): SpeciesReading => ({
    ...o.best,
    confidence: Math.min(o.best.confidence, cap),
    reasons: [...o.best.reasons, note(o), ...(alternative ? ["several capitalisations are chemically valid"] : [])],
    label: alternative ? `${o.best.replacement} (capitalisation)` : o.best.replacement,
    ruleId: "formula.case-recovered",
  });

  if (hits.length === 1) {
    // One clear interpretation: autocorrect in the product profile, suggest in the conservative one.
    return { ok: true, readings: [reading(hits[0]!, chemistry ? 0.96 : 0.85, false)] };
  }
  if (hits.length > 1) {
    return { ok: true, readings: hits.slice(0, 4).map((o, i) => ({ ...reading(o, 0.85 - i * 0.01, true) })) };
  }
  // Nothing recognisable: only offer, only with digits, only if it looks like a compound.
  if (digitFree || !chemistry) return { ok: false, reason: "capitalisation not recoverable with confidence" };
  const plausible = options.filter((o) => o.plausible).slice(0, 3);
  if (plausible.length === 0) return { ok: false, reason: "recovered spellings do not look like compounds" };
  return { ok: true, readings: plausible.map((o, i) => reading(o, 0.8 - i * 0.01, plausible.length > 1)) };
}

/** A token as a species AST, including clear case recovery. Used by the reaction structure parser. */
export function speciesNode(text: string): FormulaNode | undefined {
  const parsed = parseFormula(text);
  if (parsed.ok) return parsed.value;
  const recovered = recoverCase(text, { mode: "chemistry", previousWord: undefined, inReaction: true });
  const best = recovered?.ok ? recovered.readings[0] : undefined;
  return best && best.confidence >= 0.95 ? best.node : undefined;
}

/** Does the token at `index` follow "+" or an arrow that itself follows a species? (spec §14 positive signal) */
export function inReactionContext(tokens: readonly WordToken[], index: number): boolean {
  let i = index - 1;
  if (tokens[i] && COEFFICIENT_TOKEN.test(tokens[i]!.text)) i -= 1;
  const separator = tokens[i];
  if (!separator || (separator.text !== "+" && !parseArrowToken(separator.text))) return false;
  const before = tokens[i - 1];
  if (!before) return false;
  return parseElectronToken(before.text) !== undefined || speciesNode(before.text) !== undefined;
}

/** The last token as a species: neutral formulas, ions, states, hydrates, isotopes (spec §12–17). */
export function recognizeSpecies(
  text: string,
  from: number,
  mode: AmperMode,
  rejections: Rejection[],
  presentation: StateLabelStyle = "baseline",
): Recognition[] {
  const tokens = wordTokens(text, from);
  const token = tokens[tokens.length - 1];
  if (!token || token.end !== text.length) return [];

  const span = trimFormulaToken(text, token.start, token.end);
  const candidate = text.slice(span.start, span.end);
  if (!candidate || !(CONVERTIBLE.test(candidate) || /[a-z]/.test(candidate))) return [];

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

  // With subscript state labels, "NaCl(aq)" needs formatting even though its text is final.
  const evaluation = evaluateSpecies(candidate, { ...context, allowUnchanged: presentation === "subscript" });
  if (!evaluation.ok) {
    const hydrate = periodHydrate(candidate, context);
    if (hydrate) return [{ ...hydrate, start: span.start, end: span.end, original: candidate }];
    return reject(evaluation.reason);
  }
  const readings = evaluation.readings
    .map((r) => ({ r, formatting: stateFormatting(r.node, presentation) }))
    .filter(({ r, formatting }) => r.replacement !== candidate || formatting !== undefined);
  return readings.map(({ r, formatting }) => ({
    ...(formatting && { formatting }),
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
  context: { mode: AmperMode; previousWord: string | undefined; inReaction: boolean },
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
