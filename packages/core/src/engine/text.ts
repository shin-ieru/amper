/**
 * Candidate extraction helpers. Everything here works on the bounded window of
 * text before the caret; nothing scans a whole document.
 */

export const CONTEXT_CHARS_BEFORE = 256;
export const CONTEXT_CHARS_AFTER = 96;

const WHITESPACE = /[\s ]/;

/** Boundary characters that end a token and trigger destructive evaluation (spec §6). */
export function boundaryTrigger(text: string): "space" | "enter" | undefined {
  if (text === " " || text === " ") return "space";
  if (text === "\n" || text === "\r") return "enter";
  return undefined;
}

export function lineStart(text: string): number {
  return Math.max(text.lastIndexOf("\n"), text.lastIndexOf("\r")) + 1;
}

export interface WordToken {
  text: string;
  start: number;
  end: number;
}

/** Whitespace-delimited tokens of text[from..]. */
export function wordTokens(text: string, from = 0): WordToken[] {
  const tokens: WordToken[] = [];
  let start = -1;
  for (let i = from; i <= text.length; i++) {
    const isSpace = i === text.length || WHITESPACE.test(text[i]!);
    if (isSpace && start >= 0) {
      tokens.push({ text: text.slice(start, i), start, end: i });
      start = -1;
    } else if (!isSpace && start < 0) {
      start = i;
    }
  }
  return tokens;
}

const LEADING_OPENERS = /^["'“‘(\[{]+/;
const TRAILING_PUNCTUATION = /[.,;:!?"'”’)\]}]+$/;
const TRAILING_SENTENCE_PUNCTUATION = /[.,;:!?"'”’]+$/;
const LEADING_QUOTES = /^["'“‘]+/;

/** Trims quotes/brackets/sentence punctuation around a phrase; returns the inner span. */
export function trimPhrase(text: string, start: number, end: number): { start: number; end: number } {
  const slice = text.slice(start, end);
  const lead = slice.match(LEADING_OPENERS)?.[0].length ?? 0;
  const trail = slice.slice(lead).match(TRAILING_PUNCTUATION)?.[0].length ?? 0;
  return { start: start + lead, end: end - trail };
}

function count(text: string, chars: string): number {
  let n = 0;
  for (const ch of text) if (chars.includes(ch)) n++;
  return n;
}

/**
 * Trims a token to a formula candidate. Brackets are part of formula syntax,
 * so they are only removed when unbalanced: "(see H2O)." → "H2O", but
 * "(H2O)," → "(H2O)" and "Ca(OH)2" stays whole.
 */
export function trimFormulaToken(text: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  const strip = () => {
    const slice = text.slice(s, e);
    e -= slice.match(TRAILING_SENTENCE_PUNCTUATION)?.[0].length ?? 0;
    s += text.slice(s, e).match(LEADING_QUOTES)?.[0].length ?? 0;
  };
  strip();
  for (let guard = 0; guard < 16 && s < e; guard++) {
    const slice = text.slice(s, e);
    const openers = count(slice, "([");
    const closers = count(slice, ")]");
    if (openers > closers && (slice[0] === "(" || slice[0] === "[")) s += 1;
    else if (closers > openers && (slice.endsWith(")") || slice.endsWith("]"))) e -= 1;
    else break;
    strip();
  }
  return { start: s, end: Math.max(s, e) };
}

/** The word immediately before `index`, lowercased and stripped of punctuation. */
export function previousWord(text: string, index: number, from = 0): string | undefined {
  const tokens = wordTokens(text.slice(0, index), from);
  const last = tokens[tokens.length - 1];
  if (!last) return undefined;
  return last.text.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}']+$/gu, "") || undefined;
}
