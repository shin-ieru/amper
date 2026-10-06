import type {
  CaretAnchor,
  AmperSuggestion,
  Disposable,
  EditorAdapter,
  EditorInputEvent,
  EditorKeyEvent,
  TailRewrite,
} from "@amper/core";
import type { SuggestionList } from "@amper/shared-ui";
import { caretCoordinates } from "./caret-coordinates";

const listen = <K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): Disposable => {
  target.addEventListener(type, handler);
  return { dispose: () => target.removeEventListener(type, handler) };
};

/**
 * EditorAdapter for a <textarea>. Rewrites go through
 * execCommand("insertText") so each one is a single native undo step; the
 * fallback (setRangeText) works everywhere but bypasses the undo stack.
 */
export class TextareaAdapter implements EditorAdapter {
  readonly capabilities = { interceptKeys: true };
  /** Caret position after the last input Amper observed or made; anything else is a caret move. */
  private knownCaret: number;
  undoIntegrated = true;

  constructor(
    private readonly el: HTMLTextAreaElement,
    private readonly overlay: SuggestionList,
  ) {
    this.knownCaret = el.selectionStart;
  }

  getContextBeforeCaret(maxChars: number): string {
    const { selectionStart, selectionEnd, value } = this.el;
    if (selectionStart !== selectionEnd) return "";
    return value.slice(Math.max(0, selectionStart - maxChars), selectionStart);
  }

  applyRewrite({ deleteCount, insertText }: TailRewrite): boolean {
    const caret = this.el.selectionStart;
    if (caret !== this.el.selectionEnd || deleteCount > caret) return false;
    // Formatting-only rewrite (subscript state labels): a textarea has no formatting, and
    // re-inserting identical text would only add an empty undo step.
    if (this.el.value.slice(caret - deleteCount, caret) === insertText) return true;
    this.el.setSelectionRange(caret - deleteCount, caret);
    const ok = document.execCommand("insertText", false, insertText);
    if (!ok) {
      this.undoIntegrated = false;
      this.el.setRangeText(insertText, caret - deleteCount, caret, "end");
    }
    this.knownCaret = this.el.selectionStart;
    return true;
  }

  onTextInput(handler: (event: EditorInputEvent) => void): Disposable {
    return listen(this.el, "input", (event) => {
      const e = event as InputEvent;
      this.knownCaret = this.el.selectionStart;
      if (e.isComposing) return;
      switch (e.inputType) {
        case "insertText":
          handler(e.data ? { type: "insertText", text: e.data } : { type: "other" });
          break;
        case "insertLineBreak":
        case "insertParagraph":
          handler({ type: "insertText", text: "\n" });
          break;
        case "deleteContentBackward":
          handler({ type: "deleteBackward" });
          break;
        case "historyUndo":
        case "historyRedo": {
          const end = this.el.selectionEnd;
          handler({ type: "history", textBeforeSelectionEnd: this.el.value.slice(Math.max(0, end - 256), end) });
          break;
        }
        default:
          // Paste, cut, undo/redo, drag-drop, composition commits, word deletes.
          handler({ type: "other" });
      }
    });
  }

  onKeyDown(handler: (event: EditorKeyEvent) => boolean): Disposable {
    return listen(this.el, "keydown", (e) => {
      if (e.isComposing) return;
      const consumed = handler({ key: e.key, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
      if (consumed) e.preventDefault();
    });
  }

  onSelectionChange(handler: () => void): Disposable {
    const check = () => {
      const { selectionStart, selectionEnd } = this.el;
      if (selectionStart !== selectionEnd || selectionStart !== this.knownCaret) {
        this.knownCaret = selectionStart;
        handler();
      }
    };
    const onDocumentSelection = () => {
      if (document.activeElement === this.el) check();
    };
    document.addEventListener("selectionchange", onDocumentSelection);
    const blur = listen(this.el, "blur", () => handler());
    const pointer = listen(this.el, "mouseup", check);
    return {
      dispose: () => {
        document.removeEventListener("selectionchange", onDocumentSelection);
        blur.dispose();
        pointer.dispose();
      },
    };
  }

  onComposition(handler: (phase: "start" | "end") => void): Disposable {
    const start = listen(this.el, "compositionstart", () => handler("start"));
    const end = listen(this.el, "compositionend", () => handler("end"));
    return { dispose: () => (start.dispose(), end.dispose()) };
  }

  showSuggestions(items: AmperSuggestion[], selected: number, anchor?: CaretAnchor): void {
    this.overlay.show(items, selected, anchor ?? caretCoordinates(this.el, this.el.selectionStart));
  }

  hideSuggestions(): void {
    this.overlay.hide();
  }
}
