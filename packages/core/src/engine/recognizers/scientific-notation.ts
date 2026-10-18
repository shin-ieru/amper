import { parseFormula } from "@amper/chemistry";
import { formulaToUnicode } from "@amper/renderer";
import { PRIORITY, type RuleRegistry } from "@amper/rules";
import type { Recognition, Rejection } from "../../types";
import { lineStart, previousWord, trimFormulaToken, wordTokens } from "../text";

/** Canonical Unicode superscripts accepted after a caret in numeric exponents. */
export const CARET_SUPERSCRIPT_TABLE = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
} as const;

/**
 * Canonical Unicode subscripts accepted after an explicit underscore. The
 * alphabetic entries are limited to characters with named Unicode subscript
 * forms; unsupported letters are never approximated.
 */
export const EXPLICIT_SUBSCRIPT_TABLE = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  a: "ₐ",
  e: "ₑ",
  h: "ₕ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  l: "ₗ",
  m: "ₘ",
  n: "ₙ",
  o: "ₒ",
  p: "ₚ",
  r: "ᵣ",
  s: "ₛ",
  t: "ₜ",
  u: "ᵤ",
  v: "ᵥ",
  x: "ₓ",
  "ə": "ₔ",
  "β": "ᵦ",
  "γ": "ᵧ",
  "ρ": "ᵨ",
  "φ": "ᵩ",
  "χ": "ᵪ",
} as const;

/** Canonical ASCII digit class for positive integer fraction operands. */
export const FRACTION_NUMERIC_DIGITS = [..."0123456789"] as const;
/** Canonical variable class: one lowercase Latin symbol per operand. */
export const FRACTION_LATIN_VARIABLES = [..."abcdefghijklmnopqrstuvwxyz"] as const;
/** Greek variables are held literal until their real Docs input path is reliable. */
export const FRACTION_GREEK_VARIABLES = [] as const;
const FRACTION_VARIABLES: ReadonlySet<string> = new Set([...FRACTION_LATIN_VARIABLES, ...FRACTION_GREEK_VARIABLES]);

/** Lowercase single-letter labels whose slash form is usually not a fraction. */
export const FRACTION_SLASH_PROTECTED_PAIRS: ReadonlySet<string> = new Set([
  "a/c", // account / air conditioning
  "b/c", // because
  "c/o", // care of
  "d/c", // direct current
  "e/g", // for example (usually written e.g.)
  "i/e", // that is (usually written i.e.)
  "m/h", // metres per hour
  "m/s", // metres per second
  "n/a", // not applicable / not available
  "n/m", // nanometres / metre
  "n/s", // per second
  "p/s", // per second
  "r/s", // radians per second
  "s/t", // subject to
  "w/o", // without
]);

const PROTECTED_SLASH_LABELS = new Set([
  "and/or",
  "before/after",
  "cm/s",
  "ft/s",
  "g/mol",
  "in/out",
  "input/output",
  "kg/mol",
  "km/h",
  "km/s",
  "l/min",
  "mi/h",
  "ml/min",
  "m/h",
  "mm/s",
  "mol/l",
  "m/s2",
  "on/off",
  "pass/fail",
  "true/false",
  "yes/no",
]);

const CONTEXT_LABELS = new Set([
  "code", "directory", "file", "filename", "folder", "href", "identifier", "id", "link", "path", "src", "url",
]);

