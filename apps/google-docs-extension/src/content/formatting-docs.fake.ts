/**
 * Test-only fake of the MAIN-world bridge with a per-character formatting model of Google Docs.
 * Shared by the adapter unit tests and the engine + adapter integration tests. Not bundled.
 */
import type { SuggestionList } from "@amper/shared-ui";
import type { BridgeRequest, BridgeResponse } from "./bridge-protocol";
import { DocsAdapter } from "./docs-adapter";

/**
 * A fake Docs that models per-character formatting the way Docs does: typed characters take the
 * active typing style (text typed over a selection takes the selection's style), ⌘/Ctrl + , and
 * ⌘/Ctrl + . toggle the selection (all of it, when mixed) or the typing style at a collapsed
 * caret, and copy returns HTML spans with vertical-align. Options simulate the leaks and the
 * caret-settling behaviour seen in live Docs.
 */
export function formattingDocs(
  initial: string,
  options: {
    ignoreToggle?: boolean;
    toggleLeaksToNext?: boolean;
    toggleLeaksToPrevious?: boolean;
    /**
     * Seen live: moving the caret makes Docs type with the style of the glyph before it, so a
     * caret toggle afterwards turns a script ON. Without this, a selection toggle's result sticks.
     */
    caretSettles?: boolean;
  } = {},
) {
  type Script = "baseline" | "subscript" | "superscript";
  const doc = {
    chars: Array.from(initial).map((ch) => ({ ch, script: "baseline" as Script })),
    caret: Array.from(initial).length,
    anchor: Array.from(initial).length,
    typingScript: "baseline" as Script,
  };
  const ops: string[] = [];
  const lo = () => Math.min(doc.caret, doc.anchor);
  const hi = () => Math.max(doc.caret, doc.anchor);
  const html = (from: number, to: number) =>
    doc.chars.slice(from, to).map((c) => `<span style="vertical-align:${c.script === "subscript" ? "sub" : c.script === "superscript" ? "super" : "baseline"};">${c.ch}</span>`).join("");
  const settle = () => {
    if (options.caretSettles && lo() === hi()) doc.typingScript = doc.chars[doc.caret - 1]?.script ?? "baseline";
  };
  const bridge = (r: BridgeRequest): BridgeResponse => {
    ops.push(r.op);
    switch (r.op) {
      case "moveLeft":
        // A selection collapses to its left edge on the first press (Docs semantics).
        doc.caret = doc.anchor = lo() === hi() ? Math.max(0, doc.caret - r.count) : Math.max(0, lo() - (r.count - 1));
        settle();
        break;
      case "moveRight":
        for (let i = 0; i < r.count; i++) doc.caret = doc.anchor = lo() !== hi() ? hi() : Math.min(doc.chars.length, doc.caret + 1);
        settle();
        break;
      case "selectBack":
        doc.caret = Math.max(0, doc.caret - r.count);
        break;
      case "selectForward":
        doc.caret = Math.min(doc.chars.length, doc.caret + r.count);
        break;
      case "copySelection":
        return { ok: true, text: lo() === hi() ? null : doc.chars.slice(lo(), hi()).map((c) => c.ch).join("") };
      case "copySelectionHtml":
        return { ok: true, text: lo() === hi() ? null : html(lo(), hi()) };
      case "insert": {
        // Docs: text typed over a selection takes the selection's formatting; otherwise the typing style.
        const inherit = lo() < hi() ? doc.chars[lo()]?.script ?? "baseline" : doc.typingScript;
        const inserted = Array.from(r.text).map((ch) => ({ ch, script: inherit }));
        doc.chars.splice(lo(), hi() - lo(), ...inserted);
        doc.caret = doc.anchor = lo() + inserted.length;
        doc.typingScript = inherit;
        break;
      }
      case "toggleSubscript": {
        if (options.ignoreToggle) break;
        let applied = false;
        if (lo() === hi()) doc.typingScript = doc.typingScript === "subscript" ? "baseline" : "subscript";
        else {
          // Docs: an all-subscript selection is cleared; anything else (including mixed) becomes subscript.
          const all = doc.chars.slice(lo(), hi()).every((c) => c.script === "subscript");
          for (let i = lo(); i < hi(); i++) doc.chars[i]!.script = all ? "baseline" : "subscript";
          // Model: right after toggling a selection, Docs types with the selection's new style.
          doc.typingScript = all ? "baseline" : "subscript";
          applied = !all;
        }
        // Leaks are only seen when Docs applies a style (never when a toggle clears one).
        if (options.toggleLeaksToNext && applied && doc.chars[hi()]) doc.chars[hi()]!.script = "subscript";
        // Seen live: applying a style to a multi-character selection also formats the glyph before it.
        if (options.toggleLeaksToPrevious && applied && hi() - lo() > 1 && doc.chars[lo() - 1]) doc.chars[lo() - 1]!.script = "subscript";
        break;
      }
      case "toggleSuperscript": {
        if (options.ignoreToggle) break;
        let applied = false;
        if (lo() === hi()) doc.typingScript = doc.typingScript === "superscript" ? "baseline" : "superscript";
        else {
          // Docs: an all-superscript selection is cleared; anything else (including mixed) becomes superscript.
          const all = doc.chars.slice(lo(), hi()).every((c) => c.script === "superscript");
          for (let i = lo(); i < hi(); i++) doc.chars[i]!.script = all ? "baseline" : "superscript";
          // Model: right after toggling a selection, Docs types with the selection's new style.
          doc.typingScript = all ? "baseline" : "superscript";
          applied = !all;
        }
        // Leaks are only seen when Docs applies a style (never when a toggle clears one).
        if (options.toggleLeaksToNext && applied && doc.chars[hi()]) doc.chars[hi()]!.script = "superscript";
        // Seen live: applying a style to a multi-character selection also formats the glyph before it.
        if (options.toggleLeaksToPrevious && applied && hi() - lo() > 1 && doc.chars[lo() - 1]) doc.chars[lo() - 1]!.script = "superscript";
        break;
      }
    }
    return { ok: true };
  };
  /** The user keeps typing: characters inherit formatting from the one before the caret. */
  const typeText = (text: string) => {
    for (const ch of text) {
      doc.chars.splice(doc.caret, 0, { ch, script: doc.typingScript });
      doc.caret = doc.anchor = doc.caret + 1;
    }
  };
  const view = () => doc.chars.map((c) => c.script === "subscript" ? `_${c.ch}` : c.script === "superscript" ? `^${c.ch}` : c.ch).join("");
  return { doc, ops, bridge, typeText, view };
}

