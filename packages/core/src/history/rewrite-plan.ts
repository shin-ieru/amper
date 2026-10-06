import type { TailRewrite } from "../types";

export interface RewritePlan {
  /** Unchanged text immediately before the caret that the edit must step around. */
  keepSuffix: string;
  /** Text to remove (just before keepSuffix). */
  deleteText: string;
  /** Text to insert in its place. */
  insertText: string;
}

/**
 * Narrows a tail rewrite to the characters that actually change, so hosts
 * with costly or structure-sensitive edits (Google Docs: synthetic key events,
 * list/paragraph breaks) touch as little as possible. "capital sigma " → "Σ "
 * keeps the typed space; "H2SO4 " → "H₂SO₄ " keeps "H" and " ".
 *
 * Operates on whole code points so a surrogate pair is never split.
 */
export interface PlanOptions {
  /** Never keep more than this many trailing code points (formatting spans must be re-inserted). */
  maxKeepSuffix?: number;
  /** Do not skip unchanged leading characters. */
  noPrefix?: boolean;
}

export function planRewrite(removedTail: string, rewrite: TailRewrite, options: PlanOptions = {}): RewritePlan {
  const removed = Array.from(removedTail);
  const inserted = Array.from(rewrite.insertText);
  let suffix = 0;
  while (
    suffix < (options.maxKeepSuffix ?? Infinity) &&
    suffix < removed.length &&
    suffix < inserted.length &&
    removed[removed.length - 1 - suffix] === inserted[inserted.length - 1 - suffix]
  ) {
    suffix++;
  }
  let prefix = 0;
  while (
    !options.noPrefix &&
    prefix < removed.length - suffix &&
    prefix < inserted.length - suffix &&
    removed[prefix] === inserted[prefix]
  ) {
    prefix++;
  }
  return {
    keepSuffix: removed.slice(removed.length - suffix).join(""),
    deleteText: removed.slice(prefix, removed.length - suffix).join(""),
    insertText: inserted.slice(prefix, inserted.length - suffix).join(""),
  };
}
