/**
 * The single source of truth for reaction arrows (spec V2 §20). Shorthand
 * parsing, natural-language aliases, autocomplete and rendering all derive from
 * this table, so they cannot diverge. Glyphs are built from code points rather
 * than typed, so a look-alike character (⇔, ↔, ⇋) can never slip in.
 */
export type ArrowKind = "forward" | "backward" | "bidirectional" | "equilibrium";

export interface ArrowDefinition {
  kind: ArrowKind;
  codePoint: number;
  /** ASCII input forms ("->", "<=>"). */
  shorthand: readonly string[];
  /**
   * Natural-language aliases. The first is the autocomplete label; whole tokens only,
   * so "equi" never matches inside "equilibrium" or "equipment".
   */
  phrases: readonly string[];
  /** The short form Amper teaches first in examples and onboarding. */
  primaryShortcut?: string;
  /** Autocomplete may start from a single partial first word of at least this length. */
  completeFromChars?: number;
}

export const ARROW_DEFINITIONS: readonly ArrowDefinition[] = [
  { kind: "forward", codePoint: 0x2192, shorthand: ["->"], phrases: ["reaction arrow", "forward reaction arrow"] },
  { kind: "backward", codePoint: 0x2190, shorthand: ["<-"], phrases: ["backward arrow", "backward reaction arrow"] },
  {
    // ⇄ RIGHTWARDS ARROW OVER LEFTWARDS ARROW: a reaction running both ways. Not the equilibrium symbol.
    kind: "bidirectional",
    codePoint: 0x21c4,
    shorthand: ["<->"],
    phrases: ["bidirectional arrow", "two way arrow", "two-way arrow", "reaction both directions"],
  },
  {
    // ⇌ RIGHTWARDS HARPOON OVER LEFTWARDS HARPOON: the chemistry equilibrium symbol. Never ⇔ or ↔.
    kind: "equilibrium",
    codePoint: 0x21cc,
    // "equi" is the primary, human-friendly shortcut; "<=>" stays for compatibility.
    shorthand: ["<=>"],
    phrases: ["equilibrium arrow", "equilibrium arrows", "equi"],
    primaryShortcut: "equi",
    completeFromChars: 6,
  },
];

export const arrowGlyph = (definition: ArrowDefinition): string => String.fromCodePoint(definition.codePoint);
