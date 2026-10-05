import { PRIORITY, type NamedRule, type RuleGuard } from "./types";

interface SymbolEntry {
  id: string;
  patterns: string[];
  replacement: string;
  mode?: "auto" | "suggest";
  guards?: RuleGuard[];
  completeFromChars?: number;
  /** Why this entry deviates from a plain auto rule; kept next to the data for reviewers. */
  note?: string;
}

/**
 * Curated scientific symbols (spec §10) plus explicitly named arrows (§20).
 * ASCII arrow shorthand ("->", "<=>") is Phase 2 reaction work and is not here.
 */
const SYMBOLS: SymbolEntry[] = [
  { id: "plus-minus", patterns: ["plus minus", "plus-minus"], replacement: "±" },
  {
    id: "plus-or-minus",
    patterns: ["plus or minus"],
    replacement: "±",
    mode: "suggest",
    note: "Common in spoken-style prose (\"five plus or minus two\").",
  },
  { id: "minus-plus", patterns: ["minus plus", "minus-plus"], replacement: "∓" },
  {
    id: "approximately-equal",
    patterns: ["approximately equal", "approximately equals", "approximately equal to"],
    replacement: "≈",
    guards: ["after-copula"],
  },
  {
    id: "not-equal",
    patterns: ["not equal", "not equals", "not equal to"],
    replacement: "≠",
    guards: ["after-copula"],
  },
  {
    id: "less-than-or-equal",
    patterns: ["less than or equal", "less than or equal to"],
    replacement: "≤",
    guards: ["after-copula"],
  },
  {
    id: "greater-than-or-equal",
    patterns: ["greater than or equal", "greater than or equal to"],
    replacement: "≥",
    guards: ["after-copula"],
  },
  { id: "proportional-to", patterns: ["proportional to"], replacement: "∝", guards: ["after-copula"] },
  { id: "infinity", patterns: ["infinity symbol", "infinity sign"], replacement: "∞" },
  { id: "therefore", patterns: ["therefore symbol", "therefore sign"], replacement: "∴" },
  { id: "because", patterns: ["because symbol", "because sign"], replacement: "∵" },
  { id: "degree", patterns: ["degree symbol", "degree sign", "degrees symbol"], replacement: "°" },
  {
    id: "angstrom",
    patterns: ["angstrom", "ångström"],
    replacement: "Å",
    mode: "suggest",
    completeFromChars: 5,
    note: "\"The angstrom is a unit\" must not become \"The Å is a unit\".",
  },
  { id: "angstrom-symbol", patterns: ["angstrom symbol", "angstrom sign"], replacement: "Å" },
  { id: "nabla", patterns: ["nabla"], replacement: "∇", completeFromChars: 4 },
  {
    id: "partial-derivative",
    patterns: ["partial derivative"],
    replacement: "∂",
    mode: "suggest",
    note: "\"take the partial derivative of f\" is prose; the explicit symbol phrase below is automatic.",
  },
  { id: "partial-symbol", patterns: ["partial derivative symbol", "partial symbol"], replacement: "∂" },
  { id: "middle-dot", patterns: ["middle dot", "center dot", "centre dot", "centered dot", "centred dot"], replacement: "·" },
  { id: "multiplication", patterns: ["multiplication sign", "multiplication symbol", "times sign", "times symbol"], replacement: "×" },
  { id: "square-root", patterns: ["square root symbol", "square root sign", "root symbol"], replacement: "√" },
  { id: "integral", patterns: ["integral symbol", "integral sign"], replacement: "∫" },
  // ∑ (U+2211) and ∏ (U+220F) are the n-ary operators, not the Greek letters Σ and Π.
  { id: "summation", patterns: ["summation symbol", "summation sign", "sum symbol"], replacement: "∑" },
  { id: "product", patterns: ["product symbol", "product sign"], replacement: "∏" },
  { id: "reaction-arrow", patterns: ["reaction arrow", "forward reaction arrow"], replacement: "→" },
  { id: "backward-arrow", patterns: ["backward arrow", "backward reaction arrow"], replacement: "←" },
  {
    id: "equilibrium-arrow",
    patterns: ["equilibrium arrow", "equilibrium arrows"],
    replacement: "⇌",
    completeFromChars: 6,
  },
  {
    id: "bidirectional-arrow",
    patterns: ["bidirectional arrow", "two way arrow", "two-way arrow"],
    replacement: "⇄",
    note: "Kept distinct from the equilibrium arrow ⇌ (spec §20).",
  },
];

export function symbolRules(): NamedRule[] {
  return SYMBOLS.map((entry) => ({
    id: `symbol.${entry.id}`,
    category: "symbol",
    label: entry.patterns[0]!,
    patterns: entry.patterns,
    replacement: entry.replacement,
    mode: entry.mode ?? "auto",
    priority: PRIORITY.namedSymbol,
    confidence: entry.mode === "suggest" ? 0.85 : 1,
    ...(entry.guards && { guards: entry.guards }),
    ...(entry.completeFromChars !== undefined && { completeFromChars: entry.completeFromChars }),
  }));
}

const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";
const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/**
 * Explicit script commands (spec §11). Arbitrary letters are not covered:
 * Unicode lacks a complete set, so those need host-native formatting later.
 */
export function scriptCommandRules(): NamedRule[] {
  const rules: NamedRule[] = [];
  const command = (id: string, patterns: string[], replacement: string): NamedRule => ({
    id: `symbol.${id}`,
    category: "symbol",
    label: patterns[0]!,
    patterns,
    replacement,
    mode: "auto",
    priority: PRIORITY.command,
    confidence: 1,
  });
  for (let digit = 0; digit <= 9; digit++) {
    rules.push(command(`subscript.${digit}`, [`subscript ${digit}`], SUBSCRIPT_DIGITS[digit]!));
    rules.push(command(`superscript.${digit}`, [`superscript ${digit}`], SUPERSCRIPT_DIGITS[digit]!));
  }
  rules.push(command("superscript.plus", ["superscript plus", "superscript +"], "⁺"));
  rules.push(command("superscript.minus", ["superscript minus", "superscript -"], "⁻"));
  rules.push(command("subscript.plus", ["subscript plus", "subscript +"], "₊"));
  rules.push(command("subscript.minus", ["subscript minus", "subscript -"], "₋"));
  return rules;
}
