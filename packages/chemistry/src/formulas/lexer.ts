import { isElementSymbol } from "../elements";
import type { PhysicalState } from "./ast";

export type NumberScript = "ascii" | "subscript" | "superscript";

export type FormulaToken =
  | { kind: "element"; symbol: string; start: number; end: number }
  | { kind: "number"; value: number; digits: string; script: NumberScript; start: number; end: number }
  | { kind: "open"; bracket: "paren" | "square"; start: number; end: number }
  | { kind: "close"; bracket: "paren" | "square"; start: number; end: number }
  | { kind: "caret"; start: number; end: number }
  | { kind: "sign"; sign: "+" | "-"; script: "ascii" | "superscript"; start: number; end: number }
  /** Adduct/hydrate separator: "·" (and look-alikes) or ASCII "*". */
  | { kind: "dot"; raw: string; start: number; end: number }
  | { kind: "state"; state: PhysicalState; start: number; end: number };

export interface LexError {
  message: string;
  position: number;
}

export type LexResult = { ok: true; tokens: FormulaToken[] } | { ok: false; error: LexError };

/** Counts above this many digits are never chemistry ("ISO9001", "H264" fail elsewhere too). */
export const MAX_NUMBER_DIGITS = 3;

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";
/** Middle dot plus look-alikes users paste (bullet, bullet operator, dot operator) and ASCII "*". */
const DOTS = new Set(["·", "•", "∙", "⋅", "*"]);
/** Phase descriptors (spec §15). Checked before "(" is read as a group. */
const STATES: readonly PhysicalState[] = ["aq", "s", "l", "g"];

function digitValue(ch: string): { value: number; script: NumberScript } | undefined {
  if (ch >= "0" && ch <= "9") return { value: ch.charCodeAt(0) - 48, script: "ascii" };
  const sub = SUBSCRIPT_DIGITS.indexOf(ch);
  if (sub >= 0) return { value: sub, script: "subscript" };
  const sup = SUPERSCRIPT_DIGITS.indexOf(ch);
  if (sup >= 0) return { value: sup, script: "superscript" };
  return undefined;
}

const isUpper = (ch: string | undefined) => ch !== undefined && ch >= "A" && ch <= "Z";
const isLower = (ch: string | undefined) => ch !== undefined && ch >= "a" && ch <= "z";

/**
 * Tokenises a chemical species. Element symbols are matched against the IUPAC
 * set, so a capital letter can only begin a symbol and a lowercase letter can
 * only continue one; the split is deterministic without backtracking ("Co" is
 * cobalt, "CO" is carbon + oxygen, "Cx" is an error).
 *
 * Already-rendered sub/superscript digits and signs are accepted so that
 * re-evaluating "H₂O" or "Fe³⁺" is a recognised no-op rather than a failure.
 * The lexer assigns no meaning to numbers; the parser decides count vs charge
 * vs mass number from position, and records how a charge was written.
 */
export function lexFormula(input: string): LexResult {
  const tokens: FormulaToken[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;

    if (isUpper(ch)) {
      const next = input[i + 1];
      if (isLower(next) && isElementSymbol(ch + next)) {
        tokens.push({ kind: "element", symbol: ch + next, start: i, end: i + 2 });
        i += 2;
        continue;
      }
      if (isElementSymbol(ch) && !isLower(next)) {
        tokens.push({ kind: "element", symbol: ch, start: i, end: i + 1 });
        i += 1;
        continue;
      }
      const attempted = isLower(next) ? ch + next : ch;
      return { ok: false, error: { message: `unknown element symbol "${attempted}"`, position: i } };
    }

    const digit = digitValue(ch);
    if (digit) {
      const start = i;
      let value = 0;
      while (i < input.length) {
        const d = digitValue(input[i]!);
        if (!d || d.script !== digit.script) break;
        value = value * 10 + d.value;
        i += 1;
      }
      const raw = input.slice(start, i);
      if (raw.length > 1 && digitValue(raw[0]!)?.value === 0) {
        return { ok: false, error: { message: "number has a leading zero", position: start } };
      }
      if (raw.length > MAX_NUMBER_DIGITS) {
        return { ok: false, error: { message: "number is too long to be a count", position: start } };
      }
      const digits = [...raw].map((d) => String(digitValue(d)!.value)).join("");
      tokens.push({ kind: "number", value, digits, script: digit.script, start, end: i });
      continue;
    }

    if (ch === "(") {
      const state = STATES.find((s) => input.startsWith(`(${s})`, i));
      if (state) {
        tokens.push({ kind: "state", state, start: i, end: i + state.length + 2 });
        i += state.length + 2;
        continue;
      }
    }
    if (ch === "(" || ch === "[") {
      tokens.push({ kind: "open", bracket: ch === "(" ? "paren" : "square", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === ")" || ch === "]") {
      tokens.push({ kind: "close", bracket: ch === ")" ? "paren" : "square", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === "^") {
      tokens.push({ kind: "caret", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "−") {
      tokens.push({ kind: "sign", sign: ch === "+" ? "+" : "-", script: "ascii", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (ch === "⁺" || ch === "⁻") {
      tokens.push({ kind: "sign", sign: ch === "⁺" ? "+" : "-", script: "superscript", start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (DOTS.has(ch)) {
      tokens.push({ kind: "dot", raw: ch, start: i, end: i + 1 });
      i += 1;
      continue;
    }

    return { ok: false, error: { message: `unexpected character "${ch}"`, position: i } };
  }
  return { ok: true, tokens };
}
