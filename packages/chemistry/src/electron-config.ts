/** Electron configuration tokens (spec §19): "1s2", "3d10", "2p⁶", and noble-gas cores "[Ne]". */

export type Subshell = "s" | "p" | "d" | "f";

export interface Orbital {
  n: number;
  subshell: Subshell;
  electrons: number;
}

export type ConfigToken = { kind: "orbital"; orbital: Orbital } | { kind: "core"; symbol: string };

const NOBLE_CORES = new Set(["He", "Ne", "Ar", "Kr", "Xe", "Rn"]);
/** Azimuthal quantum number per subshell letter; capacity is 2(2l + 1). */
const L: Record<Subshell, number> = { s: 0, p: 1, d: 2, f: 3 };
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function readCount(text: string): number | undefined {
  if (text.length === 0 || text.length > 2) return undefined;
  const ascii = /^[0-9]+$/.test(text);
  const superscript = [...text].every((ch) => SUPERSCRIPT.includes(ch));
  if (!ascii && !superscript) return undefined;
  const digits = ascii ? text : [...text].map((ch) => SUPERSCRIPT.indexOf(ch)).join("");
  if (digits.length > 1 && digits[0] === "0") return undefined;
  return Number(digits);
}

/**
 * Parses one whitespace-delimited configuration token. Validates physics, not
 * just shape: n ≥ l + 1 (no "1p", "2d") and electrons ≤ 2(2l + 1) (no "2p7").
 * That alone rejects dice notation like "2d6"; "3d6" stays valid and is left
 * to context scoring.
 */
export function parseConfigToken(token: string): ConfigToken | undefined {
  const core = /^\[([A-Z][a-z]?)\]$/.exec(token);
  if (core) return NOBLE_CORES.has(core[1]!) ? { kind: "core", symbol: core[1]! } : undefined;

  const n = Number(token[0]);
  const subshell = token[1] as Subshell | undefined;
  if (!(n >= 1 && n <= 7) || !subshell || !(subshell in L)) return undefined;
  const electrons = readCount(token.slice(2));
  if (electrons === undefined || electrons < 1) return undefined;
  const l = L[subshell];
  if (n < l + 1 || electrons > 2 * (2 * l + 1)) return undefined;
  return { kind: "orbital", orbital: { n, subshell, electrons } };
}
