/**
 * After every native-formatting conversion, the next typed character in Google Docs must be
 * ordinary baseline text, and so must a Backspace restore and the text typed after it.
 *
 * The exact rewrites come from the real engine and session (via the in-memory editor) and are
 * applied through the real Docs adapter against a fake bridge with a per-character formatting
 * model. Both Docs typing-state behaviours are covered: a selection toggle's result sticking as
 * the typing style, and moving the caret settling it to the glyph before the caret (which is what
 * made an unconditional caret toggle turn superscript on in live Docs). Following text is typed as
 * real keystrokes through the adapter, which types the first one itself and verifies its style;
 * the keyup fallback is deliberately not run.
 */
import { describe, expect, it } from "vitest";
import { productSettings, type TailRewrite } from "@amper/core";
import { formattingAdapter, formattingDocs, sendTrustedKeydown, typeKeys } from "../../apps/google-docs-extension/src/content/formatting-docs.fake";
import { setup } from "./virtual-editor";

const CASES: { typed: string; tab?: boolean }[] = [
  { typed: "x sup(2)" },
  { typed: "V sub(max)" },
  { typed: "E sup(activation energy)" },
  { typed: "x^2" },
  { typed: "x_2" },
  { typed: "x^(effective)" },
  { typed: "x_(max)" },
  { typed: "frac(x/y)" },
  { typed: "frac(12/24)" },
  { typed: "frac(x / y)" },
  { typed: "frac(P sub(0.5 atm) / P sub(1 bar))" },
  { typed: "frac(T sub(0°C) / T sub(25°C))" },
  { typed: "H2O(l)" },
  { typed: "CaCO3(s)" },
  { typed: "5/4", tab: true },
  { typed: "12/24", tab: true },
];

const DOCS_MODELS = [
  { name: "selection toggle sticks", options: {} },
  { name: "caret move settles the style", options: { caretSettles: true } },
  { name: "caret settles + toggle leaks back", options: { caretSettles: true, toggleLeaksToPrevious: true } },
  { name: "toggle leaks forward", options: { toggleLeaksToNext: true } },
] as const;

/** The engine's forward rewrite for `typed + " "` (Tab-accepted if a suggestion) and its Backspace restore. */
function engineRewrites(typed: string, tab: boolean): { forward: TailRewrite; restore: TailRewrite; source: string } {
  const { editor } = setup(productSettings());
  editor.type(`${typed} `);
  if (tab) editor.press("Tab");
  const forward = editor.rewrites.at(-1)!;
  editor.press("Backspace");
  const restore = editor.rewrites.at(-1)!;
  return { forward, restore, source: editor.text };
}

/** Per-character scripts the rewrite asks for, in code points. */
function expectedScripts(rewrite: TailRewrite): string[] {
  const chars = Array.from(rewrite.insertText);
  return chars.map((_, index) => {
    const offset = Array.from(rewrite.insertText).slice(0, index).join("").length;
    return rewrite.formatting?.find((span) => span.start <= offset && offset < span.end)?.style ?? "baseline";
  });
}

for (const model of DOCS_MODELS) {
  describe(`Docs caret style after a conversion (${model.name})`, () => {
    it.each(CASES)("$typed: formats exactly the intended range, then typing is baseline", ({ typed, tab = false }) => {
      const { forward } = engineRewrites(typed, tab);
      const docs = formattingDocs(`${typed} `, model.options);
      const adapter = formattingAdapter(docs, `${typed} `);
      expect(adapter.applyRewrite(forward)).toBeTruthy();
      const prefix = docs.doc.chars.length - Array.from(forward.insertText).length;
      expect(docs.doc.chars.slice(prefix).map((c) => c.ch).join("")).toBe(forward.insertText);
      expect(docs.doc.chars.slice(prefix).map((c) => c.script)).toEqual(expectedScripts(forward));
      // Text before the rewrite (the base x of "x sup(2)") is untouched.
      expect(docs.doc.chars.slice(0, prefix).every((c) => c.script === "baseline"), docs.view()).toBe(true);
      expect(docs.doc.caret).toBe(docs.doc.chars.length);
      expect(docs.doc.anchor).toBe(docs.doc.caret);
      // The next typed word (a Shift-capital first) is ordinary text, and so is everything after it.
      typeKeys(adapter, docs, "Next word");
      expect(docs.doc.chars.slice(-9).map((c) => c.ch).join("")).toBe("Next word");
      expect(docs.doc.chars.slice(-9).every((c) => c.script === "baseline"), docs.view()).toBe(true);
    });

    it.each(CASES)("$typed: immediate Backspace restores the shorthand as baseline, and typing after it is baseline", ({ typed, tab = false }) => {
      const { forward, restore, source } = engineRewrites(typed, tab);
      const docs = formattingDocs(`${typed} `, model.options);
      const adapter = formattingAdapter(docs, `${typed} `);
      adapter.applyRewrite(forward);
      adapter.onKeyDown((key) => key.key === "Backspace"); // the controller consumes Backspace while restoring
      sendTrustedKeydown(adapter, "Backspace");
      expect(adapter.applyRewrite(restore)).toBeTruthy();
      expect(docs.doc.chars.map((c) => c.ch).join("")).toBe(source);
      expect(docs.doc.chars.every((c) => c.script === "baseline"), docs.view()).toBe(true);
      typeKeys(adapter, docs, " Next");
      expect(docs.doc.chars.map((c) => c.ch).join("")).toBe(`${source} Next`);
      expect(docs.doc.chars.every((c) => c.script === "baseline"), docs.view()).toBe(true);
    });
  });
}

describe("the adapter never toggles the caret style blindly", () => {
  it.each(CASES)("$typed: every script toggle is on a selection it has just read or selected", ({ typed, tab = false }) => {
    const { forward, restore } = engineRewrites(typed, tab);
    // Conversion + next keystroke, and conversion + Backspace restore + next keystroke.
    const converted = formattingDocs(`${typed} `, { caretSettles: true });
    const first = formattingAdapter(converted, `${typed} `);
    first.applyRewrite(forward);
    typeKeys(first, converted, "N");
    const restored = formattingDocs(`${typed} `, { caretSettles: true });
    const second = formattingAdapter(restored, `${typed} `);
    second.applyRewrite(forward);
    second.onKeyDown((key) => key.key === "Backspace");
    sendTrustedKeydown(second, "Backspace");
    second.applyRewrite(restore);
    typeKeys(second, restored, "N");
    // A toggle with no selection would flip Docs' typing style without knowing it; the fake
    // records the op list, and every toggle must follow a selection or a read of one.
    for (const ops of [converted.ops, restored.ops]) {
      ops.forEach((op, index) => {
        if (!op.startsWith("toggle")) return;
        expect(["selectBack", "selectForward", "copySelectionHtml"], `${typed}: ${ops.slice(index - 3, index + 1).join(" ")}`).toContain(ops[index - 1]);
      });
    }
  });
});
