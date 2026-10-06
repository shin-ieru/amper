/**
 * Shortcut catalog for the popup, onboarding and reference page.
 *
 * Greek, arrows and symbols are generated from the same tables the engine uses,
 * so the reference cannot drift from behaviour. Every entry is typed through the
 * real engine by tests/integration/shortcut-catalog.test.ts, which fails if an
 * entry does not do exactly what it shows.
 */
import { ARROW_DEFINITIONS, arrowGlyph } from "@amper/chemistry";
import { createDefaultRegistry, GREEK_LETTERS, GREEK_VARIANTS, scriptCommandRules, symbolRules } from "@amper/rules";

export interface ShortcutEntry {
  /** What the user types. */
  input: string;
  /** What Amper produces (text). */
  output: string;
  /** "suggestion": offered for Tab instead of converting automatically. */
  badge?: "recommended" | "alternative" | "suggestion";
  hint?: string;
  /** The output ends in a state label that Google Docs shows as subscript. */
  stateLabel?: string;
  /** How to exercise it when it only converts in context (e.g. "->" after a formula). */
  example?: { type: string; result: string };
  /** Extra search terms (e.g. "equilibrium" for "<=>"). */
  keywords?: readonly string[];
}

export interface ShortcutGroup {
  id: "greek" | "arrows" | "formulas" | "states" | "symbols";
  title: string;
  entries: ShortcutEntry[];
}

/** Popup "Try typing" (shown after onboarding). */
export const TRY_TYPING: readonly ShortcutEntry[] = [
  { input: "equi", output: "⇌" },
  { input: "sigma", output: "σ" },
  { input: "capital sigma", output: "Σ" },
  { input: "h2so4", output: "H₂SO₄" },
  { input: "so4^2-", output: "SO₄²⁻" },
];

/** First-run card. */
export const ONBOARDING: readonly ShortcutEntry[] = [
  { input: "h2so4", output: "H₂SO₄" },
  { input: "sigma", output: "σ" },
  { input: "equi", output: "⇌" },
];

function greek(): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [];
  for (const { name, lower, upper } of GREEK_LETTERS) {
    entries.push({ input: name, output: lower }, { input: `capital ${name}`, output: upper });
  }
  for (const { phrase, char } of GREEK_VARIANTS) entries.push({ input: phrase, output: char, hint: "variant form" });
  return entries;
}

function arrows(): ShortcutEntry[] {
  // Equilibrium first: it is the arrow people most need and the least obvious to type.
  const order = ["equilibrium", "forward", "backward", "bidirectional"] as const;
  const entries: ShortcutEntry[] = [];
  for (const kind of order) {
    const definition = ARROW_DEFINITIONS.find((d) => d.kind === kind)!;
    const glyph = arrowGlyph(definition);
    const primary = definition.primaryShortcut;
    // Every form of one arrow is found by any of its names: "equi" also finds "<=>".
    const keywords = [definition.kind, ...definition.phrases];
    if (primary) entries.push({ input: primary, output: glyph, badge: "recommended", hint: "equilibrium", keywords });
    for (const phrase of definition.phrases.filter((p) => p !== primary && !p.endsWith("s"))) {
      entries.push({ input: phrase, output: glyph, keywords, ...(primary && { badge: "alternative" as const }) });
    }
    for (const shorthand of definition.shorthand) {
      entries.push({
        input: shorthand,
        output: glyph,
        ...(primary && { badge: "alternative" as const }),
        hint: "after a formula",
        keywords,
        example: { type: `H2O ${shorthand} H2O`, result: `H₂O ${glyph} H₂O` },
      });
    }
  }
  entries.push({ input: "2H2 + O2 -> 2H2O", output: "2H₂ + O₂ → 2H₂O", hint: "whole reaction" });
  return entries;
}

const FORMULAS: ShortcutEntry[] = [
  { input: "H2O", output: "H₂O" },
  { input: "h2so4", output: "H₂SO₄", hint: "any capitalisation" },
  { input: "Ca(OH)2", output: "Ca(OH)₂" },
  { input: "2H2O", output: "2H₂O", hint: "coefficient stays full size" },
  { input: "N2", output: "N₂" },
  { input: "Fe3+", output: "Fe³⁺" },
  { input: "NH4+", output: "NH₄⁺" },
  { input: "so4^2-", output: "SO₄²⁻", hint: "^ makes a charge explicit" },
  { input: "O2^+", output: "O₂⁺" },
  { input: "[Fe(CN)6]3-", output: "[Fe(CN)₆]³⁻" },
  { input: "CuSO4·5H2O", output: "CuSO₄·5H₂O", hint: "or CuSO4*5H2O" },
  { input: "^14C", output: "¹⁴C", hint: "isotope" },
  { input: "1s2 2s2 2p6", output: "1s² 2s² 2p⁶", hint: "electron configuration" },
  { input: "O2+", output: "O₂⁺", badge: "suggestion", hint: "ambiguous: also O²⁺" },
];

const STATES: ShortcutEntry[] = [
  { input: "H2O(l)", output: "H₂O(l)", stateLabel: "(l)" },
  { input: "CO2(g)", output: "CO₂(g)", stateLabel: "(g)" },
  { input: "NaCl(aq)", output: "NaCl(aq)", stateLabel: "(aq)" },
  { input: "CaCO3(s)", output: "CaCO₃(s)", stateLabel: "(s)" },
];

function symbols(): ShortcutEntry[] {
  const registry = createDefaultRegistry();
  const entries: ShortcutEntry[] = [];
  for (const rule of symbolRules().filter((r) => !r.id.startsWith("symbol.arrow."))) {
    // Show a spelling that converts on its own ("not equals", not "not equal", which waits for "to").
    const input = rule.patterns.find((p) => !registry.canGrow(p)) ?? rule.patterns[0]!;
    entries.push({ input, output: rule.replacement, ...(rule.mode === "suggest" && { badge: "suggestion" as const }) });
  }
  for (const rule of scriptCommandRules()) entries.push({ input: rule.patterns[0]!, output: rule.replacement });
  return entries;
}

export function shortcutGroups(): ShortcutGroup[] {
  return [
    { id: "greek", title: "Greek", entries: greek() },
    { id: "arrows", title: "Reaction arrows", entries: arrows() },
    { id: "formulas", title: "Formulas & charges", entries: FORMULAS },
    { id: "states", title: "States", entries: STATES },
    { id: "symbols", title: "Scientific symbols", entries: symbols() },
  ];
}

/** Case-insensitive match on what you type, what you get, hints and the group title. */
export function matches(entry: ShortcutEntry, group: ShortcutGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [entry.input, entry.output, entry.hint ?? "", entry.badge ?? "", group.title, ...(entry.keywords ?? [])].some((s) =>
    s.toLowerCase().includes(q),
  );
}
