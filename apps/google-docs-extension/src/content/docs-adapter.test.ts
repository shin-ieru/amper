import { describe, expect, it } from "vitest";
import type { SuggestionList } from "@amper/shared-ui";
import type { BridgeRequest, BridgeResponse } from "./bridge-protocol";
import { compareDocsText, DocsAdapter, hostSubstitutedArrow, normalizeDocsText, verticalAlignOf } from "./docs-adapter";
import { formattingAdapter, formattingDocs, sendTrustedKeydown, typeKeys } from "./formatting-docs.fake";

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
        if (lo() < hi()) state.subscripted.push(state.text.slice(lo(), hi()));
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

  it.each([
    ["x^2", "x²"],
    ["x_12", "x₁₂"],
    ["V_max", "Vₘₐₓ"],
  ])("inserts Unicode fast path %s and restores it exactly", (typed, replacement) => {
    const docs = fakeDocs(`${typed} `);
    const adapter = adapterOn(docs, `${typed} `);
    expect(adapter.applyRewrite({ deleteCount: typed.length + 1, insertText: `${replacement} ` })).toBe(true);
    expect(docs.state.text).toBe(`${replacement} `);
    expect(adapter.applyRewrite({ deleteCount: replacement.length + 1, insertText: typed })).toBe(true);
    expect(docs.state.text).toBe(typed);
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

  it("a rewrite that only deletes (25xyzC → 25C) still removes the text and keeps the caret at the end", () => {
    const docs = fakeDocs("25xyzC ");
    const adapter = adapterOn(docs, "25xyzC ");
    expect(adapter.applyRewrite({ deleteCount: 7, insertText: "25C " })).toBe(true);
    expect(docs.state.text).toBe("25C ");
    expect(docs.state.caret).toBe(docs.state.text.length);
    expect(docs.state.anchor).toBe(docs.state.caret);
    expect(docs.ops).toContain("insert:C");
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
      // the typed boundary is kept (retyping it would rerun Docs' own autocorrect)
      "moveLeft:1", "selectBack:6", "copySelection", "insert:H₂O(l)",
      // select the label, toggle, read it back, collapse, check the previous and next characters
      "selectBack:3", "toggleSubscript", "copySelectionHtml", "moveRight:1",
      "moveLeft:3", "selectBack:1", "copySelectionHtml", "moveRight:1", "moveRight:3",
      "selectForward:1", "copySelectionHtml", "moveLeft:1",
      // back over the boundary; never a blind caret toggle (the next keystroke is verified instead)
      "moveRight:1",
    ]);
    expect(docs.ops.some((op, i) => op.startsWith("toggle") && docs.ops[i - 1]?.startsWith("moveRight"))).toBe(false);
  });

  it("normalises Docs layout characters when comparing", () => {
    expect(normalizeDocsText("a b‌\r\n")).toBe("a b\n");
  });
});

const SUB = (text: string, start: number, end: number) => ({ deleteCount: 0, insertText: text, formatting: [{ start, end, style: "subscript" as const }] });
const SUPER = (text: string, start: number, end: number) => ({ deleteCount: 0, insertText: text, formatting: [{ start, end, style: "superscript" as const }] });
const FRACTION = (numerator: string, denominator: string) => ({
  deleteCount: 0,
  insertText: `${numerator}⁄${denominator} `,
  formatting: [
    { start: 0, end: numerator.length, style: "superscript" as const },
    { start: numerator.length + 1, end: numerator.length + 1 + denominator.length, style: "subscript" as const },
  ],
});

