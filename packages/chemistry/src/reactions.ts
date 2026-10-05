import type { FormulaNode } from "./formulas/ast";
import { parseFormula } from "./formulas/parser";

/** Reaction arrows (spec §20). The bidirectional ⇄ and equilibrium ⇌ are kept distinct. */
export type ArrowKind = "forward" | "backward" | "bidirectional" | "equilibrium";

export interface ArrowInfo {
  kind: ArrowKind;
  unicode: string;
}

const ARROWS: Record<string, ArrowInfo> = {
  "->": { kind: "forward", unicode: "→" },
  "→": { kind: "forward", unicode: "→" },
  "<-": { kind: "backward", unicode: "←" },
  "←": { kind: "backward", unicode: "←" },
  "<->": { kind: "bidirectional", unicode: "⇄" },
  "⇄": { kind: "bidirectional", unicode: "⇄" },
  "<=>": { kind: "equilibrium", unicode: "⇌" },
  "⇌": { kind: "equilibrium", unicode: "⇌" },
};

export function parseArrowToken(token: string): ArrowInfo | undefined {
  return ARROWS[token];
}

/** "e-", "e^-", "e⁻", "2e-": an electron in a half-reaction. Lowercase e is never an element. */
export function parseElectronToken(token: string): { coefficient?: number } | undefined {
  const match = /^([1-9][0-9]?)?e(?:-|\^-|⁻|−)$/.exec(token);
  if (!match) return undefined;
  return match[1] ? { coefficient: Number(match[1]) } : {};
}

export interface TextToken {
  text: string;
  start: number;
  end: number;
}

export type ReactionItem =
  /** A species, optionally with a separate coefficient token ("2 H2O"). */
  | { kind: "species"; tokens: TextToken[]; node: FormulaNode }
  | { kind: "electron"; tokens: TextToken[]; coefficient?: number }
  | { kind: "plus"; tokens: [TextToken] }
  | { kind: "arrow"; tokens: [TextToken]; arrow: ArrowInfo };

export interface ParsedReaction {
  items: ReactionItem[];
  arrowCount: number;
}

const COEFFICIENT_TOKEN = /^[1-9][0-9]{0,2}$/;

/** Resolves a token to a species AST; callers may add case recovery on top of the strict parser. */
export type SpeciesParser = (text: string) => FormulaNode | undefined;

const strictSpecies: SpeciesParser = (text) => {
  const parsed = parseFormula(text);
  return parsed.ok ? parsed.value : undefined;
};

function speciesAt(tokens: TextToken[], i: number, parse: SpeciesParser): ReactionItem | undefined {
  const token = tokens[i];
  if (!token) return undefined;
  const electron = parseElectronToken(token.text);
  if (electron) return { kind: "electron", tokens: [token], ...electron };
  const node = parse(token.text);
  return node ? { kind: "species", tokens: [token], node } : undefined;
}

/**
 * Longest run of tokens ending at the last token that forms
 *   Species (("+" | Arrow) Species)*
 * Each species is parsed independently by the formula parser. Separators must
 * be whitespace-delimited: "Na+ + Cl-" works, "2H2+O2->2H2O" deliberately does
 * not (there, "+" is indistinguishable from a charge).
 *
 * Returns undefined when the last token is not a species. The caller decides
 * whether a run without an arrow matters (it is still a "+" context).
 */
export function parseReactionSuffix(tokens: TextToken[], parse: SpeciesParser = strictSpecies): ParsedReaction | undefined {
  const items: ReactionItem[] = [];
  let i = tokens.length - 1;
  let arrowCount = 0;

  for (;;) {
    const species = speciesAt(tokens, i, parse);
    if (!species) break;
    const coefficient = tokens[i - 1];
    if (coefficient && COEFFICIENT_TOKEN.test(coefficient.text) && species.kind === "species" && species.node.coefficient === undefined) {
      species.tokens.unshift(coefficient);
      species.node = { ...species.node, coefficient: Number(coefficient.text) };
      i -= 1;
    }
    items.unshift(species);
    i -= 1;

    const separator = tokens[i];
    if (!separator) break;
    const arrow = parseArrowToken(separator.text);
    if (separator.text !== "+" && !arrow) break;
    if (!speciesAt(tokens, i - 1, parse)) break; // separator with nothing before it is not part of the run
    items.unshift(arrow ? { kind: "arrow", tokens: [separator], arrow } : { kind: "plus", tokens: [separator] });
    if (arrow) arrowCount += 1;
    i -= 1;
  }

  return items.length === 0 ? undefined : { items, arrowCount };
}
