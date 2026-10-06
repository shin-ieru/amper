import { describe, expect, it } from "vitest";
import type { SuggestionList } from "@amper/shared-ui";
import type { BridgeRequest, BridgeResponse } from "./bridge-protocol";
import { compareDocsText, DocsAdapter, hostSubstitutedArrow, normalizeDocsText, verticalAlignOf } from "./docs-adapter";

/**
 * A recording fake of the MAIN-world bridge backed by a string + caret, with
 * Docs' observed semantics (validated live in docs/spike/validate-bridge.mjs):
 * Shift+ArrowLeft extends a selection, copy returns it, ArrowRight collapses
 * a selection to its right edge, typing replaces the selection.
 */
function fakeDocs(initial: string, options: { corruptCopy?: boolean; capitalise?: boolean } = {}) {
  const state = { text: initial, caret: initial.length, anchor: initial.length, subscripted: [] as string[] };
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
      case "selectForward":
        state.caret = Math.min(state.text.length, state.caret + r.count);
        break;
      case "copySelectionHtml":
        return { ok: true, text: null }; // this fake has no formatting model (see formattingDocs below)
      case "copySelection":
        return { ok: true, text: state.caret === state.anchor ? null : options.corruptCopy ? "zzz".padEnd(hi() - lo(), "z") : state.text.slice(lo(), hi()) };
      case "insert":
        state.text = state.text.slice(0, lo()) + r.text + state.text.slice(hi());
        state.caret = state.anchor = lo() + r.text.length;
        break;
      case "toggleSubscript":
        state.subscripted.push(state.text.slice(lo(), hi()));
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

  it("replaces Docs' own arrow substitution (<=> → ⇔) with the exact equilibrium arrow ⇌", () => {
    // Docs substituted the typed "<=>" before Amper converted it; the buffer still holds "<=>".
    const docs = fakeDocs("N2 + 3H2 ⇔ ");
    const adapter = adapterOn(docs, "N2 + 3H2 <=> ");
    expect(adapter.applyRewrite({ deleteCount: 4, insertText: "⇌ " })).toEqual({ ok: true, removedTail: "⇔ " });
    expect(docs.state.text).toBe("N2 + 3H2 ⇌ ");
    expect(docs.state.text.codePointAt(9)).toBe(0x21cc);
    expect(docs.state.caret).toBe(docs.state.text.length);
    expect(adapter.buffer.text).toBe("N2 + 3H2 ⇌ ");
  });

  it("handles every substitutable shorthand, and aborts when the host text is not an arrow", () => {
    for (const [typed, hostGlyph, canonical] of [["->", "→", "→"], ["<-", "←", "←"], ["<->", "↔", "⇄"], ["<=>", "⇔", "⇌"]] as const) {
      const docs = fakeDocs(`H2O ${hostGlyph} `);
      const adapter = adapterOn(docs, `H2O ${typed} `);
      expect(adapter.applyRewrite({ deleteCount: typed.length + 1, insertText: `${canonical} ` }), typed).toMatchObject({ ok: true });
      expect(docs.state.text, typed).toBe(`H2O ${canonical} `);
    }
    expect(hostSubstitutedArrow("2Oz", "<=>")).toBeUndefined();
    expect(hostSubstitutedArrow("2 ⇔", "H2O")).toBeUndefined();
  });

  it("re-inserts a formatted state label and toggles native subscript on exactly that range", () => {
    const docs = fakeDocs("H2O(l) ");
    const adapter = adapterOn(docs, "H2O(l) ");
    const result = adapter.applyRewrite({ deleteCount: 7, insertText: "H₂O(l) ", formatting: [{ start: 3, end: 6, style: "subscript" }] });
    expect(result).toBe(true);
    expect(docs.state.text).toBe("H₂O(l) ");
    expect(docs.state.subscripted).toEqual(["(l)"]);
    expect(docs.state.caret).toBe(docs.state.text.length);
    expect(docs.state.anchor).toBe(docs.state.caret);
    // The unchanged "(l)" is not kept as suffix: Docs' subscript is a toggle, so it must be fresh text.
    expect(docs.ops).toEqual([
      "moveLeft:1", "selectBack:6", "copySelection", "insert:H₂O(l)",
      // select the label, toggle, read it back, collapse, check the next character, collapse back
      "selectBack:3", "toggleSubscript", "copySelectionHtml", "moveRight:1", "selectForward:1", "copySelectionHtml", "moveLeft:1",
      "moveRight:1",
    ]);
  });

  it("normalises Docs layout characters when comparing", () => {
    expect(normalizeDocsText("a b‌\r\n")).toBe("a b\n");
  });
});

/**
 * A fake Docs that models per-character formatting the way Docs does: inserted
 * characters inherit the formatting of the character before them (which is how
 * subscript would leak into following text), ⌘/Ctrl + , toggles the selection,
 * and copy returns HTML spans with vertical-align. Options simulate failures.
 */
