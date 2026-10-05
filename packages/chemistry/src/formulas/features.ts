import type { FormulaComponent, FormulaNode } from "./ast";

/**
 * Structural facts about a parsed formula. The confidence policy in
 * @chemly/core turns these into a score; this module only describes.
 */
export interface FormulaFeatures {
  /** Every element occurrence, in order (with repeats). */
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
}

export function analyzeFormula(node: FormulaNode): FormulaFeatures {
  const elementTokens: string[] = [];
  let hasCount = false;
  let hasGroup = false;
  let hasExplicitOne = false;
  let maxCount = 0;
  let maxDepth = 0;

  const visit = (components: FormulaComponent[], depth: number) => {
    maxDepth = Math.max(maxDepth, depth);
    for (const component of components) {
      if (component.count !== undefined) {
        hasCount = true;
        maxCount = Math.max(maxCount, component.count);
        if (component.count === 1) hasExplicitOne = true;
      }
      if (component.type === "element") {
        elementTokens.push(component.symbol);
      } else {
        hasGroup = true;
        visit(component.components, depth + 1);
      }
    }
  };
  visit(node.components, 0);

  const distinctElements = [...new Set(elementTokens)];
  return {
    elementTokens,
    distinctElements,
    hasCount,
    hasGroup,
    hasCoefficient: node.coefficient !== undefined,
    hasExplicitOne,
    maxCount,
    maxDepth,
    singleElementRepeated: distinctElements.length === 1 && elementTokens.length > 1,
  };
}
