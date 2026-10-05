import { greekRules } from "./greek";
import { scriptCommandRules, symbolRules } from "./symbols";
import { PRIORITY, type CustomRule, type NamedRule } from "./types";

/** Case-folds and collapses whitespace so "Capital  SIGMA" and "capital sigma" share a key. */
export function normalizePhrase(text: string): string {
  return text.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
}

function collapseWhitespace(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

export interface PhraseEntry {
  /** Normalised phrase. */
  phrase: string;
  words: string[];
  rule: NamedRule;
}

/**
 * Index over named rules. Lookup is by exact normalised phrase; the engine asks
 * for the longest phrase ending at the caret, so the index only needs to know
 * which word counts exist (maxWords) and which phrases can still grow.
 */
export class RuleRegistry {
  readonly maxWords: number;
  readonly entries: readonly PhraseEntry[];
  private readonly byPhrase = new Map<string, PhraseEntry[]>();
  private readonly growable = new Set<string>();

  constructor(readonly rules: readonly NamedRule[]) {
    const entries: PhraseEntry[] = [];
    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        const phrase = normalizePhrase(pattern);
        if (!phrase) continue;
        const entry: PhraseEntry = { phrase, words: phrase.split(" "), rule };
        entries.push(entry);
        const bucket = this.byPhrase.get(phrase);
        if (bucket) bucket.push(entry);
        else this.byPhrase.set(phrase, [entry]);
      }
    }
    for (const { words } of entries) {
      for (let k = 1; k < words.length; k++) this.growable.add(words.slice(0, k).join(" "));
    }
    this.entries = entries;
    this.maxWords = entries.reduce((max, entry) => Math.max(max, entry.words.length), 1);
  }

  /** Rules whose pattern equals the typed phrase. Case-sensitive custom rules compare raw text. */
  lookup(rawPhrase: string): NamedRule[] {
    const bucket = this.byPhrase.get(normalizePhrase(rawPhrase));
    if (!bucket) return [];
    const exact = collapseWhitespace(rawPhrase);
    return bucket
      .filter(({ rule }) => !rule.caseSensitive || rule.patterns.some((p) => collapseWhitespace(p) === exact))
      .map(({ rule }) => rule);
  }

  /**
   * True when a longer registered phrase starts with this one ("not equal" →
   * "not equal to"). Converting eagerly would strand the remaining words
   * ("≠ to"), so the engine downgrades such matches to suggestions.
   */
  canGrow(rawPhrase: string): boolean {
    return this.growable.has(normalizePhrase(rawPhrase));
  }

  withRules(extra: readonly NamedRule[]): RuleRegistry {
    return extra.length === 0 ? this : new RuleRegistry([...extra, ...this.rules]);
  }
}

/**
 * Compiles user rules (spec §30). Rules are only evaluated against freshly
 * typed text at a boundary and outputs are never re-fed into the matcher, so
 * chains like a→b, b→a cannot loop; identity rules are dropped outright.
 */
export function compileCustomRules(custom: readonly CustomRule[]): NamedRule[] {
  return custom
    .filter((rule) => rule.enabled && rule.input.trim() && rule.output && normalizePhrase(rule.input) !== normalizePhrase(rule.output))
    .map((rule) => ({
      id: `custom.${rule.id}`,
      category: "custom" as const,
      label: collapseWhitespace(rule.input),
      patterns: [rule.input],
      replacement: rule.output,
      mode: rule.triggerMode === "automatic" ? ("auto" as const) : ("suggest" as const),
      priority: PRIORITY.custom,
      confidence: rule.triggerMode === "automatic" ? 1 : 0.9,
      caseSensitive: rule.caseSensitive,
    }));
}

export function defaultRules(): NamedRule[] {
  return [...greekRules(), ...symbolRules(), ...scriptCommandRules()];
}

export function createDefaultRegistry(): RuleRegistry {
  return new RuleRegistry(defaultRules());
}
