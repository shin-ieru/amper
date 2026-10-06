import type { AmperSuggestion, Disposable, TailRewrite } from "../types";

/** Committed input the host observed. Composition (IME) text arrives only once committed. */
export type EditorInputEvent =
  | { type: "insertText"; text: string }
  | { type: "deleteBackward" }
  /**
   * Native undo/redo. Undoing a pending Amper conversion counts as the user rejecting it.
   * Hosts that select the restored text (browsers do) pass the text before the selection's end.
   */
  | { type: "history"; textBeforeSelectionEnd?: string }
  /** Paste, cut, formatting, or anything Amper cannot model: resets one-shot state. */
  | { type: "other" };

export interface EditorKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface AdapterCapabilities {
  /**
   * The adapter can stop the host from handling a key (Backspace, Tab, Esc,
   * arrows) when Amper consumes it. When false, Backspace reversal runs after
   * the host deletes one character instead.
   */
  interceptKeys: boolean;
}

export interface CaretAnchor {
  /** Viewport coordinates of the caret's bottom-left corner, for positioning overlays. */
  x: number;
  y: number;
}

/**
 * Result of applying a rewrite. `removedTail` reports the text the host actually
 * replaced when it differs from Amper's model only in ways the host itself
 * introduced (Docs auto-capitalising "capital" → "Capital"), so restoration
 * puts back what was really in the document.
 */
export type ApplyResult = boolean | { ok: boolean; removedTail?: string };

/**
 * Host contract (spec §41), adapted for hosts without document offsets:
 * context is "text before the caret" and edits are caret-relative tail
 * rewrites. The engine never sees a host; only this interface does.
 */
export interface EditorAdapter {
  readonly capabilities: AdapterCapabilities;
  getContextBeforeCaret(maxChars: number): string;
  applyRewrite(rewrite: TailRewrite): ApplyResult | Promise<ApplyResult>;

  onTextInput(handler: (event: EditorInputEvent) => void): Disposable;
  /** Return true from the handler to consume the key. */
  onKeyDown(handler: (event: EditorKeyEvent) => boolean): Disposable;
  /** Caret moved or selection changed for any reason other than Amper's own edits. */
  onSelectionChange(handler: () => void): Disposable;
  onComposition(handler: (phase: "start" | "end") => void): Disposable;

  showSuggestions?(items: AmperSuggestion[], selected: number, anchor?: CaretAnchor): void;
  hideSuggestions?(): void;
}