describe("native Docs formatting (self-verifying)", () => {
  it.each(["x/y", "t/v", "b/y", "5/4", "12/24", "3/y", "x/2", "123/456"])("keeps %s as ordinary text and applies native scripts to the complete operands", (typed) => {
    const [numerator, denominator] = typed.split("/");
    const inserted = `${numerator}⁄${denominator} `;
    const formattedOperands = `${[...numerator!].map((character) => `^${character}`).join("")}⁄${[...denominator!].map((character) => `_${character}`).join("")}`;
    const docs = formattingDocs(`${typed} `);
    const adapter = formattingAdapter(docs, `${typed} `);
    expect(adapter.applyRewrite({ ...FRACTION(numerator!, denominator!), deleteCount: typed.length + 1 })).toBe(true);
    expect(docs.doc.chars.map(({ ch }) => ch).join("")).toBe(inserted);
    expect(docs.view()).toBe(`${formattedOperands} `);
    expect(docs.doc.chars.map(({ script }) => script)).toEqual([
      ...Array.from({ length: numerator!.length }, () => "superscript"),
      "baseline",
      ...Array.from({ length: denominator!.length }, () => "subscript"),
      "baseline",
    ]);
    typeKeys(adapter, docs, "tail");
    expect(docs.view()).toBe(`${formattedOperands} tail`);
    expect(docs.doc.chars.slice(inserted.length).every(({ script }) => script === "baseline")).toBe(true);
  });

  it("repairs native fraction styling that leaks onto the slash or following boundary", () => {
    const logs: string[] = [];
    const docs = formattingDocs("x/y ", { toggleLeaksToNext: true });
    const adapter = formattingAdapter(docs, "x/y ", logs);
    expect(adapter.applyRewrite({ ...FRACTION("x", "y"), deleteCount: 4 })).toBe(true);
    expect(docs.view()).toBe("^x⁄_y ");
    expect(docs.doc.chars.map(({ script }) => script)).toEqual(["superscript", "baseline", "subscript", "baseline"]);
    typeKeys(adapter, docs, "tail");
    expect(docs.view()).toBe("^x⁄_y tail");
    expect(logs.some((line) => line.startsWith("formatted") && line.includes('"leak":"fixed"'))).toBe(true);
  });

  it.each([["12", "24"], ["123", "456"], ["12", "x"]])("repairs a script that leaks back onto the slash for %s/%s", (numerator, denominator) => {
    const logs: string[] = [];
    const typed = `${numerator}/${denominator} `;
    const docs = formattingDocs(typed, { toggleLeaksToPrevious: true });
    const adapter = formattingAdapter(docs, typed, logs);
    expect(adapter.applyRewrite({ ...FRACTION(numerator, denominator), deleteCount: typed.length })).toBe(true);
    expect(docs.doc.chars.map(({ ch }) => ch).join("")).toBe(`${numerator}⁄${denominator} `);
    expect(docs.doc.chars.map(({ script }) => script)).toEqual([
      ...Array.from({ length: numerator.length }, () => "superscript"),
      "baseline",
      ...Array.from({ length: denominator.length }, () => "subscript"),
      "baseline",
    ]);
    if (denominator.length > 1) expect(logs.some((line) => line.includes('"leakBefore":"fixed"'))).toBe(true);
    typeKeys(adapter, docs, "tail");
    expect(docs.doc.chars.slice(-4).every(({ script }) => script === "baseline")).toBe(true);
  });

  it.each(["5/4", "12/24", "x/y"])("Backspace after accepting %s restores plain, unformatted source text", (typed) => {
    const [numerator, denominator] = typed.split("/") as [string, string];
    const docs = formattingDocs(`${typed} `);
    const adapter = formattingAdapter(docs, `${typed} `);
    adapter.applyRewrite({ ...FRACTION(numerator, denominator), deleteCount: typed.length + 1 });
    expect(docs.doc.chars.some(({ script }) => script !== "baseline")).toBe(true);
    // The session's reversal of a formatted conversion.
    expect(adapter.applyRewrite({ deleteCount: typed.length + 1, insertText: `${typed} `, plain: true })).toBe(true);
    expect(docs.view()).toBe(`${typed} `);
    typeKeys(adapter, docs, "tail");
    expect(docs.view()).toBe(`${typed} tail`);
  });

  it("restores plain text after an explicit sup(...) conversion", () => {
    const docs = formattingDocs("x sup(2) ");
    const adapter = formattingAdapter(docs, "x sup(2) ");
    adapter.applyRewrite({ deleteCount: 8, insertText: "2 ", formatting: [{ start: 0, end: 1, style: "superscript" }] });
    expect(docs.view()).toBe("x^2 ");
    adapter.applyRewrite({ deleteCount: 2, insertText: " sup(2) ", plain: true });
    expect(docs.view()).toBe("x sup(2) ");
  });

  it("repairs following characters if Docs keeps subscript active at the caret", () => {
    const docs = formattingDocs("x/y ");
    const adapter = formattingAdapter(docs, "x/y ");
    adapter.applyRewrite({ ...FRACTION("x", "y"), deleteCount: 4 });

    // A key the adapter could not type itself (e.g. AltGr): Docs typed it, scripted.
    docs.doc.typingScript = "subscript";
    docs.typeText("t");
    (adapter as unknown as { repairFollowingTextStyle(): void }).repairFollowingTextStyle();

    expect(docs.view()).toBe("^x⁄_y t");
    expect(docs.doc.chars.at(-1)?.script).toBe("baseline");
  });

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
    const adapter = formattingAdapter(docs, "H2O(l) ");
    adapter.applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    typeKeys(adapter, docs, "is water");
    expect(docs.view()).toBe("H₂O_(_l_) is water");
  });

  it("consecutive formulas do not leak into each other", () => {
    const docs = formattingDocs("H2O(l) ");
    const first = formattingAdapter(docs, "H2O(l) ");
    first.applyRewrite({ ...SUB("H₂O(l) ", 3, 6), deleteCount: 7 });
    typeKeys(first, docs, "NaCl(aq) ");
    // Formatting-only rewrite for a species whose text is already final.
    const second = formattingAdapter(docs, "NaCl(aq) ");
    second.applyRewrite({ ...SUB("NaCl(aq) ", 4, 8), deleteCount: 9 });
    typeKeys(second, docs, "CO2(g) ");
    const third = formattingAdapter(docs, "CO2(g) ");
    third.applyRewrite({ ...SUB("CO₂(g) ", 3, 6), deleteCount: 7 });
    typeKeys(third, docs, "is water");
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

  it.each([
    ["x_(max) ", "xmax ", 1, 4],
    ["x^(effective) ", "xeffective ", 1, 10],
    ["DeltaH_(formation of methane) ", "ΔHformation of methane ", 2, 22],
  ])("formats only the explicitly delimited phrase %j natively", (typed, inserted, start, end) => {
    const docs = formattingDocs(typed);
    const adapter = formattingAdapter(docs, typed);
    expect(adapter.applyRewrite({ deleteCount: typed.length, insertText: inserted, formatting: [{ start, end, style: typed.includes("_(") ? "subscript" : "superscript" }] })).toBe(true);
    const marker = typed.includes("_(") ? "_" : "^";
    const expectedView = Array.from(inserted).map((character, index) => index >= start && index < end ? `${marker}${character}` : character).join("");
    expect(docs.view()).toBe(expectedView);
    expect(docs.doc.caret).toBe(docs.doc.chars.length);
    expect(docs.doc.anchor).toBe(docs.doc.caret);
  });

  it("restores delimited subscript and superscript syntax exactly on immediate Backspace", () => {
    for (const [typed, output, start, end, style] of [
      ["x_(max) ", "xmax ", 1, 4, "subscript"],
      ["x^(effective) ", "xeffective ", 1, 10, "superscript"],
    ] as const) {
      const docs = formattingDocs(typed);
      const adapter = formattingAdapter(docs, typed);
      expect(adapter.applyRewrite({ deleteCount: typed.length, insertText: output, formatting: [{ start, end, style }] })).toBe(true);
      adapter.onKeyDown(() => true); // the controller consumes Backspace while restoring the conversion
      sendTrustedKeydown(adapter, "Backspace");
      expect(adapter.applyRewrite({ deleteCount: output.length, insertText: typed.slice(0, -1), plain: true })).toBe(true);
      expect(docs.view()).toBe(typed.slice(0, -1));
    }
  });

  it.each(["subscript", "superscript"] as const)("repairs %s leakage and following text stays baseline", (style) => {
    const docs = formattingDocs("xphrase ", { toggleLeaksToNext: true });
    const adapter = formattingAdapter(docs, "xphrase ");
    const rewrite = style === "subscript" ? SUB("xphrase ", 1, 7) : SUPER("xphrase ", 1, 7);
    expect(adapter.applyRewrite({ ...rewrite, deleteCount: 8 })).toBe(true);
    typeKeys(adapter, docs, "tail");
    expect(docs.view()).toBe(style === "subscript" ? "x_p_h_r_a_s_e tail" : "x^p^h^r^a^s^e tail");
  });

  it("reads vertical alignment from Docs clipboard HTML", () => {
    expect(verticalAlignOf('<span style="font-size:11pt;vertical-align:baseline;">x</span>')).toBe("baseline");
    expect(verticalAlignOf('<span style="vertical-align:sub;">(aq)</span>')).toBe("sub");
    expect(verticalAlignOf('<span style="vertical-align:super;">(effective)</span>')).toBe("super");
    expect(verticalAlignOf("<sup>2</sup>")).toBe("super");
    expect(verticalAlignOf('<span style="vertical-align:baseline;"><span style="vertical-align:super;">⁄</span></span>')).toBe("super");
    expect(verticalAlignOf('<span style="vertical-align:baseline;"><span style="vertical-align:sub;">y</span></span>')).toBe("sub");
    expect(verticalAlignOf('<span style="vertical-align:sub;">(</span><span style="vertical-align:baseline;">x</span>')).toBe("mixed");
    expect(verticalAlignOf(null)).toBe("unknown");
  });
});

