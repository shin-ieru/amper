import { PRIORITY, type NamedRule } from "./types";

/** The 24 letters of the Greek alphabet with their lowercase and uppercase code points (spec §9). */
export const GREEK_LETTERS = [
  { name: "alpha", lower: "α", upper: "Α" },
  { name: "beta", lower: "β", upper: "Β" },
  { name: "gamma", lower: "γ", upper: "Γ" },
  { name: "delta", lower: "δ", upper: "Δ" },
  { name: "epsilon", lower: "ε", upper: "Ε" },
  { name: "zeta", lower: "ζ", upper: "Ζ" },
  { name: "eta", lower: "η", upper: "Η" },
  { name: "theta", lower: "θ", upper: "Θ" },
  { name: "iota", lower: "ι", upper: "Ι" },
  { name: "kappa", lower: "κ", upper: "Κ" },
  { name: "lambda", lower: "λ", upper: "Λ" },
  { name: "mu", lower: "μ", upper: "Μ" },
  { name: "nu", lower: "ν", upper: "Ν" },
  { name: "xi", lower: "ξ", upper: "Ξ" },
  { name: "omicron", lower: "ο", upper: "Ο" },
  { name: "pi", lower: "π", upper: "Π" },
  { name: "rho", lower: "ρ", upper: "Ρ" },
  { name: "sigma", lower: "σ", upper: "Σ" },
  { name: "tau", lower: "τ", upper: "Τ" },
  { name: "upsilon", lower: "υ", upper: "Υ" },
  { name: "phi", lower: "φ", upper: "Φ" },
  { name: "chi", lower: "χ", upper: "Χ" },
  { name: "psi", lower: "ψ", upper: "Ψ" },
  { name: "omega", lower: "ω", upper: "Ω" },
] as const;

/** Alternate glyph forms: explicit request only, never chosen automatically. */
export const GREEK_VARIANTS = [
  { phrase: "variant epsilon", char: "ϵ" },
  { phrase: "variant theta", char: "ϑ" },
  { phrase: "variant kappa", char: "ϰ" },
  { phrase: "variant phi", char: "ϕ" },
  { phrase: "variant rho", char: "ϱ" },
  { phrase: "final sigma", char: "ς" },
] as const;

const UPPER_QUALIFIERS = ["capital", "uppercase", "upper case", "upper-case"];

/** Words that, directly before a Greek name, make it part of an explicit phrase. */
export const GREEK_QUALIFIER_WORDS: ReadonlySet<string> = new Set([
  "capital", "uppercase", "upper", "upper-case", "lowercase", "lower", "lower-case", "case",
  "small", "cap", "uc", "lc", "variant", "final",
]);
const LOWER_QUALIFIERS = ["lowercase", "lower case", "lower-case"];

export function greekRules(): NamedRule[] {
  const rules: NamedRule[] = [];
  for (const { name, lower, upper } of GREEK_LETTERS) {
    rules.push(
      {
        id: `greek.capital.${name}`,
        category: "greek",
        label: `capital ${name}`,
        patterns: UPPER_QUALIFIERS.map((q) => `${q} ${name}`),
        replacement: upper,
        mode: "auto",
        priority: PRIORITY.namedSymbol,
        confidence: 1,
      },
      {
        id: `greek.lowercase.${name}`,
        category: "greek",
        label: `lowercase ${name}`,
        patterns: LOWER_QUALIFIERS.map((q) => `${q} ${name}`),
        replacement: lower,
        mode: "auto",
        priority: PRIORITY.namedSymbol,
        confidence: 1,
      },
      {
        // Spec V2 §9.2: "small theta" is an explicit lowercase command.
        id: `greek.small.${name}`,
        category: "greek",
        label: `small ${name}`,
        patterns: [`small ${name}`],
        replacement: lower,
        mode: "auto",
        priority: PRIORITY.namedSymbol,
        confidence: 1,
        noCompletion: true,
      },
      {
        // Shorthand from spec §9 "potential later": suggest-only until usage data says otherwise.
        id: `greek.shorthand.upper.${name}`,
        category: "greek",
        label: `cap ${name}`,
        patterns: [`cap ${name}`, `uc ${name}`],
        replacement: upper,
        mode: "suggest",
        priority: PRIORITY.namedSymbol,
        confidence: 0.9,
        noCompletion: true,
      },
      {
        id: `greek.shorthand.lower.${name}`,
        category: "greek",
        label: `lc ${name}`,
        patterns: [`lc ${name}`],
        replacement: lower,
        mode: "suggest",
        priority: PRIORITY.namedSymbol,
        confidence: 0.9,
        noCompletion: true,
      },
      {
        // Spec V2 §9.1/§55: a bare Greek name is high-confidence scientific notation. Matching is
        // case-insensitive and always yields the lowercase letter ("Sigma", "SIGMA" → σ), because
        // English capitalisation (or Docs sentence auto-capitalisation) does not mean uppercase Greek.
        // Explicit phrases ("capital sigma") are longer and always win the longest-match.
        id: `greek.bare.${name}`,
        category: "greek",
        label: name,
        patterns: [name],
        replacement: lower,
        mode: "auto",
        priority: PRIORITY.namedSymbol,
        confidence: 1,
        guards: ["not-after-qualifier"],
        ...(name.length >= 4 && { completeFromChars: 4 }),
      },
    );
  }
  for (const { phrase, char } of GREEK_VARIANTS) {
    rules.push({
      id: `greek.${phrase.replace(" ", ".")}`,
      category: "greek",
      label: phrase,
      patterns: [phrase],
      replacement: char,
      mode: "auto",
      priority: PRIORITY.namedSymbol,
      confidence: 1,
    });
  }
  return rules;
}
