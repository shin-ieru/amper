import { compileCustomRules, createDefaultRegistry, normalizePhrase, type CustomRule, type RuleRegistry } from "@chemly/rules";
import { confidenceBand, SUGGEST_THRESHOLD } from "../confidence/policy";
import type {
  ChemlySettings,
  ChemlySuggestion,
  ChemlyTrigger,
  DebugInfo,
  EngineDecision,
  Recognition,
  Rejection,
  ToggleableCategory,
} from "../types";
import { completePhrase, fuzzyPhrase } from "./complete";
import { recognizeFormula } from "./recognizers/formula";
import { recognizeNamed } from "./recognizers/named";
import { CONTEXT_CHARS_BEFORE, lineStart } from "./text";

export interface EvaluateInput {
  /** Text before the caret, excluding the boundary character that triggered evaluation. */
  textBefore: string;
  trigger: ChemlyTrigger;
}

export interface ChemlyEngine {
  /** Decide what to do at a boundary (spec §32 pipeline). Pure and deterministic. */
  evaluate(input: EvaluateInput, settings: ChemlySettings): EngineDecision;
  /** Non-destructive completions for a partially typed phrase at the caret. */
  complete(textBefore: string, settings: ChemlySettings): ChemlySuggestion[];
  readonly registry: RuleRegistry;
}

export interface EngineOptions {
  registry?: RuleRegistry;
}

type Clock = { now(): number };
const clock: Clock = (globalThis as { performance?: Clock }).performance ?? Date;

export function createEngine(options: EngineOptions = {}): ChemlyEngine {
  const base = options.registry ?? createDefaultRegistry();
  const withCustom = new WeakMap<readonly CustomRule[], RuleRegistry>();

  const registryFor = (settings: ChemlySettings): RuleRegistry => {
    if (!settings.categories.custom || settings.customRules.length === 0) return base;
    let registry = withCustom.get(settings.customRules);
    if (!registry) {
      registry = base.withRules(compileCustomRules(settings.customRules));
      withCustom.set(settings.customRules, registry);
    }
    return registry;
  };

  const contextWindow = (text: string) => {
    const bounded = text.length > CONTEXT_CHARS_BEFORE ? text.slice(-CONTEXT_CHARS_BEFORE) : text;
    return { text: bounded, offset: text.length - bounded.length, from: lineStart(bounded) };
  };

  function evaluate(input: EvaluateInput, settings: ChemlySettings): EngineDecision {
    const started = clock.now();
    const { text, offset, from } = contextWindow(input.textBefore);
    const rejections: Rejection[] = [];
    const debug = (recognitions: Recognition[]): DebugInfo => ({
      text,
      recognitions,
      rejections,
      elapsedMs: clock.now() - started,
    });

    if (!settings.enabled) return { action: "none", debug: debug([]) };

    const registry = registryFor(settings);
    const enabled = settings.categories;
    const never = new Set(settings.neverConvert.map(normalizePhrase));

    const all = [
      ...recognizeNamed(text, from, registry, rejections),
      ...(enabled.formula ? recognizeFormula(text, from, settings.mode, rejections) : []),
    ];
    const recognitions = all
      .filter((r) => {
        if (isToggleable(r.category) && !enabled[r.category]) return false;
        if (never.has(normalizePhrase(r.original))) {
          rejections.push({ recognizer: r.recognizer, candidate: r.original, reason: "on the never-convert list" });
          return false;
        }
        return true;
      })
      .map((r) => shift(r, offset))
      // Conflict resolution (spec §54): priority, then longer span, then confidence.
      .sort((a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start) || b.confidence - a.confidence);

    const best = recognitions[0];
    if (best && settings.autoConvert && confidenceBand(best.confidence) === "auto") {
      return { action: "autocorrect", recognition: best, debug: debug(recognitions) };
    }

    const suggestions = dedupe(
      recognitions.filter((r) => r.confidence >= SUGGEST_THRESHOLD).map(recognitionToSuggestion),
    );
    if (suggestions.length === 0 && recognitions.length === 0) {
      suggestions.push(...fuzzyPhrase(text, from, registry, enabled).map((s) => shiftSuggestion(s, offset)));
    }
    if (suggestions.length > 0) return { action: "suggest", suggestions, debug: debug(recognitions) };
    return { action: "none", debug: debug(recognitions) };
  }

  function complete(textBefore: string, settings: ChemlySettings): ChemlySuggestion[] {
    if (!settings.enabled || !settings.autocomplete) return [];
    const { text, offset, from } = contextWindow(textBefore);
    const never = new Set(settings.neverConvert.map(normalizePhrase));
    return completePhrase(text, from, registryFor(settings), settings.categories)
      .filter((s) => !never.has(normalizePhrase(s.original)))
      .map((s) => shiftSuggestion(s, offset));
  }

  return { evaluate, complete, registry: base };
}

function isToggleable(category: string): category is ToggleableCategory {
  return category === "greek" || category === "symbol" || category === "formula" || category === "custom";
}

function shift(r: Recognition, offset: number): Recognition {
  return offset === 0 ? r : { ...r, start: r.start + offset, end: r.end + offset };
}

function shiftSuggestion(s: ChemlySuggestion, offset: number): ChemlySuggestion {
  return offset === 0 ? s : { ...s, start: s.start + offset, end: s.end + offset };
}

export function recognitionToSuggestion(r: Recognition): ChemlySuggestion {
  return {
    ruleId: r.ruleId,
    category: r.category,
    label: r.recognizer === "formula" ? r.replacement : r.label,
    original: r.original,
    replacement: r.replacement,
    confidence: r.confidence,
    start: r.start,
    end: r.end,
    source: "ambiguous",
  };
}

function dedupe(suggestions: ChemlySuggestion[]): ChemlySuggestion[] {
  const seen = new Set<string>();
  return suggestions.filter((s) => {
    const key = `${s.start}:${s.end}:${s.replacement}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