describe("explicit sup(...), sub(...), frac(...) in the Docs adapter", () => {
  // Rewrites exactly as the session produces them for each typed command (+ Space).
  const CASES: { typed: string; rewrite: { deleteCount: number; insertText: string; formatting: { start: number; end: number; style: "subscript" | "superscript" }[] }; view: string }[] = [
    { typed: "x sup(2) ", rewrite: { deleteCount: 8, insertText: "2 ", formatting: [{ start: 0, end: 1, style: "superscript" }] }, view: "x^2 " },
    { typed: "10 sup(-3) ", rewrite: { deleteCount: 9, insertText: "-3 ", formatting: [{ start: 0, end: 2, style: "superscript" }] }, view: "10^-^3 " },
    {
      typed: "E sup(activation energy) ",
      rewrite: { deleteCount: 24, insertText: "activation energy ", formatting: [{ start: 0, end: 17, style: "superscript" }] },
      view: "E" + [..."activation energy"].map((c) => `^${c}`).join("") + " ",
    },
    { typed: "V sub(max) ", rewrite: { deleteCount: 10, insertText: "max ", formatting: [{ start: 0, end: 3, style: "subscript" }] }, view: "V_m_a_x " },
    {
      typed: "frac(12/24) ",
      rewrite: { deleteCount: 12, insertText: "12⁄24 ", formatting: [{ start: 0, end: 2, style: "superscript" }, { start: 3, end: 5, style: "subscript" }] },
      view: "^1^2⁄_2_4 ",
    },
    {
      typed: "frac(x/y) ",
      rewrite: { deleteCount: 10, insertText: "x⁄y ", formatting: [{ start: 0, end: 1, style: "superscript" }, { start: 2, end: 3, style: "subscript" }] },
      view: "^x⁄_y ",
    },
    // Compound operands with inner sub(...): operands stay baseline, only the inner content is subscript.
    {
      typed: "frac(P sub(0.5 atm) / P sub(1 bar)) ",
      rewrite: { deleteCount: 36, insertText: "P0.5 atm ⁄ P1 bar ", formatting: [{ start: 1, end: 8, style: "subscript" }, { start: 12, end: 17, style: "subscript" }] },
      view: "P_0_._5_ _a_t_m ⁄ P_1_ _b_a_r ",
    },
    {
      typed: "frac(T sub(0°C) / T sub(25°C)) ",
      rewrite: { deleteCount: 31, insertText: "T0°C ⁄ T25°C ", formatting: [{ start: 1, end: 4, style: "subscript" }, { start: 8, end: 12, style: "subscript" }] },
      view: "T_0_°_C ⁄ T_2_5_°_C ",
    },
  ];

  it.each(CASES)("$typed: delimiters vanish, only the content is formatted, caret at the end", ({ typed, rewrite, view }) => {
    const docs = formattingDocs(typed);
    expect(formattingAdapter(docs, typed).applyRewrite(rewrite)).toBeTruthy();
    expect(docs.view()).toBe(view);
    expect(docs.doc.caret).toBe(docs.doc.chars.length);
    expect(docs.doc.anchor).toBe(docs.doc.caret);
  });

  it.each(CASES.slice(-2))("$typed: repairs a script that leaks back onto the operand base", ({ typed, rewrite, view }) => {
    const docs = formattingDocs(typed, { toggleLeaksToPrevious: true });
    expect(formattingAdapter(docs, typed).applyRewrite(rewrite)).toBeTruthy();
    expect(docs.view()).toBe(view);
  });

  it.each(CASES)("$typed: typing afterwards is baseline", ({ typed, rewrite, view }) => {
    const docs = formattingDocs(typed);
    const adapter = formattingAdapter(docs, typed);
    adapter.applyRewrite(rewrite);
    typeKeys(adapter, docs, "next");
    expect(docs.view()).toBe(`${view}next`);
  });

  it.each(CASES)("$typed: immediate Backspace restores the shorthand as plain text", ({ typed, rewrite }) => {
    const docs = formattingDocs(typed);
    const adapter = formattingAdapter(docs, typed);
    adapter.applyRewrite(rewrite);
    const removed = typed.slice(typed.length - rewrite.deleteCount, -1);
    adapter.applyRewrite({ deleteCount: rewrite.insertText.length, insertText: removed, plain: true });
    expect(docs.view()).toBe(typed.slice(0, -1));
  });

  it("consecutive commands stay independent", () => {
    const docs = formattingDocs("x sup(2) ");
    const first = formattingAdapter(docs, "x sup(2) ");
    first.applyRewrite(CASES[0]!.rewrite);
    typeKeys(first, docs, "and V sub(max) ");
    const second = formattingAdapter(docs, "V sub(max) ");
    second.applyRewrite(CASES[3]!.rewrite);
    typeKeys(second, docs, "done");
    expect(docs.view()).toBe("x^2 and V_m_a_x done");
  });
});
