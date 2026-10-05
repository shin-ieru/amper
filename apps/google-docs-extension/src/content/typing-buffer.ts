import type { TailRewrite } from "@chemly/core";

export interface KeyInfo {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export type BufferEffect =
  | { kind: "insert"; text: string }
  | { kind: "deleteBackward" }
  | { kind: "reset"; reason: string }
  | { kind: "none" };

const NAVIGATION = new Set([
  "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown",
]);
const NO_TEXT_CHANGE = new Set([
  "Shift", "Control", "Alt", "Meta", "CapsLock", "Escape", "Delete", "Fn", "FnLock", "NumLock",
  "ScrollLock", "ContextMenu", "Insert",
]);
const UNKNOWN_INPUT = new Set(["Dead", "Process", "Unidentified", "Compose", "Tab"]);

/**
 * Shadow model of "the text immediately before the caret" for a host that
 * does not expose its text (Google Docs renders to canvas; ADR-003).
 *
 * It records committed characters typed since the last discontinuity. Any key
 * whose text effect it cannot be sure of (shortcuts, navigation, dead keys,
 * paste, clicks) resets it to empty. Empty context means Chemly sees nothing
 * to convert, so uncertainty degrades to "do nothing", never to a wrong edit.
 * Text typed by collaborators elsewhere does not change what is immediately
 * before this user's caret, so it does not invalidate the buffer.
 */
export class TypingBuffer {
  private value = "";

  constructor(private readonly maxChars = 512) {}

  get text(): string {
    return this.value;
  }

  /** Classify a trusted keydown the host is about to handle, and update the model. */
  keyDown(k: KeyInfo): BufferEffect {
    if (NO_TEXT_CHANGE.has(k.key)) return { kind: "none" };
    if (k.ctrlKey || k.metaKey) return this.reset("shortcut");
    // Option/Alt+key composes characters on macOS and is a shortcut elsewhere.
    if (k.altKey) return this.reset("alt-modified key");
    if (NAVIGATION.has(k.key)) return this.reset("caret moved");
    if (UNKNOWN_INPUT.has(k.key)) return this.reset(`untracked key ${k.key}`);

    if (k.key === "Backspace") {
      if (this.value) this.value = Array.from(this.value).slice(0, -1).join("");
      return { kind: "deleteBackward" };
    }
    if (k.key === "Enter") return this.append("\n");
    if (Array.from(k.key).length === 1) return this.append(k.key);
    return { kind: "none" };
  }

  /** Mirror a rewrite Chemly applied. Returns false if the model cannot have produced it. */
  applyRewrite({ deleteCount, insertText }: TailRewrite): boolean {
    if (deleteCount > this.value.length) {
      this.value = "";
      return false;
    }
    this.value = (this.value.slice(0, this.value.length - deleteCount) + insertText).slice(-this.maxChars);
    return true;
  }

  reset(reason = "reset"): BufferEffect {
    this.value = "";
    return { kind: "reset", reason };
  }

  private append(text: string): BufferEffect {
    this.value = (this.value + text).slice(-this.maxChars);
    return { kind: "insert", text };
  }
}
