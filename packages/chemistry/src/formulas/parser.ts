import type { FormulaComponent, FormulaNode } from "./ast";
import { lexFormula, type FormulaToken } from "./lexer";

export interface ParseError {
  message: string;
  position: number;
}

export type ParseResult = { ok: true; value: FormulaNode } | { ok: false; error: ParseError };

/** Inputs longer than this are rejected outright, which bounds parser runtime. */
export const MAX_FORMULA_LENGTH = 64;
/** Real formulas rarely nest past [Cu(NH3)4]-style depth 2; 4 leaves headroom. */
export const MAX_GROUP_DEPTH = 4;

/**
 * Grammar (neutral formulas, Phase 1):
 *
 *   Formula     := Coefficient? Term+
 *   Term        := (Element | Group) Count?
 *   Group       := "(" Term+ ")" | "[" Term+ "]"
 *   Coefficient := ascii integer, only when a Term follows
 *   Count       := integer (ascii or already-rendered subscript)
 *
 * Never throws: every failure is returned as a ParseError.
 */
export function parseFormula(input: string): ParseResult {
  if (input.length === 0) return fail("empty input", 0);
  if (input.length > MAX_FORMULA_LENGTH) return fail("input too long", MAX_FORMULA_LENGTH);

  const lexed = lexFormula(input);
  if (!lexed.ok) return lexed;
  return new Parser(lexed.tokens, input.length).parse();
}

function fail(message: string, position: number): ParseResult {
  return { ok: false, error: { message, position } };
}

class FormulaParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(message);
  }
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: FormulaToken[],
    private readonly inputLength: number,
  ) {}

  parse(): ParseResult {
    try {
      const node: FormulaNode = { type: "formula", components: [] };
      const first = this.peek();
      if (first?.kind === "number") {
        if (first.script !== "ascii") throw new FormulaParseError("formula cannot start with a subscript", first.start);
        node.coefficient = this.readPositive(first);
        this.index += 1;
      }
      node.components = this.parseTerms(0);
      if (node.components.length === 0) throw new FormulaParseError("expected an element or group", this.position());
      const trailing = this.peek();
      if (trailing) {
        throw new FormulaParseError(
          trailing.kind === "close" ? "unmatched closing bracket" : "unexpected token",
          trailing.start,
        );
      }
      return { ok: true, value: node };
    } catch (error) {
      if (error instanceof FormulaParseError) return fail(error.message, error.position);
      throw error;
    }
  }

  private parseTerms(depth: number): FormulaComponent[] {
    const components: FormulaComponent[] = [];
    for (;;) {
      const token = this.peek();
      if (!token || token.kind === "close") return components;
      if (token.kind === "number") throw new FormulaParseError("count without an element or group", token.start);

      if (token.kind === "element") {
        this.index += 1;
        const count = this.parseCount();
        components.push({
          type: "element",
          symbol: token.symbol,
          ...(count && { count: count.value }),
          span: { start: token.start, end: count?.end ?? token.end },
        });
        continue;
      }

      // token.kind === "open"
      if (depth + 1 > MAX_GROUP_DEPTH) throw new FormulaParseError("groups nested too deeply", token.start);
      this.index += 1;
      const inner = this.parseTerms(depth + 1);
      const close = this.peek();
      if (!close || close.kind !== "close") throw new FormulaParseError("unclosed bracket", token.start);
      if (close.bracket !== token.bracket) throw new FormulaParseError("mismatched brackets", close.start);
      if (inner.length === 0) throw new FormulaParseError("empty group", token.start);
      this.index += 1;
      const count = this.parseCount();
      components.push({
        type: "group",
        bracket: token.bracket,
        components: inner,
        ...(count && { count: count.value }),
        span: { start: token.start, end: count?.end ?? close.end },
      });
    }
  }

  private parseCount(): { value: number; end: number } | undefined {
    const token = this.peek();
    if (token?.kind !== "number") return undefined;
    this.index += 1;
    return { value: this.readPositive(token), end: token.end };
  }

  private readPositive(token: Extract<FormulaToken, { kind: "number" }>): number {
    if (token.value === 0) throw new FormulaParseError("count cannot be zero", token.start);
    return token.value;
  }

  private peek(): FormulaToken | undefined {
    return this.tokens[this.index];
  }

  private position(): number {
    return this.peek()?.start ?? this.inputLength;
  }
}
