import {
  planRewrite,
  type ApplyResult,
  type CaretAnchor,
  type AmperSuggestion,
  type Disposable,
  type EditorAdapter,
  type EditorInputEvent,
  type EditorKeyEvent,
  type TailRewrite,
} from "@amper/core";
import type { SuggestionList } from "@amper/shared-ui";
import { bridgeRequest } from "./bridge-client";
import type { BridgeRequest, BridgeResponse, InsertStrategy } from "./bridge-protocol";
import { TypingBuffer, type BufferEffect } from "./typing-buffer";

export interface DocsAdapterOptions {
  strategy: InsertStrategy;
  /** Read the selection back (synthetic copy) before replacing it, and abort on mismatch. */
  verify: boolean;
  log: (event: string, data?: Record<string, unknown>) => void;
  /** Injectable for tests. */
  bridge?: (request: BridgeRequest) => BridgeResponse;
}

type Handlers = {
  input: ((e: EditorInputEvent) => void)[];
  key: ((e: EditorKeyEvent) => boolean)[];
  selection: (() => void)[];
  composition: ((phase: "start" | "end") => void)[];
};

/** Docs inserts NBSP/zero-width characters for layout; compare text semantically. */
export function normalizeDocsText(text: string): string {
  return text
    .replace(/\r\n?|\u000b/g, "\n")
    .replace(/ /g, " ")
    .replace(/[​‌‍﻿]/g, "");
}

const codePoints = (text: string) => Array.from(text).length;

/**
 * "same": identical after layout normalisation. "case-only": same letters, different
 * case, same length (host auto-capitalisation). Anything else is "different" and aborts.
 */
export function compareDocsText(copied: string, expected: string): "same" | "case-only" | "different" {
  const a = normalizeDocsText(copied);
  const b = normalizeDocsText(expected);
  if (a === b) return "same";
  if (a.length === b.length && copied.length === expected.length && a.toLowerCase() === b.toLowerCase()) return "case-only";
  return "different";
}

/**
 * Google Docs EditorAdapter (spike prototype, ADR-003).
 *
 * Input: trusted keydown events on the hidden text-event iframe, observed in
 * the capture phase, feed a TypingBuffer (Docs renders to canvas, so the text
 * itself is never read from the DOM). The controller is notified after Docs
 * has applied the key (next task, or synchronously before the next key).
 *
 * Output: caret-relative edits through the MAIN-world bridge: step left over
 * the unchanged boundary, Shift+ArrowLeft over the changed text, optionally
 * read it back with a synthetic copy and abort on mismatch, insert, step back.
 */