function formattingDocs(initial: string, options: { ignoreToggle?: boolean; toggleLeaksToNext?: boolean } = {}) {
  const doc = { chars: Array.from(initial).map((ch) => ({ ch, sub: false })), caret: Array.from(initial).length, anchor: Array.from(initial).length };
  const ops: string[] = [];
  const lo = () => Math.min(doc.caret, doc.anchor);
  const hi = () => Math.max(doc.caret, doc.anchor);
  const html = (from: number, to: number) =>
    doc.chars.slice(from, to).map((c) => `<span style="vertical-align:${c.sub ? "sub" : "baseline"};">${c.ch}</span>`).join("");
  const bridge = (r: BridgeRequest): BridgeResponse => {
    ops.push(r.op);
    switch (r.op) {
      case "moveLeft":
        // A selection collapses to its left edge on the first press (Docs semantics).
        doc.caret = doc.anchor = lo() === hi() ? Math.max(0, doc.caret - r.count) : Math.max(0, lo() - (r.count - 1));
        break;
      case "moveRight":
        for (let i = 0; i < r.count; i++) doc.caret = doc.anchor = lo() !== hi() ? hi() : Math.min(doc.chars.length, doc.caret + 1);
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
        const inherit = doc.chars[lo() - 1]?.sub ?? false;
        const inserted = Array.from(r.text).map((ch) => ({ ch, sub: inherit }));
        doc.chars.splice(lo(), hi() - lo(), ...inserted);
        doc.caret = doc.anchor = lo() + inserted.length;
        break;
      }
      case "toggleSubscript":
        if (options.ignoreToggle) break;
        for (let i = lo(); i < hi(); i++) doc.chars[i]!.sub = !doc.chars[i]!.sub;
        if (options.toggleLeaksToNext && doc.chars[hi()]) doc.chars[hi()]!.sub = true;
        break;
    }
    return { ok: true };
  };
  /** The user keeps typing: characters inherit formatting from the one before the caret. */
  const typeText = (text: string) => {
    for (const ch of text) {
      doc.chars.splice(doc.caret, 0, { ch, sub: doc.chars[doc.caret - 1]?.sub ?? false });
      doc.caret = doc.anchor = doc.caret + 1;
    }
  };
  const view = () => doc.chars.map((c) => (c.sub ? `_${c.ch}` : c.ch)).join("");
  return { doc, ops, bridge, typeText, view };
}

function formattingAdapter(docs: ReturnType<typeof formattingDocs>, typed: string, logs: string[] = []) {
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

const SUB = (text: string, start: number, end: number) => ({ deleteCount: 0, insertText: text, formatting: [{ start, end, style: "subscript" as const }] });

describe("native subscript state labels (self-verifying)", () => {
  it.each([
    ["H2O(l) ", "H₂O(l) ", 3, 6, "H₂O_(_l_) "],
    ["CO2(g) ", "CO₂(g) ", 3, 6, "CO₂_(_g_) "],
    ["NaCl(aq) ", "NaCl(aq) ", 4, 8, "NaCl_(_a_q_) "],
    ["CaCO3(s) ", "CaCO₃(s) ", 5, 8, "CaCO₃_(_s_) "],
  ])("%j: only the whole label is subscript, the boundary stays baseline, caret at the end", (typed, inserted, start, end, view) => {
    const docs = formattingDocs(typed);
    const adapter = formattingAdapter(docs, typed);
    expect(adapter.applyRewrite({ ...SUB(inserted, start, end), deleteCount: typed.length })).toBe(true);
    expect(docs.view()).toBe(view);
    expect(docs.doc.caret).toBe(docs.doc.chars.length);
    expect(docs.doc.anchor).toBe(docs.doc.caret);
  });

  it("typing after the conversion returns to baseline", () => {
    const docs = formattingDocs("H2O(l) ");
    formattingAdapter(docs, "H2O(l) ").applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    docs.typeText("is water");
    expect(docs.view()).toBe("H₂O_(_l_) is water");
  });

  it("consecutive formulas do not leak into each other", () => {
    const docs = formattingDocs("H2O(l) ");
    formattingAdapter(docs, "H2O(l) ").applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    docs.typeText("NaCl(aq) ");
    // Formatting-only rewrite for a species whose text is already final.
    formattingAdapter(docs, "NaCl(aq) ").applyRewrite({ ...SUB("NaCl(aq) ", 4, 8), deleteCount: 9 });
    docs.typeText("CO2(g) ");
    formattingAdapter(docs, "CO2(g) ").applyRewrite({ ...SUB("CO₂(g) ", 3, 6), deleteCount: 7 });
    docs.typeText("is water");
    expect(docs.view()).toBe("H₂O_(_l_) NaCl_(_a_q_) CO₂_(_g_) is water");
  });

  it("repairs subscript that leaked onto the following character", () => {
    const logs: string[] = [];
    const docs = formattingDocs("H2O(l) ", { toggleLeaksToNext: true });
    formattingAdapter(docs, "H2O(l) ", logs).applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    expect(docs.view()).toBe("H₂O_(_l_) ");
    expect(logs.some((l) => l.includes('"leak":"fixed"'))).toBe(true);
  });

  it("if Docs ignores the shortcut, the text stays correct and the failure is reported, not hidden", () => {
    const logs: string[] = [];
    const docs = formattingDocs("H2O(l) ", { ignoreToggle: true });
    expect(formattingAdapter(docs, "H2O(l) ", logs).applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 })).toBe(true);
    expect(docs.view()).toBe("H₂O(l) ");
    expect(logs.some((l) => l.startsWith("formatted") && l.includes('"verified":"baseline"'))).toBe(true);
  });

  it("Backspace restoration re-inserts the typed text as baseline", () => {
    const docs = formattingDocs("H2O(l) ");
    const adapter = formattingAdapter(docs, "H2O(l) ");
    adapter.applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    adapter.applyRewrite({ deleteCount: 7, insertText: "H2O(l)" });
    expect(docs.view()).toBe("H2O(l)");
  });

  it("reads vertical alignment from Docs clipboard HTML", () => {
    expect(verticalAlignOf('<span style="font-size:11pt;vertical-align:baseline;">x</span>')).toBe("baseline");
    expect(verticalAlignOf('<span style="vertical-align:sub;">(aq)</span>')).toBe("sub");
    expect(verticalAlignOf('<span style="vertical-align:sub;">(</span><span style="vertical-align:baseline;">x</span>')).toBe("mixed");
    expect(verticalAlignOf(null)).toBe("unknown");
  });
});
