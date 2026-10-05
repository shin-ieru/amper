import type { ChargeNotation, FormulaComponent, FormulaNode } from "./ast";

/**
 * Structural facts about a parsed species. The confidence policy in
 * @chemly/core turns these into a score; this module only describes.
 */
export interface FormulaFeatures {
  /** Every element occurrence across body and adducts, in order (with repeats). */
  elementTokens: string[];
  distinctElements: string[];
  hasCount: boolean;
  hasGroup: boolean;
  hasCoefficient: boolean;
  /** An explicit count of 1 ("F1", "H1N1") is almost never written in chemistry. */
  hasExplicitOne: boolean;
  maxCount: number;
  maxDepth: number;
  /** True when one element appears in non-adjacent terms only ("B2B"). */
  singleElementRepeated: boolean;
  hasIsotope: boolean;
  hasAdducts: boolean;
  hasState: boolean;
  chargeNotation: ChargeNotation | undefined;
  /** Body is exactly one element term (with or without count) and there are no adducts. */
  monatomicBody: boolean;
}

export function analyzeFormula(node: FormulaNode): FormulaFeatures {
  const elementTokens: string[] = [];
  const bodyTokens: string[] = [];
  let hasCount = false;
  let hasGroup = false;
  let hasExplicitOne = false;
  let hasIsotope = false;
  let maxCount = 0;
  let maxDepth = 0;

  const visit = (components: FormulaComponent[], depth: number, body: boolean) => {
    maxDepth = Math.max(maxDepth, depth);
    for (const component of components) {
      if (component.count !== undefined) {
        hasCount = true;
        maxCount = Math.max(maxCount, component.count);
        if (component.count === 1) hasExplicitOne = true;
      }
      if (component.type === "element") {
        elementTokens.push(component.symbol);
        if (body) bodyTokens.push(component.symbol);
        if (component.massNumber !== undefined) hasIsotope = true;
      } else {
        hasGroup = true;
        visit(component.components, depth + 1, body);
      }
    }
  };
  visit(node.components, 0, true);
  for (const adduct of node.adducts ?? []) {
    if (adduct.coefficient === 1) hasExplicitOne = true;
    visit(adduct.components, 0, false);
  }

  const distinctElements = [...new Set(elementTokens)];
  const distinctBody = new Set(bodyTokens);
  const [only] = node.components;
  return {
    elementTokens,
    distinctElements,
    hasCount,
    hasGroup,
    hasCoefficient: node.coefficient !== undefined,
    hasExplicitOne,
    maxCount,
    maxDepth,
    singleElementRepeated: distinctBody.size === 1 && bodyTokens.length > 1 && !hasGroup,
    hasIsotope,
    hasAdducts: (node.adducts?.length ?? 0) > 0,
    hasState: node.state !== undefined,
    chargeNotation: node.charge?.notation,
    monatomicBody: node.components.length === 1 && only?.type === "element" && !node.adducts?.length,
  };
}
