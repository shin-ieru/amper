import { atomicNumber } from "../elements";
import type { Adduct, Charge, FormulaComponent, FormulaNode } from "./ast";
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
/** Largest charge magnitude accepted ([PW12O40]3-, Os8+ fit; "Na12+" does not). */
export const MAX_CHARGE = 9;
/** Heaviest plausible mass number for isotope notation. */
export const MAX_MASS_NUMBER = 300;

/**
 * Grammar (Phase 2):
 *
 *   Species     := Coefficient? Unit (Dot Coefficient? Unit)* Charge? State?
 *   Unit        := Term+
 *   Term        := Isotope? (Element | Group) Count?
 *   Group       := "(" Unit ")" | "[" Unit "]"
 *   Isotope     := "^" Integer | superscript-Integer         (before an element)
 *   Charge      := "^" Integer? Sign                         (caret: explicit)
 *                | Sign                                      (implicit: see charges.ts)
 *                | superscript-Integer? superscript-Sign     (already rendered)
 *   State       := "(s)" | "(l)" | "(g)" | "(aq)"
 *   Dot         := "·" | "•" | "∙" | "⋅" | "*"
 *
 * In an implicit charge ("Fe3+", "NH4+") the digits before the sign stay a
 * count in the AST. The parser never guesses whether they were meant as the
 * charge; charges.ts produces the readings and how certain each is.
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

type NumberToken = Extract<FormulaToken, { kind: "number" }>;

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: FormulaToken[],
    private readonly inputLength: number,
  ) {}

  parse(): ParseResult {
    try {
      const node: FormulaNode = { type: "formula", components: [] };
      const coefficient = this.parseCoefficient();
      if (coefficient !== undefined) node.coefficient = coefficient;
      node.components = this.parseTerms(0);
      if (node.components.length === 0) throw new FormulaParseError("expected an element or group", this.position());

      while (this.peek()?.kind === "dot") {
        const dot = this.next()!;
        const adduct: Adduct = { components: [] };
        const adductCoefficient = this.parseCoefficient();
        if (adductCoefficient !== undefined) adduct.coefficient = adductCoefficient;
        adduct.components = this.parseTerms(0);
        if (adduct.components.length === 0) throw new FormulaParseError("nothing after the adduct dot", dot.start);
        (node.adducts ??= []).push(adduct);
      }

      const charge = this.parseCharge();
      if (charge) node.charge = charge;
      const state = this.peek();
      if (state?.kind === "state") {
        node.state = state.state;
        this.index += 1;
      }

      const trailing = this.peek();
      if (trailing) {
        throw new FormulaParseError(
          trailing.kind === "close" ? "unmatched closing bracket" : trailing.kind === "sign" ? "unexpected sign" : "unexpected token",
          trailing.start,
        );
      }
      return { ok: true, value: node };
    } catch (error) {
      if (error instanceof FormulaParseError) return fail(error.message, error.position);
      throw error;
    }
  }

  /** An ASCII integer immediately followed by something that starts a term. */
  private parseCoefficient(): number | undefined {
    const token = this.peek();
    if (token?.kind !== "number") return undefined;
    if (token.script !== "ascii") {
      if (token.script === "subscript") throw new FormulaParseError("formula cannot start with a subscript", token.start);
      return undefined; // superscript: an isotope mass number, handled by parseTerms
    }
    const after = this.tokens[this.index + 1];
    if (!after || !(after.kind === "element" || after.kind === "open" || after.kind === "caret" || (after.kind === "number" && after.script === "superscript"))) {
      throw new FormulaParseError("expected an element or group", token.start);
    }
    this.index += 1;
    return this.readPositive(token);
  }

  private parseTerms(depth: number): FormulaComponent[] {
    const components: FormulaComponent[] = [];
    for (;;) {
      const token = this.peek();
      if (!token || token.kind === "close" || token.kind === "dot" || token.kind === "sign" || token.kind === "state") {
        return components;
      }
      if (token.kind === "caret" || (token.kind === "number" && token.script === "superscript")) {
        const massNumber = this.parseIsotope();
        if (massNumber === undefined) return components; // a charge, not an isotope
        components.push(this.parseElement(massNumber));
        continue;
      }
      if (token.kind === "number") throw new FormulaParseError("count without an element or group", token.start);

      if (token.kind === "element") {
        components.push(this.parseElement(undefined));
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

  /**
   * "^14" or "¹⁴" followed by an element is a mass number. Anything else
   * starting with "^"/superscript is left for parseCharge (returns undefined).
   */
  private parseIsotope(): number | undefined {
    const first = this.peek()!;
    let number: NumberToken;
    let width: number;
    if (first.kind === "caret") {
      const n = this.tokens[this.index + 1];
      if (n?.kind !== "number" || n.script !== "ascii" || this.tokens[this.index + 2]?.kind !== "element") return undefined;
      number = n;
      width = 2;
    } else {
      if (first.kind !== "number" || this.tokens[this.index + 1]?.kind !== "element") return undefined;
      number = first;
      width = 1;
    }
    const massNumber = this.readPositive(number);
    if (massNumber > MAX_MASS_NUMBER) throw new FormulaParseError("mass number too large", number.start);
    this.index += width;
    return massNumber;
  }

  private parseElement(massNumber: number | undefined): FormulaComponent {
    const token = this.next();
    if (token?.kind !== "element") throw new FormulaParseError("expected an element", token?.start ?? this.inputLength);
    if (massNumber !== undefined && massNumber < atomicNumber(token.symbol)!) {
      throw new FormulaParseError(`mass number ${massNumber} is below the atomic number of ${token.symbol}`, token.start);
    }
    const count = this.parseCount();
    return {
      type: "element",
      symbol: token.symbol,
      ...(count && { count: count.value }),
      ...(massNumber !== undefined && { massNumber }),
      span: { start: token.start, end: count?.end ?? token.end },
    };
  }

  private parseCount(): { value: number; end: number } | undefined {
    const token = this.peek();
    if (token?.kind !== "number" || token.script === "superscript") return undefined;
    this.index += 1;
    return { value: this.readPositive(token), end: token.end };
  }

  private parseCharge(): Charge | undefined {
    const token = this.peek();
    if (!token) return undefined;

    if (token.kind === "caret") {
      this.index += 1;
      const n = this.peek();
      let magnitude = 1;
      if (n?.kind === "number" && n.script === "ascii") {
        magnitude = this.readCharge(n);
        this.index += 1;
      }
      const sign = this.next();
      if (sign?.kind !== "sign" || sign.script !== "ascii") throw new FormulaParseError("caret charge needs a sign", token.start);
      return { magnitude, sign: sign.sign, notation: "caret" };
    }
    if (token.kind === "sign" && token.script === "ascii") {
      this.index += 1;
      return { magnitude: 1, sign: token.sign, notation: "implicit" };
    }
    if (token.kind === "number" && token.script === "superscript") {
      this.index += 1;
      const sign = this.next();
      if (sign?.kind !== "sign" || sign.script !== "superscript") throw new FormulaParseError("superscript number without a charge sign", token.start);
      return { magnitude: this.readCharge(token), sign: sign.sign, notation: "rendered" };
    }
    if (token.kind === "sign") {
      this.index += 1;
      return { magnitude: 1, sign: token.sign, notation: "rendered" };
    }
    return undefined;
  }

  private readCharge(token: NumberToken): number {
    const value = this.readPositive(token);
    if (value > MAX_CHARGE) throw new FormulaParseError("charge magnitude too large", token.start);
    return value;
  }

  private readPositive(token: NumberToken): number {
    if (token.value === 0) throw new FormulaParseError("count cannot be zero", token.start);
    return token.value;
  }

  private next(): FormulaToken | undefined {
    return this.tokens[this.index++];
  }

  private peek(): FormulaToken | undefined {
    return this.tokens[this.index];
  }

  private position(): number {
    return this.peek()?.start ?? this.inputLength;
  }
}