const CODE_PREFIX = /\b(?:class|const|export|for|function|if|import|let|return|throw|var|while)\s+[^;\n]*$/i;
const PATH_PREFIX = /(?:^|\s)(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^\s]*$/;
const MARKUP_TAG = /<\/?[A-Za-z][^>]*>/;
const CARET_EXPONENT = /^([A-Za-z][A-Za-z0-9]*|\d+(?:\.\d+)?)\^([+-]?)(\d+)$/;
const FRACTION_DIGIT = `[${FRACTION_NUMERIC_DIGITS.join("")}]`;
const FRACTION_VARIABLE = `[${FRACTION_LATIN_VARIABLES.join("")}]`;
const FRACTION_OPERAND = `(?:${FRACTION_DIGIT}+|${FRACTION_VARIABLE})`;
/** Atomic fraction operands: one integer or one lowercase Latin variable on each side (the bare a/b suggestion). */
export const SIMPLE_FRACTION = new RegExp(`^(${FRACTION_OPERAND})/(${FRACTION_OPERAND})$`);
const EXPLICIT_SUBSCRIPT = /^(\p{L})_([+-]?\d+|\p{L}+)$/u;
const DELIMITED_SCRIPT_START = /(^|\s)([\p{L}\p{N}]+)([_^])\(/gu;
const SCRIPT_TRAILING_PUNCTUATION = new Set([",", ";", ":", "!", "?", ".", "'", "\"", "’", "”"]);

/**
 * Scientific notation shorthand recognizer. It shares the engine's normal
 * safe-boundary extraction and rewrite path, so the input remains reversible.
 */
export function recognizeScientificNotation(
  text: string,
  from: number,
  rejections: Rejection[],
  registry: RuleRegistry,
  greekEnabled: boolean,
): Recognition[] {
  const phrase = recognizeDelimitedScriptPhrase(text, from, rejections, registry, greekEnabled);
  if (phrase) return [phrase];

  const tokens = wordTokens(text, from);
  const token = tokens[tokens.length - 1];
  if (!token || token.end !== text.length) return [];

  const span = trimFormulaToken(text, token.start, token.end);
  const candidate = text.slice(span.start, span.end);
  if (!candidate) return [];

  const exponent = CARET_EXPONENT.exec(candidate);
  if (exponent) {
    const [, base, sign, digits] = exponent;
    const exponentText = `${sign ?? ""}${digits!}`;
    const replacement = `${base!}${[...exponentText].map((ch) => CARET_SUPERSCRIPT_TABLE[ch as keyof typeof CARET_SUPERSCRIPT_TABLE]).join("")}`;

    // Chemical caret charges are interpreted by the species parser. Keep this
    // recognizer from claiming a valid species even if that category is off.
    const parsed = parseFormula(candidate);
    if (parsed.ok && parsed.value.charge?.notation === "caret") return [];

    return [
      {
        recognizer: "formula",
        ruleId: "scientific.superscript.caret",
        category: "formula",
        start: span.start,
        end: span.end,
        original: candidate,
        replacement,
        confidence: 0.97,
        priority: PRIORITY.formula,
        label: replacement,
        reasons: ["explicit caret followed by a numeric exponent", "Unicode superscript mapping is exact"],
      },
    ];
  }

  if (PROTECTED_SLASH_LABELS.has(candidate.toLowerCase())) {
    rejections.push({ recognizer: "formula", candidate, reason: "common slash-delimited label or unit" });
    return [];
  }

  const fraction = SIMPLE_FRACTION.exec(candidate);
  if (fraction) {
    const [numerator, denominator] = [fraction[1]!, fraction[2]!];
    const pair = `${numerator}/${denominator}`;
    const contextReason = protectedFractionContext(text, from, span.start, pair);
    if (contextReason) {
      rejections.push({ recognizer: "formula", candidate, reason: contextReason });
      return [];
    }

    const isNumericOperand = (operand: string) => [...operand].every((digit) => FRACTION_NUMERIC_DIGITS.includes(digit as (typeof FRACTION_NUMERIC_DIGITS)[number]));
    const isVariableOperand = (operand: string) => FRACTION_VARIABLES.has(operand);
    if (!(isNumericOperand(numerator) || isVariableOperand(numerator))) return [];
    if (!(isNumericOperand(denominator) || isVariableOperand(denominator))) return [];
    const replacement = `${numerator}⁄${denominator}`;

    return [
      {
        recognizer: "formula",
        ruleId: "scientific.fraction.simple",
        category: "formula",
        start: span.start,
        end: span.end,
        original: candidate,
        replacement,
        formatting: [
          { start: 0, end: numerator.length, style: "superscript" },
          { start: numerator.length + 1, end: numerator.length + 1 + denominator.length, style: "subscript" },
        ],
        // Bare a/b is offered, never applied: slashes are too common in prose (24/7, 50/50, 10/06,
        // y/n, p/e). frac(a/b) is the explicit, automatic form.
        confidence: 0.85,
        priority: PRIORITY.formula,
        label: `${replacement} (fraction)`,
        reasons: [
          "each side is one atomic integer or lowercase Latin variable",
          "native Docs formatting preserves the original operands",
          "bare slash is ambiguous: suggestion only (frac(a/b) converts automatically)",
        ],
      },
    ];
  }

  const subscript = EXPLICIT_SUBSCRIPT.exec(candidate);
  if (!subscript) return [];

  const [, base, suffix] = subscript;
  const mappedSuffix = [...suffix!].map((ch) => EXPLICIT_SUBSCRIPT_TABLE[ch as keyof typeof EXPLICIT_SUBSCRIPT_TABLE]);
  if (mappedSuffix.some((glyph) => glyph === undefined)) return [];

  const contextReason = protectedExplicitSubscriptContext(text, from, span.start);
  if (contextReason) {
    rejections.push({ recognizer: "formula", candidate, reason: contextReason });
    return [];
  }

  const replacement = `${base!}${mappedSuffix.join("")}`;
  return [
    {
      recognizer: "formula",
      ruleId: "scientific.subscript.explicit",
      category: "formula",
      start: span.start,
      end: span.end,
      original: candidate,
      replacement,
      confidence: 0.97,
      priority: PRIORITY.formula,
      label: replacement,
      reasons: ["explicit underscore subscript", "every subscript character has an exact Unicode mapping"],
    },
  ];
}

function recognizeDelimitedScriptPhrase(
  text: string,
  from: number,
  rejections: Rejection[],
  registry: RuleRegistry,
  greekEnabled: boolean,
): Recognition | undefined {
  const line = text.slice(from);
  DELIMITED_SCRIPT_START.lastIndex = 0;
  let match: RegExpExecArray | null = null;
  for (const current of line.matchAll(DELIMITED_SCRIPT_START)) match = current;
  if (!match) return undefined;

  const [, separator, typedBase, marker] = match;
  const open = match.index + match[0].length - 1;
  const close = matchingClose(line, open);
  if (close === undefined) return undefined;
  const phrase = line.slice(open + 1, close);
  const trailing = line.slice(close + 1);
  if (!phrase.trim() || [...trailing].some((character) => !SCRIPT_TRAILING_PUNCTUATION.has(character))) return undefined;

  const start = from + match.index + separator!.length;
  const candidate = text.slice(start);
  const contextReason = protectedExplicitSubscriptContext(text, from, start);
  if (contextReason) {
    rejections.push({ recognizer: "formula", candidate, reason: contextReason });
    return undefined;
  }

  const base = formatExplicitScriptBase(typedBase!, registry, greekEnabled);
  const replacement = base + phrase + trailing;
  const style = marker === "_" ? "subscript" : "superscript";
  return {
    recognizer: "formula",
    ruleId: `scientific.${style}.phrase`,
    category: "formula",
    start,
    end: text.length,
    original: candidate,
    replacement,
    confidence: 0.99,
    priority: PRIORITY.formula,
    label: replacement,
    reasons: [`explicit ${style} phrase delimited by parentheses`, "Docs-native formatting preserves arbitrary text exactly"],
    formatting: [{ start: base.length, end: base.length + phrase.length, style }],
  };
}

function formatExplicitScriptBase(base: string, registry: RuleRegistry, greekEnabled: boolean): string {
  const parsed = parseFormula(base);
  if (parsed.ok) return formulaToUnicode(parsed.value);
  return greekEnabled ? convertGreekNamePrefix(base, registry) : base;
}

function matchingClose(text: string, open: number): number | undefined {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const character = text[index];
    if (character === "(") depth++;
    else if (character === ")") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return undefined;
}

/** A named Greek letter at the start of a scientific base may be concatenated (DeltaH → ΔH). */
function convertGreekNamePrefix(base: string, registry: RuleRegistry): string {
  const rules = registry.rules.filter((rule) => rule.id.startsWith("greek.bare."));
  const matching = rules
    .map((rule) => ({ rule, name: rule.patterns[0]! }))
    .filter(({ name }) => base.toLowerCase().startsWith(name))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!matching) return base;

  const { rule, name } = matching;
  const typedName = base.slice(0, name.length);
  const rest = base.slice(name.length);
  if (rest && !/^\p{Lu}/u.test(rest)) return base;

  const titleCase = typedName[0] === typedName[0]!.toUpperCase() && typedName.slice(1) === typedName.slice(1).toLowerCase();
  const capitalRule = titleCase ? registry.rules.find((candidate) => candidate.id === rule.id.replace("greek.bare.", "greek.capital.")) : undefined;
  return `${capitalRule?.replacement ?? rule.replacement}${rest}`;
}