export function formattingAdapter(docs: ReturnType<typeof formattingDocs>, typed: string, logs: string[] = []) {
  const overlay = { host: {}, show() {}, hide() {} } as unknown as SuggestionList;
  const adapter = new DocsAdapter({} as HTMLIFrameElement, overlay, {
    strategy: "keypress",
    verify: true,
    log: (event, data) => logs.push(`${event} ${JSON.stringify(data ?? {})}`),
    bridge: docs.bridge,
  });
  for (const ch of typed) adapter.buffer.keyDown({ key: ch, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  return adapter;
}

/** Sends a trusted keydown through the adapter; returns whether the adapter consumed it. */
export function sendTrustedKeydown(adapter: DocsAdapter, key: string): boolean {
  let prevented = false;
  const event = {
    isTrusted: true,
    isComposing: false,
    key,
    shiftKey: /^[A-Z]$/.test(key),
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {},
  } as KeyboardEvent;
  (adapter as unknown as { handleKeyDown(event: KeyboardEvent): void }).handleKeyDown(event);
  return prevented;
}

/** The user types `text`: each key goes to the adapter first; keys it does not consume, Docs types. */
export function typeKeys(adapter: DocsAdapter, docs: ReturnType<typeof formattingDocs>, text: string): void {
  for (const ch of text) {
    if (/^[A-Z]$/.test(ch)) sendTrustedKeydown(adapter, "Shift");
    if (!sendTrustedKeydown(adapter, ch)) docs.typeText(ch);
  }
}
