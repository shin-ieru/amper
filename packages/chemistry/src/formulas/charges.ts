import { cloneFormula, type FormulaComponent, type FormulaNode } from "./ast";

/**
 * Typical charges of common monatomic ions (positive: cation, negative: anion).
 * Used only to rank readings of implicit charges like "Fe3+"; it never blocks
 * explicit caret syntax. Sources: IUPAC Red Book common oxidation states.
 */
export const TYPICAL_ION_CHARGES: Readonly<Record<string, readonly number[]>> = {
  H: [1, -1], Li: [1], Na: [1], K: [1], Rb: [1], Cs: [1], Fr: [1],
  Be: [2], Mg: [2], Ca: [2], Sr: [2], Ba: [2], Ra: [2],
  B: [3], Al: [3], Ga: [3], In: [1, 3], Tl: [1, 3],
  Sn: [2, 4], Pb: [2, 4], N: [-3], P: [-3], As: [-3], Sb: [3, 5], Bi: [3, 5],
  O: [-2], S: [-2], Se: [-2], Te: [-2], F: [-1], Cl: [-1], Br: [-1], I: [-1], At: [-1],
  Sc: [3], Ti: [2, 3, 4], V: [2, 3, 4, 5], Cr: [2, 3, 6], Mn: [2, 3, 4, 7], Fe: [2, 3],
  Co: [2, 3], Ni: [2, 3], Cu: [1, 2], Zn: [2], Y: [3], Zr: [4], Nb: [5], Mo: [3, 6],
  Tc: [7], Ru: [2, 3, 4], Rh: [3], Pd: [2, 4], Ag: [1], Cd: [2], Hf: [4], Ta: [5], W: [6],
  Re: [7], Os: [4, 8], Ir: [3, 4], Pt: [2, 4], Au: [1, 3], Hg: [1, 2],
  La: [3], Ce: [3, 4], Pr: [3], Nd: [3], Pm: [3], Sm: [2, 3], Eu: [2, 3], Gd: [3], Tb: [3, 4],
  Dy: [3], Ho: [3], Er: [3], Tm: [3], Yb: [2, 3], Lu: [3], Ac: [3], Th: [4], Pa: [5],
  U: [3, 4, 6], Np: [3, 5], Pu: [3, 4], Am: [3],
};

/**
 * Real homonuclear ions whose written form collides with a monatomic charge:
 * "O2-" is superoxide O₂⁻ *and* oxide O²⁻; "N3-" is azide N₃⁻ *and* nitride N³⁻.
 */
export const KNOWN_HOMONUCLEAR_IONS: ReadonlySet<string> = new Set([
  "O2+", "O2-", "N2+", "H2+", "H3+", "I3-", "Br3-", "N3-",
]);

/** One-letter symbols whose bare "+"/"-" is usually a grade, blood type or rail (B+, C-, O+, V-). */
export const AMBIGUOUS_BARE_SIGN_SYMBOLS: ReadonlySet<string> = new Set(["B", "C", "O", "V"]);

export type ReadingKind = "as-written" | "count-as-charge" | "split-count";

export interface ChargeReading {
  kind: ReadingKind;
  node: FormulaNode;
  /** Short human description for suggestion lists ("charge 2−"). */
  description: string;
}

export interface ChargeInterpretation {
  /** Best first. */
  readings: ChargeReading[];
  /**
   * certain: explicit or already rendered. likely: convention leaves one sensible
   * reading. ambiguous: more than one real reading; offer, never autocorrect.
   */
  certainty: "certain" | "likely" | "ambiguous";
  reason: string;
}

const signWord = (sign: "+" | "-", magnitude: number) => `${magnitude === 1 ? "" : magnitude}${sign === "+" ? "+" : "−"}`;

function lastUnit(node: FormulaNode): FormulaComponent[] {
  return node.adducts?.length ? node.adducts[node.adducts.length - 1]!.components : node.components;
}

function withLast(node: FormulaNode, update: (last: FormulaComponent) => FormulaComponent, magnitude: number): FormulaNode {
  const clone = cloneFormula(node);
  const unit = lastUnit(clone);
  unit[unit.length - 1] = update(unit[unit.length - 1]!);
  clone.charge = { ...clone.charge!, magnitude };
  return clone;
}

function dropCount(component: FormulaComponent): FormulaComponent {
  const { count: _count, ...rest } = component;
  return rest as FormulaComponent;
}

/**
 * Readings of a species' charge (spec §13). Trailing digits before a sign can
 * be an atom count or the charge magnitude; the AST keeps them as a count and
 * this function decides which readings exist and how sure we are.
 */