function protectedFractionContext(text: string, from: number, start: number, pair: string): string | undefined {
  const normalized = pair.toLowerCase();
  if (FRACTION_SLASH_PROTECTED_PAIRS.has(normalized)) {
    return "common slash-delimited label or unit";
  }

  const prefix = text.slice(lineStart(text), start);
  if (insideMarkdownCode(text, start)) return "inside inline or fenced code";
  if (MARKUP_TAG.test(prefix) || prefix.lastIndexOf("<") > prefix.lastIndexOf(">")) return "inside markup";
  if (CODE_PREFIX.test(prefix)) return "inside a code-like statement";
  if (PATH_PREFIX.test(prefix)) return "inside a filesystem path";
  if (/https?:\/\/\S*$/i.test(prefix) || /\bwww\.\S*$/i.test(prefix)) return "inside a URL";

  const before = previousWord(text, start, from);
  if (before && CONTEXT_LABELS.has(before)) return `follows path, markup, code, or identifier label "${before}"`;
  return undefined;
}

/** Code, markup, path, URL or identifier-label context: explicit notation stays literal there. */
export function protectedNotationContext(text: string, from: number, start: number): string | undefined {
  return protectedExplicitSubscriptContext(text, from, start);
}

function protectedExplicitSubscriptContext(text: string, from: number, start: number): string | undefined {
  const prefix = text.slice(lineStart(text), start);
  if (insideMarkdownCode(text, start)) return "inside inline or fenced code";
  if (MARKUP_TAG.test(prefix) || prefix.lastIndexOf("<") > prefix.lastIndexOf(">")) return "inside markup";
  if (CODE_PREFIX.test(prefix)) return "inside a code-like statement";
  if (PATH_PREFIX.test(prefix)) return "inside a filesystem path";
  if (/https?:\/\/\S*$/i.test(prefix) || /\bwww\.\S*$/i.test(prefix)) return "inside a URL";

  const before = previousWord(text, start, from);
  if (before && CONTEXT_LABELS.has(before)) return `follows path, markup, code, or identifier label "${before}"`;
  return undefined;
}

function insideMarkdownCode(text: string, start: number): boolean {
  const prefix = text.slice(0, start);
  const linePrefix = prefix.slice(lineStart(prefix));
  if ((linePrefix.match(/`/g)?.length ?? 0) % 2 === 1) return true;

  // Fenced blocks can begin on an earlier line. The engine only sees a short
  // recent context window, which is enough to find a normal opening fence.
  let fenced = false;
  for (const line of prefix.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fenced = !fenced;
  }
  return fenced;
}
