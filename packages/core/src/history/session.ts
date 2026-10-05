import { recognitionToSuggestion, type ChemlyEngine } from "../engine/engine";
import { boundaryTrigger } from "../engine/text";
import { SUGGEST_CAP } from "../confidence/policy";
import type {
  ChemlySettings,
  ChemlySuggestion,
  ChemlyTransaction,
  ChemlyTrigger,
  EngineDecision,
  Recognition,
  TailRewrite,
} from "../types";

export type SessionOutcome =
  | { kind: "none"; decision?: EngineDecision }
  | { kind: "rewrite"; rewrite: TailRewrite; transaction: ChemlyTransaction; decision?: EngineDecision }
  | { kind: "suggest"; suggestions: ChemlySuggestion[]; decision?: EngineDecision };

interface PendingSuggestions {
  items: ChemlySuggestion[];
  selected: number;
  /** Text before the caret when offered; acceptance is refused if it changed. */
  context: string;
  /** Boundary that was typed after the suggested span, if any. */
  boundary: string;
}

export interface SessionOptions {
  now?: () => number;
  /** After this many immediate restorations of the same input, it stops autocorrecting (spec §56). */
  demoteAfterRestores?: number;
}

let sequence = 0;
const nextId = () => `tx-${Date.now().toString(36)}-${(++sequence).toString(36)}`;

/**
 * Editor-independent state machine for one editing surface.
 *
 * Every method receives the current text before the caret (a bounded window)
 * and answers with what the host should do. The session never touches an
 * editor itself, which is what lets the playground, the Google Docs adapter
 * and the unit tests share one implementation of conversion and reversal.
 *
 * Reversal model (spec §8): after a conversion, the next relevant key decides.
 * Backspace with the conversion still intact immediately before the caret
 * restores the typed original as one rewrite and suppresses re-conversion at
 * the next boundary. Any other input, caret movement or external change
 * cancels the one-shot restore.
 */
export class ChemlySession {
  private pending: ChemlyTransaction | undefined;
  private suppressed: string | undefined;
  private suggestions: PendingSuggestions | undefined;
  private composing = false;
  private readonly restoreCounts = new Map<string, number>();
  private readonly now: () => number;
  private readonly demoteAfter: number;

  constructor(
    private readonly engine: ChemlyEngine,
    private readonly settings: () => ChemlySettings,
    options: SessionOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.demoteAfter = options.demoteAfterRestores ?? 2;
  }

  get pendingTransaction(): ChemlyTransaction | undefined {
    return this.pending;
  }

  get activeSuggestions(): { items: ChemlySuggestion[]; selected: number } | undefined {
    return this.suggestions && { items: this.suggestions.items, selected: this.suggestions.selected };
  }

  get suppressedText(): string | undefined {
    return this.suppressed;
  }

  /** A boundary character was committed; `textBeforeCaret` already ends with it. */
  boundaryTyped(textBeforeCaret: string, boundary: string): SessionOutcome {
    this.pending = undefined;
    this.suggestions = undefined;
    const suppressed = this.suppressed;
    this.suppressed = undefined;

    const trigger = boundaryTrigger(boundary);
    if (this.composing || !trigger || !textBeforeCaret.endsWith(boundary)) return { kind: "none" };

    const textBefore = textBeforeCaret.slice(0, -boundary.length);
    const decision = this.engine.evaluate({ textBefore, trigger }, this.settings());

    if (decision.action === "autocorrect") {
      const r = decision.recognition;
      if (suppressed !== undefined && r.original === suppressed && r.end <= textBefore.length) {
        decision.debug.rejections.push({ recognizer: r.recognizer, candidate: r.original, reason: "just restored by Backspace" });
        return { kind: "none", decision: { action: "none", debug: decision.debug } };
      }
      if ((this.restoreCounts.get(r.original) ?? 0) >= this.demoteAfter) {
        r.confidence = Math.min(r.confidence, SUGGEST_CAP);
        r.reasons.push("restored repeatedly this session: suggesting instead");
        return this.offer([recognitionToSuggestion(r)], textBeforeCaret, boundary, decision);
      }
      return this.convert(r, textBeforeCaret, boundary, trigger, decision);
    }
    if (decision.action === "suggest") {
      return this.offer(decision.suggestions, textBeforeCaret, boundary, decision);
    }
    return { kind: "none", decision };
  }

  /** A non-boundary character was committed. Cancels one-shot state; may offer completions. */
  textTyped(textBeforeCaret: string): SessionOutcome {
    this.pending = undefined;
    this.suppressed = undefined;
    this.suggestions = undefined;
    if (this.composing) return { kind: "none" };
    const items = this.engine.complete(textBeforeCaret, this.settings());
    if (items.length === 0) return { kind: "none" };
    return this.offer(items, textBeforeCaret, "");
  }

  /**
   * Backspace is about to be handled by a host that lets Chemly intercept it.
   * Returns a restore rewrite when the last conversion is intact before the caret.
   */
  backspacePressed(textBeforeCaret: string): SessionOutcome {
    const tx = this.pending;
    if (tx && this.settings().backspaceRestore && textBeforeCaret.endsWith(tx.insertedTail)) {
      return this.restore(tx, tx.insertedTail, textBeforeCaret);
    }
    this.reset();
    return { kind: "none" };
  }

