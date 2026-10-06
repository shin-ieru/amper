import { GREEK_QUALIFIER_WORDS, type NamedRule, type RuleRegistry } from "@amper/rules";
import { COPULAS, nonProseReason } from "../../confidence/context";
import { SUGGEST_CAP } from "../../confidence/policy";
import type { Recognition, Rejection } from "../../types";
import { previousWord, trimPhrase, wordTokens } from "../text";

/**
 * Finds the longest registered phrase that ends at the end of `text`
 * (ignoring trailing punctuation). Only whole whitespace-delimited words are
 * considered, so "xcapital sigma" never matches.
 */
export function recognizeNamed(
  text: string,
  from: number,
  registry: RuleRegistry,
  rejections: Rejection[],
): Recognition[] {
  const tokens = wordTokens(text, from);
  const last = tokens[tokens.length - 1];
  if (!last || last.end !== text.length) return [];

  for (let k = Math.min(registry.maxWords, tokens.length); k >= 1; k--) {
    const first = tokens[tokens.length - k]!;
    const span = trimPhrase(text, first.start, last.end);
    if (span.end <= span.start) continue;
    const original = text.slice(span.start, span.end);
    const rules = registry.lookup(original);
    if (rules.length === 0) continue;

    const blocked = nonProseReason(text.slice(first.start, last.end));
    if (blocked) {
      rejections.push({ recognizer: "named", candidate: original, reason: blocked });
      return [];
    }
    const before = previousWord(text, span.start, from);
    const growable = registry.canGrow(original);
    const applicable = rules.filter((rule) => {
      if (!rule.guards?.includes("not-after-qualifier") || !before || !GREEK_QUALIFIER_WORDS.has(before)) return true;
      rejections.push({ recognizer: "named", candidate: original, reason: `follows "${before}": only the whole explicit phrase may convert` });
      return false;
    });
    return applicable.map((rule) => toRecognition(rule, original, span, { before, growable }));
  }
  return [];
}

function toRecognition(
  rule: NamedRule,
  original: string,
  span: { start: number; end: number },
  context: { before: string | undefined; growable: boolean },
): Recognition {
  const reasons = [`matched phrase "${rule.label}"`];
  let confidence = rule.confidence;
  if (rule.mode === "suggest") {
    confidence = Math.min(confidence, SUGGEST_CAP);
    reasons.push("rule is suggestion-only");
  }
  if (rule.guards?.includes("after-copula") && context.before && COPULAS.has(context.before)) {
    confidence = Math.min(confidence, SUGGEST_CAP);
    reasons.push(`follows "${context.before}": likely prose`);
  }
  if (context.growable) {
    confidence = Math.min(confidence, SUGGEST_CAP);
    reasons.push("a longer phrase may follow");
  }
  return {
    recognizer: "named",
    ruleId: rule.id,
    category: rule.category,
    start: span.start,
    end: span.end,
    original,
    replacement: rule.replacement,
    confidence,
    priority: rule.priority,
    label: rule.label,
    reasons,
  };
}
