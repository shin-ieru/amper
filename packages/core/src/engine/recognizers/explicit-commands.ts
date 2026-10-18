import { PRIORITY } from "@amper/rules";
import type { FormatSpan, Recognition, Rejection } from "../../types";
import { protectedNotationContext } from "./scientific-notation";

/**
 * Explicit formatting commands (sup(...), sub(...), frac(...)): the user states
 * intent, so nothing is guessed. They are whole commands with balanced
 * parentheses, start a word (never inside "lookup(" or "xsup("), and keep code,
 * markup, URL and path contexts literal. Output text is ordinary characters;
 * superscript/subscript are native host formatting spans.
 */
export type ExplicitCommand = "sup" | "sub" | "frac";

const OPENER = /(^|[\s([{])(sup|sub|frac)\(/gi;
const NESTED_COMMAND = /(?:^|[^\p{L}\p{N}])(?:sup|sub|frac)\(/iu;
/** Characters that may follow the closing parenthesis before the boundary ("x sup(2)."). */
const TRAILING = new Set([",", ";", ":", "!", "?", ".", "'", "\"", "’", "”"]);

interface Opener {
  keyword: ExplicitCommand;
  /** Line-relative index of the keyword. */
  keywordStart: number;
  /** Line-relative index of "(". */
  open: number;
}

function openers(line: string): Opener[] {
  return [...line.matchAll(OPENER)].map((m) => {
    const keywordStart = m.index + m[1]!.length;
    return { keyword: m[2]!.toLowerCase() as ExplicitCommand, keywordStart, open: keywordStart + m[2]!.length };
  });
}

function matchingClose(text: string, open: number): number | undefined {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return undefined;
}

/**
 * An explicit command that has been opened but not closed on the current line
 * ("E sup(activation"). While it is open, its content is literal: the engine
 * suspends every other rule so typed content is never converted mid-command.
 */
export function openExplicitCommand(text: string, from: number): ExplicitCommand | undefined {
  const line = text.slice(from);
  const all = openers(line);
  const last = all.at(-1);
  if (!last) return undefined;
  // The last command is still open, or a frac(...) is still open around closed inner commands
  // ("frac(P sub(0.5 atm) / P").
  const opener = matchingClose(line, last.open) === undefined
    ? last
    : all.findLast((o) => o.keyword === "frac" && matchingClose(line, o.open) === undefined);
  if (!opener) return undefined;
  if (protectedNotationContext(text, from, from + opener.keywordStart)) return undefined;
  return opener.keyword;
}

export function recognizeExplicitCommand(text: string, from: number, rejections: Rejection[]): Recognition[] {
  const line = text.slice(from);
  // The outermost command whose ")" ends the line, before any trailing punctuation.
  let close = line.length - 1;
  while (close >= 0 && TRAILING.has(line[close]!)) close--;
  if (line[close] !== ")") return [];
  const opener = openers(line).find((o) => matchingClose(line, o.open) === close);
  if (!opener) return [];
  const trailing = line.slice(close + 1);

  const keywordAt = from + opener.keywordStart;
  const typed = text.slice(keywordAt);
  const content = line.slice(opener.open + 1, close);
  const reject = (reason: string) => {
    rejections.push({ recognizer: "named", candidate: typed, reason });
    return [];
  };
  if (!content.trim()) return reject(`empty ${opener.keyword}() stays literal`);
  const context = protectedNotationContext(text, from, keywordAt);
  if (context) return reject(context);

  if (opener.keyword === "frac") {
    const fraction = renderFraction(content);
    if (typeof fraction === "string") return reject(fraction);
    return [command("frac", keywordAt, typed, fraction.text + trailing, fraction.formatting)];
  }
  if (NESTED_COMMAND.test(content)) return reject("nested commands are not supported in sup()/sub(); left literal");

  // "x sup(2)": a command separated from the preceding word by one space attaches to it (x²).
  const style = opener.keyword === "sup" ? "superscript" : "subscript";
  const before = line.slice(0, opener.keywordStart);
  const attaches = before.endsWith(" ") && before.length >= 2 && !/[\s([{]/.test(before[before.length - 2]!);
  const start = attaches ? keywordAt - 1 : keywordAt;
  const replacement = content + trailing;
  return [
    command(opener.keyword, start, text.slice(start), replacement, [{ start: 0, end: content.length, style }], attaches),
  ];
}

/** sup(...)/sub(...) inside a frac(...) operand; the lookbehind keeps "(" and spaces in the text. */
const INNER_OPENER = /(?<=^|[\s([{])(sup|sub|frac)\(/gi;

/** Positions of "/" outside any parentheses (nested commands, "(n+1)"). */
function topLevelSlashes(content: string): number[] {
  const slashes: number[] = [];
  let depth = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "(") depth++;
    else if (content[i] === ")") depth--;
    else if (content[i] === "/" && depth === 0) slashes.push(i);
  }
  return slashes;
}

/**
 * One frac(...) operand: literal text plus sup(...)/sub(...) commands, which follow the
 * top-level rules (one separating space attaches, non-empty content, no further nesting).
 */
function renderOperand(raw: string): { text: string; formatting: FormatSpan[] } | string {
  let text = "";
  const formatting: FormatSpan[] = [];
  let pos = 0;
  INNER_OPENER.lastIndex = 0;
  for (let m = INNER_OPENER.exec(raw); m; m = INNER_OPENER.exec(raw)) {
    if (m.index < pos) continue;
    const keyword = m[1]!.toLowerCase();
    if (keyword === "frac") return "a frac() inside frac() is not supported; left literal";
    const open = m.index + keyword.length;
    const close = matchingClose(raw, open);
    if (close === undefined) return `unclosed ${keyword}() inside frac()`;
    const inner = raw.slice(open + 1, close);
    if (!inner.trim()) return `empty ${keyword}() inside frac() stays literal`;
    if (NESTED_COMMAND.test(inner)) return "commands nested inside a frac() operand command are not supported";
    text += raw.slice(pos, m.index);
    if (text.endsWith(" ") && text.length >= 2 && !/[\s([{]/.test(text[text.length - 2]!)) text = text.slice(0, -1);
    formatting.push({ start: text.length, end: text.length + inner.length, style: keyword === "sup" ? "superscript" : "subscript" });
    text += inner;
    pos = close + 1;
    INNER_OPENER.lastIndex = pos;
  }
  return { text: text + raw.slice(pos), formatting };
}

/**
 * frac(numerator/denominator), split at the one top-level "/", as an inline fraction joined by
 * U+2044 with the spacing typed around the slash kept exactly ("x/y" → x⁄y, "x / y" → x ⁄ y).
 * Native Docs formatting has a single vertical level per character, so:
 *  - operands without inner commands ("12/24", "dx/dt", "0.5 atm / 1 bar") are raised and lowered
 *    whole: numerator superscript, U+2044 and the spacing at baseline, denominator subscript;
 *  - operands with inner sup()/sub() ("P sub(0.5 atm) / P sub(1 bar)") cannot be raised or lowered
 *    without losing those scripts, so they stay at baseline with their own native scripts.
 */
function renderFraction(content: string): { text: string; formatting: FormatSpan[] } | string {
  const slashes = topLevelSlashes(content);
  if (slashes.length !== 1) return "frac() needs exactly one top-level / between numerator and denominator";
  const numeratorRaw = content.slice(0, slashes[0]).trimStart();
  const denominatorRaw = content.slice(slashes[0]! + 1).trimEnd();
  if (!numeratorRaw.trim() || !denominatorRaw.trim()) return "frac() needs a numerator and a denominator";
  const numerator = renderOperand(numeratorRaw);
  if (typeof numerator === "string") return numerator;
  const denominator = renderOperand(denominatorRaw);
  if (typeof denominator === "string") return denominator;

  const offset = numerator.text.length + 1;
  if (numerator.formatting.length === 0 && denominator.formatting.length === 0) {
    // The spacing around the slash stays baseline; only the operands themselves are scripted.
    const n = numerator.text.trimEnd();
    const leading = denominator.text.length - denominator.text.trimStart().length;
    return {
      text: `${numerator.text}⁄${denominator.text}`,
      formatting: [
        { start: 0, end: n.length, style: "superscript" },
        { start: offset + leading, end: offset + denominator.text.length, style: "subscript" },
      ],
    };
  }
  return {
    text: `${numerator.text}⁄${denominator.text}`,
    formatting: [
      ...numerator.formatting,
      ...denominator.formatting.map((span) => ({ ...span, start: span.start + offset, end: span.end + offset })),
    ],
  };
}

function command(
  keyword: ExplicitCommand,
  start: number,
  original: string,
  replacement: string,
  formatting: FormatSpan[],
  attached = false,
): Recognition {
  return {
    recognizer: "named",
    ruleId: `command.${keyword}`,
    category: "symbol",
    start,
    end: start + original.length,
    original,
    replacement,
    confidence: 1,
    priority: PRIORITY.command,
    label: `${keyword}(…)`,
    reasons: [
      `explicit ${keyword}(...) command`,
      ...(attached ? ["attached to the preceding word"] : []),
      "native host formatting; the syntax is removed",
    ],
    formatting,
  };
}

/** "25degC", "-20degC", "36.5degC", "98.6degF", "90deg": number glued to an explicit temperature shortcut. */
const NUMERIC_TEMPERATURE = /^([+\-−]?\d+(?:\.\d+)?)deg([CF]?)$/i;
const TEMPERATURE_UNIT: Record<string, string> = { "": "°", c: "°C", f: "°F" };

/**
 * The user's spacing is preserved ("25degC" → "25°C", "100 degC" → "100 °C" via
 * the named rule). There is no kelvin shortcut: SI writes "298 K" with no degree
 * sign, which the user types directly. Bare C/F/K are not touched.
 */
export function recognizeNumericTemperature(text: string, from: number, rejections: Rejection[]): Recognition[] {
  const last = text.slice(from).match(/(\S+)$/);
  if (!last) return [];
  const token = last[1]!.replace(/[.,;:!?"'”’]+$/, "");
  const match = NUMERIC_TEMPERATURE.exec(token);
  if (!match) return [];
  const start = text.length - last[1]!.length;
  const context = protectedNotationContext(text, from, start);
  if (context) {
    rejections.push({ recognizer: "named", candidate: token, reason: context });
    return [];
  }
  const unit = TEMPERATURE_UNIT[match[2]!.toLowerCase()]!;
  const replacement = `${match[1]!}${unit}`;
  return [
    {
      recognizer: "named",
      ruleId: `temperature.numeric.${match[2]!.toLowerCase() || "deg"}`,
      category: "unit",
      start,
      end: start + token.length,
      original: token,
      replacement,
      confidence: 1,
      priority: PRIORITY.command,
      label: replacement,
      reasons: ["explicit deg shortcut after a number"],
    },
  ];
}
