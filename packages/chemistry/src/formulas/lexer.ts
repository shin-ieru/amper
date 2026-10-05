import { isElementSymbol } from "../elements";

export type FormulaToken =
  | { kind: "element"; symbol: string; start: number; end: number }
  | { kind: "number"; value: number; script: "ascii" | "subscript"; start: number; end: number }
  | { kind: "open"; bracket: "paren" | "square"; start: number; end: number }
  | { kind: "close"; bracket: "paren" | "square"; start: number; end: number };

export interface LexError {
  message: string;
  position: number;
}

export type LexResult = { ok: true; tokens: FormulaToken[] } | { ok: false; error: LexError };

/** Counts above this many digits are never chemistry ("ISO9001", "H264" fail elsewhere too). */
export const MAX_NUMBER_DIGITS = 3;

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

function digitValue(ch: string): { value: number; script: "ascii" | "subscript" } | undefined {
  if (ch >= "0" && ch <= "9") return { value: ch.charCodeAt(0) - 48, script: "ascii" };
  const sub = SUBSCRIPT_DIGITS.indexOf(ch);
  if (sub >= 0) return { value: sub, script: "subscript" };
  return undefined;
}

const isUpper = (ch: string | undefined) => ch !== undefined && ch >= "A" && ch <= "Z";
const isLower = (ch: string | undefined) => ch !== undefined && ch >= "a" && ch <= "z";

/**
 * Tokenises a formula. Element symbols are matched against the IUPAC set, so a
 * capital letter can only begin a symbol and a lowercase letter can only
 * continue one; that makes the split deterministic without backtracking
 * ("Co" is cobalt, "CO" is carbon + oxygen, "Cx" is an error).
 *
 * Already-rendered subscript digits are accepted so that re-evaluating "H₂O"
 * is a recognised no-op rather than a parse failure.
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
      tokens.push({ kind: "number", value, script: digit.script, start, end: i });
      continue;
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

    return { ok: false, error: { message: `unexpected character "${ch}"`, position: i } };
  }
  return { ok: true, tokens };
}
