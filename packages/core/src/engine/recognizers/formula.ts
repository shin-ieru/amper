import { analyzeFormula, parseFormula } from "@chemly/chemistry";
import { formulaToUnicode } from "@chemly/renderer";
import { PRIORITY } from "@chemly/rules";
import { nonProseReason } from "../../confidence/context";
import { scoreFormula } from "../../confidence/policy";
import type { ChemlyMode, Recognition, Rejection } from "../../types";
import { previousWord, trimFormulaToken, wordTokens } from "../text";

const HAS_ASCII_DIGIT = /[0-9]/;

/** Parses the last token as a neutral formula (spec §12) and scores it. */
export function recognizeFormula(
  text: string,
  from: number,
  mode: ChemlyMode,
  rejections: Rejection[],
): Recognition[] {
  const tokens = wordTokens(text, from);
  const token = tokens[tokens.length - 1];
  if (!token || token.end !== text.length) return [];

  const span = trimFormulaToken(text, token.start, token.end);
  const candidate = text.slice(span.start, span.end);
  // Fast path: with no ASCII digit there is nothing to subscript.
  if (!candidate || !HAS_ASCII_DIGIT.test(candidate)) return [];

  const reject = (reason: string) => {
    rejections.push({ recognizer: "formula", candidate, reason });
    return [];
  };
  const blocked = nonProseReason(token.text);
  if (blocked) return reject(blocked);

  const parsed = parseFormula(candidate);
  if (!parsed.ok) return reject(`not a formula: ${parsed.error.message} at ${parsed.error.position}`);

  const replacement = formulaToUnicode(parsed.value);
  if (replacement === candidate) return [];

  const scored = scoreFormula(candidate, analyzeFormula(parsed.value), {
    mode,
    previousWord: previousWord(text, token.start, from),
  });
  if (scored.confidence === 0) return reject(scored.reasons[scored.reasons.length - 1]!);

  return [
    {
      recognizer: "formula",
      ruleId: "formula.neutral",
      category: "formula",
      start: span.start,
      end: span.end,
      original: candidate,
      replacement,
      confidence: scored.confidence,
      priority: PRIORITY.formula,
      label: "chemical formula",
      reasons: scored.reasons,
    },
  ];
}
