import { isElementSymbol } from "./elements";

/** Most canonical spellings considered for one token; bounds work on long letter runs. */
export const MAX_CASE_CANDIDATES = 16;

const STATE_SUFFIX = /\((?:aq|s|l|g)\)$/;

/** Every way to split a lower-cased letter run into valid element symbols, canonically capitalised. */
function segment(run: string, limit: number): string[][] {
  const memo = new Map<number, string[][]>();
  const from = (i: number): string[][] => {
    if (i === run.length) return [[]];
    const cached = memo.get(i);
    if (cached) return cached;
    const out: string[][] = [];
    const two = run.slice(i, i + 2);
    const twoSymbol = two.length === 2 ? two[0]!.toUpperCase() + two[1] : "";
    if (twoSymbol && isElementSymbol(twoSymbol)) {
      for (const rest of from(i + 2)) {
        out.push([twoSymbol, ...rest]);
        if (out.length >= limit) break;
      }
    }
    const one = run[i]!.toUpperCase();
    if (out.length < limit && isElementSymbol(one)) {
      for (const rest of from(i + 1)) {
        out.push([one, ...rest]);
        if (out.length >= limit) break;
      }
    }
    memo.set(i, out);
    return out;
  };
  return from(0);
}

/**
 * Canonical capitalisations of a token whose letters are in the wrong case
 * ("h2so4" → ["H2SO4"], "co2" → ["CO2", "Co2"], "nacl" → ["NaCl"]).
 *
 * Only letters change: digits, brackets, charges, dots are kept as typed, and
 * a trailing physical state ("(aq)") is never re-cased. Every letter run must
 * split completely into IUPAC symbols, so "bacon2" and "macbook" yield
 * candidates only if every letter belongs to a symbol. This function only
 * enumerates; ranking and confidence live in @amper/core.
 */
export function caseCandidates(token: string, limit = MAX_CASE_CANDIDATES): string[] {
  const state = STATE_SUFFIX.exec(token)?.[0] ?? "";
  const core = state ? token.slice(0, -state.length) : token;
  if (!/[a-z]/.test(core)) return [];

  const parts = core.match(/[A-Za-z]+|[^A-Za-z]+/g) ?? [];
  let combos: string[] = [""];
  for (const part of parts) {
    if (!/^[A-Za-z]/.test(part)) {
      combos = combos.map((c) => c + part);
      continue;
    }
    const splits = segment(part.toLowerCase(), limit);
    if (splits.length === 0) return [];
    const next: string[] = [];
    for (const prefix of combos) {
      for (const split of splits) {
        next.push(prefix + split.join(""));
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    combos = next;
  }
  return combos.map((c) => c + state).filter((c) => c !== token);
}
