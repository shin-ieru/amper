import { CONTEXT_CHARS_BEFORE, boundaryTrigger } from "../engine/text";
import type { ChemlySession, SessionOutcome } from "../history/session";
import type { ChemlySuggestion, ChemlyTransaction, Disposable, EngineDecision } from "../types";
import type { EditorAdapter, EditorInputEvent, EditorKeyEvent } from "./adapter";

export type ControllerEvent =
  | { type: "decision"; decision: EngineDecision }
  | { type: "applied"; transaction: ChemlyTransaction }
  | { type: "apply-failed"; transaction: ChemlyTransaction }
  | { type: "suggestions"; items: ChemlySuggestion[]; selected: number }
  | { type: "reset"; reason: string };

export interface ControllerOptions {
  contextChars?: number;
  onEvent?: (event: ControllerEvent) => void;
}

const isPlain = (e: EditorKeyEvent) => !e.ctrlKey && !e.metaKey && !e.altKey;

/**
 * Wires an EditorAdapter to a ChemlySession. Host-agnostic: the playground,
 * the Google Docs content script and the in-memory test editor all use it.
 */
export class ChemlyController {
  private applying = false;
  private readonly contextChars: number;

  constructor(
    private readonly adapter: EditorAdapter,
    private readonly session: ChemlySession,
    private readonly options: ControllerOptions = {},
  ) {
    this.contextChars = options.contextChars ?? CONTEXT_CHARS_BEFORE;
  }

  start(): Disposable {
    const subscriptions = [
      this.adapter.onTextInput((e) => this.handleInput(e)),
      this.adapter.onKeyDown((e) => this.handleKeyDown(e)),
      this.adapter.onSelectionChange(() => this.handleSelectionChange()),
      this.adapter.onComposition((phase) => {
        if (phase === "start") this.session.compositionStart();
        else this.session.compositionEnd();
        this.syncSuggestions();
      }),
    ];
    return { dispose: () => subscriptions.forEach((s) => s.dispose()) };
  }

  /** Accept a visible suggestion explicitly (e.g. clicked in the popup). */
  accept(index?: number): void {
    if (this.applying || !this.session.activeSuggestions) return;
    this.handle(this.session.acceptSuggestion(this.context(), index));
  }

  /** Dismiss visible suggestions (e.g. the editor lost focus). */
  dismiss(): void {
    this.session.dismissSuggestions();
    this.syncSuggestions();
  }

  /** True while Chemly's own rewrite is being applied; adapters may use it to ignore echoes. */
  get isApplying(): boolean {
    return this.applying;
  }

  private context(): string {
    return this.adapter.getContextBeforeCaret(this.contextChars);
  }

  private handleInput(event: EditorInputEvent): void {
    if (this.applying) return;
    let outcome: SessionOutcome;
    if (event.type === "insertText" && boundaryTrigger(event.text)) {
      outcome = this.session.boundaryTyped(this.context(), event.text);
    } else if (event.type === "insertText" && Array.from(event.text).length === 1) {
      outcome = this.session.textTyped(this.context());
    } else if (event.type === "deleteBackward" && !this.adapter.capabilities.interceptKeys) {
      outcome = this.session.backspaceApplied(this.context());
    } else {
      this.session.reset();
      this.emit({ type: "reset", reason: event.type === "insertText" ? "multi-character insert" : event.type });
      outcome = { kind: "none" };
    }
    this.handle(outcome);
  }

  private handleKeyDown(event: EditorKeyEvent): boolean {
    if (this.applying) return false;
    const active = this.session.activeSuggestions;
    if (active && isPlain(event)) {
      switch (event.key) {
        case "Tab":
          if (event.shiftKey) break;
          this.handle(this.session.acceptSuggestion(this.context()));
          return true;
        case "Escape":
          this.session.dismissSuggestions();
          this.syncSuggestions();
          return true;
        case "ArrowDown":
        case "ArrowUp":
          if (active.items.length < 2) break;
          this.session.moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
          this.syncSuggestions();
          return true;
      }
    }
    if (event.key === "Backspace" && isPlain(event) && !event.shiftKey && this.adapter.capabilities.interceptKeys) {
      const outcome = this.session.backspacePressed(this.context());
      if (outcome.kind === "rewrite") {
        this.handle(outcome);
        return true;
      }
      this.syncSuggestions();
    }
    return false;
  }

  private handleSelectionChange(): void {
    if (this.applying) return;
    if (this.session.pendingTransaction || this.session.activeSuggestions || this.session.suppressedText) {
      this.emit({ type: "reset", reason: "caret moved" });
    }
    this.session.reset();
    this.syncSuggestions();
  }

  private handle(outcome: SessionOutcome): void {
    if (outcome.decision) this.emit({ type: "decision", decision: outcome.decision });
    if (outcome.kind === "rewrite") this.apply(outcome.transaction, outcome.rewrite);
    this.syncSuggestions();
  }

  private apply(transaction: ChemlyTransaction, rewrite: { deleteCount: number; insertText: string }): void {
    this.applying = true;
    const finish = (ok: boolean) => {
      this.applying = false;
      if (ok) {
        this.emit({ type: "applied", transaction });
      } else {
        this.session.reset();
        this.emit({ type: "apply-failed", transaction });
      }
      this.syncSuggestions();
    };
    let result: boolean | Promise<boolean>;
    try {
      result = this.adapter.applyRewrite(rewrite);
    } catch {
      finish(false);
      return;
    }
    if (typeof result === "boolean") finish(result);
    else result.then(finish, () => finish(false));
  }

  private syncSuggestions(): void {
    const active = this.session.activeSuggestions;
    if (active && !this.applying) {
      this.adapter.showSuggestions?.(active.items, active.selected);
      this.emit({ type: "suggestions", items: active.items, selected: active.selected });
    } else {
      this.adapter.hideSuggestions?.();
    }
  }

  private emit(event: ControllerEvent): void {
    this.options.onEvent?.(event);
  }
}