export class DocsAdapter implements EditorAdapter {
  readonly capabilities = { interceptKeys: true };
  readonly buffer = new TypingBuffer();
  private readonly handlers: Handlers = { input: [], key: [], selection: [], composition: [] };
  private readonly listeners: (() => void)[] = [];
  private pending: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private composing = false;
  private readonly bridge: (request: BridgeRequest) => BridgeResponse;

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly overlay: SuggestionList,
    private readonly options: DocsAdapterOptions,
  ) {
    this.bridge = options.bridge ?? bridgeRequest;
  }

  attach(): void {
    const win = this.frame.contentWindow;
    if (!win) throw new Error("text event frame has no window");
    const on = <K extends keyof WindowEventMap>(t: Window | Document, type: K, fn: (e: WindowEventMap[K]) => void) => {
      t.addEventListener(type, fn as EventListener, true);
      this.listeners.push(() => t.removeEventListener(type, fn as EventListener, true));
    };
    on(win, "keydown", (e) => this.handleKeyDown(e));
    on(win, "compositionstart", () => {
      this.flush();
      this.composing = true;
      this.buffer.reset("composition");
      this.handlers.composition.forEach((h) => h("start"));
    });
    on(win, "compositionend", () => {
      this.composing = false;
      this.handlers.composition.forEach((h) => h("end"));
      // Committed IME text is not modelled; start fresh after it.
      this.discontinuity("composition committed");
    });
    for (const type of ["paste", "cut", "drop"] as const) on(win, type, (e) => e.isTrusted && this.discontinuity(type));
    on(win, "blur", () => this.discontinuity("focus left"));
    // Clicks land on the canvas in the top document; ignore clicks on Amper's own popup.
    on(document, "mousedown", (e) => {
      if (!e.composedPath().includes(this.overlay.host)) this.discontinuity("pointer");
    });
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.listeners.splice(0).forEach((off) => off());
    this.overlay.hide();
  }

  // ---- EditorAdapter --------------------------------------------------------

  getContextBeforeCaret(maxChars: number): string {
    return this.buffer.text.slice(-maxChars);
  }

  applyRewrite(rewrite: TailRewrite): ApplyResult {
    const text = this.buffer.text;
    const removed = text.slice(text.length - rewrite.deleteCount);
    if (removed.length !== rewrite.deleteCount) return false;
    const plan = planRewrite(removed, rewrite);
    const step = codePoints(plan.keepSuffix);
    const select = codePoints(plan.deleteText);
    const started = performance.now();

    let observedDelete: string | undefined;
    const call = (request: BridgeRequest) => {
      const response = this.bridge(request);
      if (!response.ok) throw new Error(response.error);
      return response;
    };
    try {
      if (step) call({ op: "moveLeft", count: step });
      if (select) {
        call({ op: "selectBack", count: select });
        if (this.options.verify) {
          const copied = call({ op: "copySelection" }).text;
          const match = typeof copied === "string" ? compareDocsText(copied, plan.deleteText) : "unverified";
          // Docs may have re-cased what was typed (sentence auto-capitalisation): same text, proceed,
          // and report the document's actual characters so Backspace restores them.
          if (match === "case-only") observedDelete = copied!;
          if (match === "different") {
            // Collapse the selection to its right edge (the original caret), then restore the step.
            call({ op: "moveRight", count: 1 });
            if (step) call({ op: "moveRight", count: step });
            this.buffer.reset("verify mismatch");
            this.options.log("verify-mismatch", { expected: select, got: codePoints(copied!) });
            return false;
          }
          if (match === "unverified") this.options.log("unverified", { reason: "copy returned no text" });
          if (match === "case-only") this.options.log("case-drift", { length: select });
        }
      }
      if (plan.insertText) call({ op: "insert", text: plan.insertText, strategy: this.options.strategy });
      if (step) call({ op: "moveRight", count: step });
    } catch (error) {
      this.buffer.reset("bridge error");
      this.options.log("apply-error", { error: String(error) });
      return false;
    }
    this.buffer.applyRewrite(rewrite);
    this.options.log("applied", { stepped: step, selected: select, inserted: codePoints(plan.insertText), ms: +(performance.now() - started).toFixed(2) });
    if (observedDelete === undefined) return true;
    const kept = removed.length - plan.deleteText.length - plan.keepSuffix.length;
    return { ok: true, removedTail: removed.slice(0, kept) + observedDelete + plan.keepSuffix };
  }

  onTextInput(handler: (e: EditorInputEvent) => void): Disposable {
    return this.subscribe("input", handler);
  }
  onKeyDown(handler: (e: EditorKeyEvent) => boolean): Disposable {
    return this.subscribe("key", handler);
  }
  onSelectionChange(handler: () => void): Disposable {
    return this.subscribe("selection", handler);
  }
  onComposition(handler: (phase: "start" | "end") => void): Disposable {
    return this.subscribe("composition", handler);
  }

  showSuggestions(items: AmperSuggestion[], selected: number, anchor?: CaretAnchor): void {
    this.overlay.show(items, selected, anchor ?? caretAnchor());
  }
  hideSuggestions(): void {
    this.overlay.hide();
  }

  // ---- internals --------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    // Synthetic events (ours, via the bridge) are untrusted and never modelled.
    if (!e.isTrusted) return;
    this.flush();
    if (this.composing || e.isComposing || e.key === "Process") {
      this.buffer.reset("composition");
      return;
    }
    const info = { key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey };
    if (this.handlers.key.some((h) => h(info))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    this.defer(this.buffer.keyDown(info));
  }

  /** Notify the controller once Docs has applied the key. */
  private defer(effect: BufferEffect): void {
    if (effect.kind === "none") return;
    this.pending = () => {
      if (effect.kind === "insert") this.emitInput({ type: "insertText", text: effect.text });
      else if (effect.kind === "deleteBackward") this.emitInput({ type: "deleteBackward" });
      else this.handlers.selection.forEach((h) => h());
    };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 0);
  }

  private flush(): void {
    const pending = this.pending;
    this.pending = undefined;
    pending?.();
  }

  private discontinuity(reason: string): void {
    this.flush();
    this.buffer.reset(reason);
    this.handlers.selection.forEach((h) => h());
  }

  private emitInput(event: EditorInputEvent): void {
    this.handlers.input.forEach((h) => h(event));
  }

  private subscribe<K extends keyof Handlers>(kind: K, handler: Handlers[K][number]): Disposable {
    const list = this.handlers[kind] as Handlers[K][number][];
    list.push(handler);
    return { dispose: () => list.splice(list.indexOf(handler), 1) };
  }
}

/** Overlay anchor from Docs' caret element; falls back to the editor's top centre. */
function caretAnchor(): CaretAnchor {
  const caret = document.querySelector(".kix-cursor-caret")?.getBoundingClientRect();
  if (caret && caret.height > 0) return { x: caret.left, y: caret.bottom };
  const editor = document.querySelector(".kix-appview-editor")?.getBoundingClientRect();
  return editor ? { x: editor.left + editor.width / 2 - 120, y: editor.top + 12 } : { x: 24, y: 96 };
}
