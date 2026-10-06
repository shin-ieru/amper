import type { PhraseEntry, RuleRegistry } from "@amper/rules";
import { nonProseReason } from "../confidence/context";
import type { AmperSuggestion, ToggleableCategory } from "../types";
import { trimPhrase, wordTokens, type WordToken } from "./text";

const MAX_SUGGESTIONS = 6;

/** True when a and b differ by at most one insertion, deletion, substitution or adjacent swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

function lastTokens(text: string, from: number, k: number): WordToken[] | undefined {
  const tokens = wordTokens(text, from);
  if (tokens.length < k) return undefined;
  const last = tokens[tokens.length - 1]!;
  if (last.end !== text.length) return undefined;
  return tokens.slice(tokens.length - k);
}

function toSuggestion(
  entry: PhraseEntry,
  text: string,
  span: { start: number; end: number },
  source: AmperSuggestion["source"],
  confidence: number,
): AmperSuggestion {
  return {
    ruleId: entry.rule.id,
    category: entry.rule.category,
    label: entry.rule.label,
    original: text.slice(span.start, span.end),
    replacement: entry.rule.replacement,
    confidence,
    start: span.start,
    end: span.end,
    source,
  };
}

/**
 * Inline autocomplete for a partially typed phrase (spec §28). Deliberately
 * restrained: by default the first word must be complete (or a ≥3-letter
 * prefix like "cap") and the user must have started the next word; rules opt
 * into single-word completion with `completeFromChars`.
 */
export function completePhrase(
  text: string,
  from: number,
  registry: RuleRegistry,
  enabled: Record<ToggleableCategory, boolean>,
): AmperSuggestion[] {
  const ranked: { suggestion: AmperSuggestion; score: number }[] = [];
  const seen = new Set<string>();

  for (let k = Math.min(registry.maxWords, 6); k >= 1; k--) {
    const tokens = lastTokens(text, from, k);
    if (!tokens) continue;
    const span = trimPhrase(text, tokens[0]!.start, text.length);
    if (span.end !== text.length || span.end <= span.start) continue;
    if (nonProseReason(text.slice(span.start, span.end))) return [];
    const typed = text.slice(span.start, span.end).toLowerCase().split(/[\s ]+/);
    if (typed.length !== k) continue;
    const lastTyped = typed[k - 1]!;

    for (const entry of registry.entries) {
      const { rule, words } = entry;
      if (rule.noCompletion || !enabled[rule.category] || words.length < k || seen.has(rule.id)) continue;

      let partialEarlierWord = false;
      let matches = true;
      for (let i = 0; i < k - 1; i++) {
        const want = words[i]!;
        const got = typed[i]!;
        if (got === want) continue;
        if (i === 0 && got.length >= 3 && want.startsWith(got)) partialEarlierWord = true;
        else if (i > 0 && got.length >= 2 && want.startsWith(got)) partialEarlierWord = true;
        else {
          matches = false;
          break;
        }
      }
      if (!matches || !words[k - 1]!.startsWith(lastTyped)) continue;

      if (k === 1) {
        if (rule.completeFromChars === undefined || lastTyped.length < rule.completeFromChars) continue;
      } else if (lastTyped.length < (partialEarlierWord ? 2 : 1)) {
        continue;
      }

      seen.add(rule.id);
      const exact = !partialEarlierWord && words.length === k && words[k - 1] === lastTyped;
      const score = k * 10 + (exact ? 5 : 0) + (rule.mode === "auto" ? 2 : 0) - words.join(" ").length / 100;
      ranked.push({ suggestion: toSuggestion(entry, text, span, "completion", rule.confidence), score });
    }
    // Longest match wins, as at a boundary: "capital sigm" must not also offer bare "sigma".
    if (ranked.length > 0) break;
  }

  return ranked
    .sort((a, b) => b.score - a.score || a.suggestion.label.localeCompare(b.suggestion.label))
    .slice(0, MAX_SUGGESTIONS)
    .map((r) => r.suggestion);
}

/**
 * Typo-tolerant matching for complete multi-word explicit phrases at a
 * boundary ("equlibrium arrow", "capital sigam"). Never autocorrects: a fuzzy
 * hit is only ever a suggestion. Formulas are never fuzzy-matched (spec §28).
 */
export function fuzzyPhrase(
  text: string,
  from: number,
  registry: RuleRegistry,
  enabled: Record<ToggleableCategory, boolean>,
): AmperSuggestion[] {
  const out: AmperSuggestion[] = [];
  for (let k = Math.min(registry.maxWords, 6); k >= 2; k--) {
    const tokens = lastTokens(text, from, k);
    if (!tokens) continue;
    const span = trimPhrase(text, tokens[0]!.start, tokens[k - 1]!.end);
    const typed = text.slice(span.start, span.end).toLowerCase().split(/[\s ]+/);
    if (typed.length !== k) continue;
    for (const entry of registry.entries) {
      const { rule, words } = entry;
      if (rule.mode !== "auto" || !enabled[rule.category] || words.length !== k) continue;
      let fuzzyWords = 0;
      const ok = words.every((want, i) => {
        const got = typed[i]!;
        if (got === want) return true;
        if (want.length >= 5 && got.length >= 4 && withinOneEdit(got, want)) {
          fuzzyWords++;
          return true;
        }
        return false;
      });
      if (ok && fuzzyWords === 1 && !out.some((s) => s.ruleId === rule.id)) {
        out.push(toSuggestion(entry, text, span, "fuzzy", 0.8));
      }
    }
    if (out.length > 0) break;
  }
  return out.slice(0, MAX_SUGGESTIONS);
}
