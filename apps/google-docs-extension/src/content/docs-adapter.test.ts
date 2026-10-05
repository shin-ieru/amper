import { describe, expect, it } from "vitest";
import type { SuggestionList } from "@chemly/shared-ui";
import type { BridgeRequest, BridgeResponse } from "./bridge-protocol";
import { compareDocsText, DocsAdapter, normalizeDocsText } from "./docs-adapter";

/**
 * A recording fake of the MAIN-world bridge backed by a string + caret, with
 * Docs' observed semantics (validated live in docs/spike/validate-bridge.mjs):
 * Shift+ArrowLeft extends a selection, copy returns it, ArrowRight collapses
 * a selection to its right edge, typing replaces the selection.
 */
function fakeDocs(initial: string, options: { corruptCopy?: boolean; capitalise?: boolean } = {}) {
  const state = { text: initial, caret: initial.length, anchor: initial.length };
  const ops: string[] = [];
  const bridge = (r: BridgeRequest): BridgeResponse => {
    ops.push(r.op + ("count" in r ? `:${r.count}` : "") + (r.op === "insert" ? `:${r.text}` : ""));
    const lo = () => Math.min(state.caret, state.anchor);
    const hi = () => Math.max(state.caret, state.anchor);
    switch (r.op) {
      case "moveLeft":
        state.caret = state.anchor = Math.max(0, state.caret - r.count);
        break;
      case "moveRight":
        for (let i = 0; i < r.count; i++) {
          state.caret = state.anchor = state.caret !== state.anchor ? hi() : Math.min(state.text.length, state.caret + 1);
        }
        break;
      case "selectBack":
        state.caret = Math.max(0, state.caret - r.count);
        break;
      case "copySelection":
        return { ok: true, text: state.caret === state.anchor ? null : options.corruptCopy ? "zzz".padEnd(hi() - lo(), "z") : state.text.slice(lo(), hi()) };
      case "insert":
        state.text = state.text.slice(0, lo()) + r.text + state.text.slice(hi());
        state.caret = state.anchor = lo() + r.text.length;
        break;
    }
    return { ok: true };
  };
  return { state, ops, bridge };
}

function adapterOn(docs: ReturnType<typeof fakeDocs>, typed: string) {
  const overlay = { host: {}, show() {}, hide() {} } as unknown as SuggestionList;
  const adapter = new DocsAdapter({} as HTMLIFrameElement, overlay, { strategy: "keypress", verify: true, log: () => {}, bridge: docs.bridge });
  for (const ch of typed) adapter.buffer.keyDown({ key: ch, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false });
  return adapter;
}

describe("DocsAdapter.applyRewrite", () => {
  it("steps over the boundary, selects only changed text, verifies, inserts, steps back", () => {
    const docs = fakeDocs("Note: capital sigma ");
    const adapter = adapterOn(docs, "capital sigma ");
    expect(adapter.applyRewrite({ deleteCount: 14, insertText: "Σ " })).toBe(true);
    expect(docs.state.text).toBe("Note: Σ ");
    expect(docs.state.caret).toBe("Note: Σ ".length);
    expect(docs.ops).toEqual(["moveLeft:1", "selectBack:13", "copySelection", "insert:Σ", "moveRight:1"]);
    expect(adapter.buffer.text).toBe("Σ ");
  });

  it("aborts without editing when the document does not match the model", () => {
    const docs = fakeDocs("Note: capital sigma ", { corruptCopy: true });
    const adapter = adapterOn(docs, "capital sigma ");
    expect(adapter.applyRewrite({ deleteCount: 14, insertText: "Σ " })).toBe(false);
    expect(docs.state.text).toBe("Note: capital sigma ");
    expect(docs.state.caret).toBe("Note: capital sigma ".length);
    expect(docs.state.anchor).toBe(docs.state.caret);
    expect(adapter.buffer.text).toBe("");
  });

  it("restores the original on Backspace via the same primitive", () => {
    const docs = fakeDocs("H₂SO₄ ");
    const adapter = adapterOn(docs, "H2SO4 ");
    adapter.buffer.applyRewrite({ deleteCount: 6, insertText: "H₂SO₄ " });
    expect(adapter.applyRewrite({ deleteCount: 6, insertText: "H2SO4" })).toBe(true);
    expect(docs.state.text).toBe("H2SO4");
  });

  it("refuses rewrites larger than what the buffer knows", () => {
    const docs = fakeDocs("xyz");
    const adapter = adapterOn(docs, "z");
    expect(adapter.applyRewrite({ deleteCount: 3, insertText: "" })).toBe(false);
    expect(docs.ops).toEqual([]);
  });

  it("proceeds when Docs only re-cased the text, and reports the document's real text", () => {
    // Docs auto-capitalised "capital" at the start of the sentence; the buffer still holds the typed form.
    const docs = fakeDocs("Capital sigma ");
    const adapter = adapterOn(docs, "capital sigma ");
    expect(adapter.applyRewrite({ deleteCount: 14, insertText: "Σ " })).toEqual({ ok: true, removedTail: "Capital sigma " });
    expect(docs.state.text).toBe("Σ ");
  });

  it("still aborts when the text really differs", () => {
    const docs = fakeDocs("Capital sigma ", { corruptCopy: true });
    const adapter = adapterOn(docs, "capital sigma ");
    expect(adapter.applyRewrite({ deleteCount: 14, insertText: "Σ " })).toBe(false);
    expect(docs.state.text).toBe("Capital sigma ");
  });

  it("classifies differences", () => {
    expect(compareDocsText("Capital sigma", "capital sigma")).toBe("case-only");
    expect(compareDocsText("capital\u00a0sigma", "capital sigma")).toBe("same");
    expect(compareDocsText("capital sigmas", "capital sigma")).toBe("different");
    expect(compareDocsText("Capitol sigma", "capital sigma")).toBe("different");
  });

  it("normalises Docs layout characters when comparing", () => {
    expect(normalizeDocsText("a b‌\r\n")).toBe("a b\n");
  });
});
