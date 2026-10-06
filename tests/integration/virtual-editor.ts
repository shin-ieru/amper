import {
  AmperController,
  AmperSession,
  createEngine,
  resolveSettings,
  type AmperEngine,
  type AmperSettingsInput,
  type AmperSuggestion,
  type ControllerEvent,
  type Disposable,
  type EditorAdapter,
  type EditorInputEvent,
  type EditorKeyEvent,
  type TailRewrite,
} from "@amper/core";

type Handler<T> = (event: T) => void;

/**
 * In-memory editor implementing the EditorAdapter contract with native-style
 * semantics: keys go to keydown first (consumable), then mutate the text and
 * emit input events. Each typed character and each rewrite is an undo step.
 */
export class VirtualEditor implements EditorAdapter {
  text = "";
  caret = 0;
  visibleSuggestions: { items: AmperSuggestion[]; selected: number } | undefined;
  readonly capabilities: { interceptKeys: boolean };

  private readonly undoStack: { text: string; caret: number }[] = [];
  private inputHandlers: Handler<EditorInputEvent>[] = [];
  private keyHandlers: ((e: EditorKeyEvent) => boolean)[] = [];
  private selectionHandlers: (() => void)[] = [];
  private compositionHandlers: Handler<"start" | "end">[] = [];

  constructor(options: { interceptKeys?: boolean } = {}) {
    this.capabilities = { interceptKeys: options.interceptKeys ?? true };
  }

  getContextBeforeCaret(maxChars: number): string {
    return this.text.slice(Math.max(0, this.caret - maxChars), this.caret);
  }

  applyRewrite({ deleteCount, insertText }: TailRewrite): boolean {
    if (deleteCount > this.caret) return false;
    this.snapshot();
    this.text = this.text.slice(0, this.caret - deleteCount) + insertText + this.text.slice(this.caret);
    this.caret = this.caret - deleteCount + insertText.length;
    return true;
  }

  onTextInput(handler: Handler<EditorInputEvent>): Disposable {
    this.inputHandlers.push(handler);
    return { dispose: () => (this.inputHandlers = this.inputHandlers.filter((h) => h !== handler)) };
  }
  onKeyDown(handler: (e: EditorKeyEvent) => boolean): Disposable {
    this.keyHandlers.push(handler);
    return { dispose: () => (this.keyHandlers = this.keyHandlers.filter((h) => h !== handler)) };
  }
  onSelectionChange(handler: () => void): Disposable {
    this.selectionHandlers.push(handler);
    return { dispose: () => (this.selectionHandlers = this.selectionHandlers.filter((h) => h !== handler)) };
  }
  onComposition(handler: Handler<"start" | "end">): Disposable {
    this.compositionHandlers.push(handler);
    return { dispose: () => (this.compositionHandlers = this.compositionHandlers.filter((h) => h !== handler)) };
  }
  showSuggestions(items: AmperSuggestion[], selected: number): void {
    this.visibleSuggestions = { items, selected };
  }
  hideSuggestions(): void {
    this.visibleSuggestions = undefined;
  }

  /** Types text one character at a time; "\n" is Enter. */
  type(text: string): this {
    for (const ch of text) {
      if (this.keyDown(ch === "\n" ? "Enter" : ch)) continue;
      this.insert(ch);
    }
    return this;
  }

  /** Presses a named key: Backspace, Tab, Escape, ArrowLeft, ArrowRight, ArrowUp, ArrowDown. */
  press(key: string, modifiers: Partial<Omit<EditorKeyEvent, "key">> = {}): this {
    if (this.keyDown(key, modifiers)) return this;
    switch (key) {
      case "Backspace":
        if (this.caret === 0) break;
        this.snapshot();
        this.text = this.text.slice(0, this.caret - 1) + this.text.slice(this.caret);
        this.caret -= 1;
        this.emitInput({ type: "deleteBackward" });
        break;
      case "ArrowLeft":
        this.caret = Math.max(0, this.caret - 1);
        this.selectionHandlers.forEach((h) => h());
        break;
      case "ArrowRight":
        this.caret = Math.min(this.text.length, this.caret + 1);
        this.selectionHandlers.forEach((h) => h());
        break;
      case "Tab":
        this.insert("\t");
        break;
    }
    return this;
  }

  /** Simulates an IME composition that commits `text` at the end. */
  compose(text: string): this {
    this.compositionHandlers.forEach((h) => h("start"));
    this.compositionHandlers.forEach((h) => h("end"));
    this.snapshot();
    this.text = this.text.slice(0, this.caret) + text + this.text.slice(this.caret);
    this.caret += text.length;
    this.emitInput({ type: "insertText", text });
    return this;
  }

  /** Native undo: restores the previous snapshot. */
  undo(): this {
    const previous = this.undoStack.pop();
    if (previous) {
      this.text = previous.text;
      this.caret = previous.caret;
      this.emitInput({ type: "history" });
    }
    return this;
  }

  private insert(ch: string) {
    this.snapshot();
    this.text = this.text.slice(0, this.caret) + ch + this.text.slice(this.caret);
    this.caret += ch.length;
    this.emitInput({ type: "insertText", text: ch });
  }

  private keyDown(key: string, modifiers: Partial<Omit<EditorKeyEvent, "key">> = {}): boolean {
    const event: EditorKeyEvent = { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...modifiers };
    return this.keyHandlers.some((h) => h(event));
  }

  private emitInput(event: EditorInputEvent) {
    this.inputHandlers.forEach((h) => h(event));
  }

  private snapshot() {
    this.undoStack.push({ text: this.text, caret: this.caret });
  }
}

const sharedEngine: AmperEngine = createEngine();

export function setup(settings: AmperSettingsInput = {}, options: { interceptKeys?: boolean } = {}) {
  const editor = new VirtualEditor(options);
  const current = { settings: resolveSettings(settings) };
  const session = new AmperSession(sharedEngine, () => current.settings);
  const events: ControllerEvent[] = [];
  const controller = new AmperController(editor, session, { onEvent: (e) => events.push(e) });
  controller.start();
  return { editor, session, events, current };
}