  /**
   * The host already deleted one character (hosts where key interception is
   * unreliable, e.g. a Docs fallback). Restores if what remains is the
   * conversion minus its final character.
   */
  backspaceApplied(textBeforeCaret: string): SessionOutcome {
    const tx = this.pending;
    if (tx && this.settings().backspaceRestore) {
      const remaining = Array.from(tx.insertedTail).slice(0, -1).join("");
      if (remaining && textBeforeCaret.endsWith(remaining)) return this.restore(tx, remaining, textBeforeCaret);
    }
    this.reset();
    return { kind: "none" };
  }

  acceptSuggestion(textBeforeCaret: string, index?: number): SessionOutcome {
    const state = this.suggestions;
    this.suggestions = undefined;
    if (!state || state.context !== textBeforeCaret) return { kind: "none" };
    const s = state.items[index ?? state.selected];
    if (!s) return { kind: "none" };

    const removedTail = textBeforeCaret.slice(s.start);
    const tailAfterSpan = textBeforeCaret.slice(s.end);
    const tx = this.transaction({
      ruleId: s.ruleId,
      category: s.category,
      originalText: s.original,
      replacementText: s.replacement,
      startOffset: s.start,
      endOffsetBefore: textBeforeCaret.length,
      trigger: "tab",
      confidence: s.confidence,
      removedTail,
      insertedTail: s.replacement + tailAfterSpan,
      // Accepting is deliberate, so Backspace puts back exactly what was there.
      restoreText: removedTail,
    });
    this.pending = this.settings().backspaceRestore ? tx : undefined;
    return { kind: "rewrite", rewrite: { deleteCount: removedTail.length, insertText: tx.insertedTail }, transaction: tx };
  }

  moveSuggestion(delta: number): void {
    if (!this.suggestions) return;
    const n = this.suggestions.items.length;
    this.suggestions.selected = (this.suggestions.selected + delta + n) % n;
  }

  dismissSuggestions(): void {
    this.suggestions = undefined;
  }

  compositionStart(): void {
    this.composing = true;
    this.reset();
  }

  compositionEnd(): void {
    this.composing = false;
  }

  /** Caret moved, selection changed, focus left, or the host changed text Chemly did not observe. */
  reset(): void {
    this.pending = undefined;
    this.suppressed = undefined;
    this.suggestions = undefined;
  }

  private convert(
    r: Recognition,
    textBeforeCaret: string,
    boundary: string,
    trigger: ChemlyTrigger,
    decision: EngineDecision,
  ): SessionOutcome {
    const textBefore = textBeforeCaret.slice(0, -boundary.length);
    const removedTail = textBeforeCaret.slice(r.start);
    const tx = this.transaction({
      ruleId: r.ruleId,
      category: r.category,
      originalText: r.original,
      replacementText: r.replacement,
      startOffset: r.start,
      endOffsetBefore: textBeforeCaret.length,
      trigger,
      confidence: r.confidence,
      removedTail,
      insertedTail: r.replacement + textBefore.slice(r.end) + boundary,
      // Spec §8: Backspace restores what was typed, without the boundary.
      restoreText: textBefore.slice(r.start),
    });
    this.pending = this.settings().backspaceRestore ? tx : undefined;
    return {
      kind: "rewrite",
      rewrite: { deleteCount: removedTail.length, insertText: tx.insertedTail },
      transaction: tx,
      decision,
    };
  }

  private restore(tx: ChemlyTransaction, presentTail: string, textBeforeCaret: string): SessionOutcome {
    this.pending = undefined;
    this.suggestions = undefined;
    this.suppressed = tx.originalText;
    this.restoreCounts.set(tx.originalText, (this.restoreCounts.get(tx.originalText) ?? 0) + 1);
    const restoreTx = this.transaction({
      ruleId: tx.ruleId,
      category: tx.category,
      kind: "restore",
      originalText: tx.replacementText,
      replacementText: tx.originalText,
      startOffset: textBeforeCaret.length - presentTail.length,
      endOffsetBefore: textBeforeCaret.length,
      trigger: "manual",
      confidence: 1,
      removedTail: presentTail,
      insertedTail: tx.restoreText,
      restoreText: presentTail,
      reversible: false,
    });
    return { kind: "rewrite", rewrite: { deleteCount: presentTail.length, insertText: tx.restoreText }, transaction: restoreTx };
  }

  private offer(
    items: ChemlySuggestion[],
    textBeforeCaret: string,
    boundary: string,
    decision?: EngineDecision,
  ): SessionOutcome {
    this.suggestions = { items, selected: 0, context: textBeforeCaret, boundary };
    return { kind: "suggest", suggestions: items, ...(decision && { decision }) };
  }

  private transaction(
    fields: Omit<ChemlyTransaction, "id" | "kind" | "timestamp" | "reversible" | "endOffsetAfter"> &
      Partial<Pick<ChemlyTransaction, "kind" | "reversible">>,
  ): ChemlyTransaction {
    return {
      id: nextId(),
      kind: "convert",
      reversible: true,
      ...fields,
      endOffsetAfter: fields.startOffset + fields.insertedTail.length,
      timestamp: this.now(),
    };
  }
}
