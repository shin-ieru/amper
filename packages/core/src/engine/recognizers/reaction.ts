import { parseArrowToken, parseReactionSuffix, type TextToken } from "@amper/chemistry";
import { reactionItemToUnicode } from "@amper/renderer";
import { PRIORITY } from "@amper/rules";
import type { AmperMode, Recognition, Rejection } from "../../types";
import { previousWord, trimFormulaToken, wordTokens } from "../text";
import { evaluateSpecies, speciesNode } from "./species";
import { spliceTokens } from "./splice";

const ASCII_ARROWS = new Set(["->", "<-", "<->", "<=>"]);

/**
 * Reaction arrows and full reactions (spec §20–22).
 *
 * - A standalone ASCII arrow converts in Chemistry Mode when a species stands
 *   before it; otherwise ("x -> y", "a <- b") it is only offered.
 * - A complete reaction (species, "+", arrows) is parsed species by species and
 *   rewritten from its first changed token. Any ambiguous species ("O2-") turns
 *   the whole reaction into a suggestion. Nothing is balanced or solved.
 */
export function recognizeReaction(
  text: string,
  from: number,
  mode: AmperMode,
  rejections: Rejection[],
  frozen?: ReadonlySet<string>,
): Recognition[] {
  const words = wordTokens(text, from);
  const lastWord = words[words.length - 1];
  if (!lastWord || lastWord.end !== text.length) return [];
  const chemistry = mode === "chemistry";

  if (ASCII_ARROWS.has(lastWord.text)) {
    const arrow = parseArrowToken(lastWord.text)!;
    // The run before the arrow always ends in a species when it exists.
    const hasSpecies = parseReactionSuffix(words.slice(0, -1), speciesNode) !== undefined;
    return [
      {
        recognizer: "reaction",
        ruleId: "reaction.arrow",
        category: "reaction",
        start: lastWord.start,
        end: lastWord.end,
        original: lastWord.text,
        replacement: arrow.unicode,
        confidence: hasSpecies && chemistry ? 0.97 : 0.9,
        priority: PRIORITY.reaction,
        label: `${arrow.kind} arrow`,
        reasons: [hasSpecies ? "follows a chemical species" : "no species before it: may be prose or code", chemistry ? "Chemistry Mode" : "Standard Mode"],
      },
    ];
  }

  const lastSpan = trimFormulaToken(text, lastWord.start, lastWord.end);
  const tokens: TextToken[] = words.map((w, i) =>
    i === words.length - 1 ? { text: text.slice(lastSpan.start, lastSpan.end), ...lastSpan } : w,
  );
  const reaction = parseReactionSuffix(tokens, speciesNode);
  if (!reaction || reaction.arrowCount === 0) return [];

  const rendered: { start: number; end: number; text: string }[] = [];
  const reasons: string[] = [];
  let confidence = chemistry ? 0.97 : 0.9;
  let reactants = 0;
  let products = 0;
  let seenArrow = false;

  for (const item of reaction.items) {
    if (item.kind === "arrow") seenArrow = true;
    if (item.kind === "species" || item.kind === "electron") {
      if (seenArrow) products++;
      else reactants++;
    }
    if (item.kind === "species") {
      const speciesToken = item.tokens[item.tokens.length - 1]!;
      const evaluation = evaluateSpecies(speciesToken.text, {
        mode,
        previousWord: previousWord(text, item.tokens[0]!.start, from),
        inReaction: true,
      });
      if (evaluation.ok) {
        const [best] = evaluation.readings;
        confidence = Math.min(confidence, best!.confidence);
        if (best!.confidence < 0.95) reasons.push(`${speciesToken.text}: ${best!.reasons[best!.reasons.length - 1]}`);
        const unicode = reactionItemToUnicode({ ...item, node: best!.node });
        item.tokens.forEach((t, i) => rendered.push({ start: t.start, end: t.end, text: unicode[i]! }));
        continue;
      }
      if (evaluation.reason !== "renders unchanged") {
        rejections.push({ recognizer: "reaction", candidate: speciesToken.text, reason: evaluation.reason });
        return [];
      }
    }
    const unicode = reactionItemToUnicode(item);
    item.tokens.forEach((t, i) => rendered.push({ start: t.start, end: t.end, text: unicode[i]! }));
  }

  const splice = spliceTokens(text, rendered, frozen);
  if (!splice) return [];
  return [
    {
      recognizer: "reaction",
      ruleId: "reaction.equation",
      category: "reaction",
      start: splice.start,
      end: splice.end,
      original: text.slice(splice.start, splice.end),
      replacement: splice.replacement,
      confidence,
      priority: PRIORITY.reaction,
      label: splice.replacement,
      reasons: [
        `reaction: ${reactants} reactant${reactants === 1 ? "" : "s"}, ${products} product${products === 1 ? "" : "s"}, ${reaction.arrowCount} arrow${reaction.arrowCount === 1 ? "" : "s"}`,
        "each species parsed independently",
        ...reasons,
        chemistry ? "Chemistry Mode" : "Standard Mode (reactions suggest only)",
      ],
    },
  ];
}