export function interpretCharge(node: FormulaNode): ChargeInterpretation | undefined {
  const charge = node.charge;
  if (!charge) return undefined;
  const asWritten = (description: string): ChargeReading => ({ kind: "as-written", node, description });
  if (charge.notation !== "implicit") {
    return { readings: [asWritten(`charge ${signWord(charge.sign, charge.magnitude)}`)], certainty: "certain", reason: `${charge.notation} charge` };
  }

  const unit = lastUnit(node);
  const last = unit[unit.length - 1]!;
  const monatomic = node.components.length === 1 && last.type === "element" && !node.adducts?.length;
  const sign = charge.sign;
  const signed = (n: number) => (sign === "+" ? n : -n);

  // Bare sign: "Na+", "NH4+", "OH-". No digits to reinterpret.
  if (last.count === undefined) {
    if (monatomic) {
      const symbol = (last as { symbol: string }).symbol;
      const typical = TYPICAL_ION_CHARGES[symbol]?.includes(signed(1)) ?? false;
      if (typical && !AMBIGUOUS_BARE_SIGN_SYMBOLS.has(symbol)) {
        return { readings: [asWritten(`charge ${signWord(sign, 1)}`)], certainty: "likely", reason: `${symbol}${sign} is a common ion` };
      }
      return {
        readings: [asWritten(`charge ${signWord(sign, 1)}`)],
        certainty: "ambiguous",
        reason: AMBIGUOUS_BARE_SIGN_SYMBOLS.has(symbol)
          ? `"${symbol}${sign}" is often a grade, blood type or label`
          : `${symbol}${sign} is not a common ion`,
      };
    }
    return { readings: [asWritten(`charge ${signWord(sign, 1)}`)], certainty: "likely", reason: "polyatomic ion with a bare sign" };
  }

  const n = last.count;
  const asCharge = (): ChargeReading => ({
    kind: "count-as-charge",
    node: withLast(node, dropCount, n),
    description: `charge ${signWord(sign, n)}`,
  });
  const countThenCharge = asWritten(`${n} atoms, charge ${signWord(sign, 1)}`);

  // "[Fe(CN)6]3-": a number after a square-bracketed complex is its charge by convention.
  if (last.type === "group" && last.bracket === "square") {
    if (n > 9) return { readings: [countThenCharge], certainty: "ambiguous", reason: "charge magnitude too large" };
    return { readings: [asCharge()], certainty: "likely", reason: "number after a bracketed complex is its charge" };
  }

  if (monatomic) {
    const symbol = (last as { symbol: string }).symbol;
    const known = TYPICAL_ION_CHARGES[symbol];
    const chargeOk = n <= 9 && (known?.includes(signed(n)) ?? false);
    const homonuclear = KNOWN_HOMONUCLEAR_IONS.has(`${symbol}${n}${sign}`);
    if (chargeOk && !homonuclear) {
      return { readings: [asCharge()], certainty: "likely", reason: `${symbol} commonly forms ${symbol}${signWord(sign, n)}` };
    }
    if (chargeOk && homonuclear) {
      return { readings: [asCharge(), countThenCharge], certainty: "ambiguous", reason: `"${symbol}${n}${sign}" is both a monatomic and a ${symbol}${n} ion` };
    }
    if (homonuclear) {
      return { readings: [countThenCharge, ...(n <= 9 ? [asCharge()] : [])], certainty: "ambiguous", reason: `"${symbol}${n}${sign}" is usually the ${symbol}${n} ion` };
    }
    const readings = known ? [countThenCharge, asCharge()] : [asCharge(), countThenCharge];
    return { readings: readings.filter((r) => r.kind !== "count-as-charge" || n <= 9), certainty: "ambiguous", reason: `unusual charge for ${symbol}` };
  }

  // A count on a parenthesised group before the sign: "Fe(OH)2+" is Fe(OH)₂⁺, but could be Fe(OH)²⁺.
  if (last.type === "group") {
    return { readings: [countThenCharge, ...(n <= 9 ? [asCharge()] : [])], certainty: "ambiguous", reason: "count or charge after a group" };
  }

  // Polyatomic, last term an element with a count.
  const digits = String(n);
  if (digits.length === 1) {
    return { readings: [countThenCharge], certainty: "likely", reason: "single digit before the sign is the last count (NO3-, NH4+)" };
  }
  // "SO42-": most likely SO₄²⁻, but only the caret form says so.
  const split: ChargeReading = {
    kind: "split-count",
    node: withLast(node, (c) => ({ ...c, count: Number(digits.slice(0, -1)) }), Number(digits.slice(-1))),
    description: `count ${digits.slice(0, -1)}, charge ${signWord(sign, Number(digits.slice(-1)))}`,
  };
  return { readings: [split, countThenCharge], certainty: "ambiguous", reason: `"${digits}" could be a count or a count followed by a charge; write ^${digits.slice(-1)}${sign} to be explicit` };
}
