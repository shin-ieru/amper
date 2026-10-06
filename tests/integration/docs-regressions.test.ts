/**
 * Regressions from manual testing in a real, editable Google Doc (product milestone).
 * Everything here runs with the product profile the extension now uses.
 */
import { describe, expect, it } from "vitest";
import {
  AmperController,
  AmperSession,
  createEngine,
  productSettings,
  type ApplyResult,
  type AmperSuggestion,
  type Disposable,
  type EditorAdapter,
  type EditorInputEvent,
  type EditorKeyEvent,
  type TailRewrite,
} from "@amper/core";
import { setup } from "./virtual-editor";

const product = productSettings();
const typed = (text: string) => setup(product).editor.type(text).text;

describe("product profile (extension defaults)", () => {
  it("an enabled Amper is chemistry-aware with every assist on", () => {
    expect(product).toMatchObject({ enabled: true, mode: "chemistry", autoConvert: true, autocomplete: true, backspaceRestore: true, stateLabels: "subscript" });
  });

  it("ignores a stored conservative mode", () => {
    expect(productSettings({ mode: "standard" }).mode).toBe("chemistry");
  });

  it("keeps user switches: with automatic conversion off, high-confidence input is offered instead", () => {
    const { editor } = setup(productSettings({ autoConvert: false }));
    editor.type("H2SO4 ");
    expect(editor.text).toBe("H2SO4 ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("H₂SO₄");
  });
});

describe("high-confidence input autocorrects without Tab", () => {
  it.each([
    ["H2O ", "H₂O "],
    ["H2SO4 ", "H₂SO₄ "],
    ["Ca(OH)2 ", "Ca(OH)₂ "],
    ["SO4^2- ", "SO₄²⁻ "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["capital sigma ", "Σ "],
    ["capital delta ", "Δ "],
    ["H2O\n", "H₂O\n"],
  ])("%j → %j", (input, expected) => {
    const { editor } = setup(product);
    editor.type(input);
    expect(editor.text).toBe(expected);
    expect(editor.visibleSuggestions).toBeUndefined();
  });

  it.each([
    ["H2O,", "H₂O,"],
    ["H2SO4;", "H₂SO₄;"],
    ["CO2:", "CO₂:"],
    ["NaCl!", "NaCl!"],
    ["Fe3+?", "Fe³⁺?"],
    ["capital sigma,", "Σ,"],
  ])("safe punctuation completes %j → %j", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });

  it("periods are not triggers: C3.ai and v2.0 survive, H2O. converts at the next Space", () => {
    expect(typed("C3.ai v2.0 ")).toBe("C3.ai v2.0 ");
    expect(typed("H2O.")).toBe("H2O.");
    expect(typed("H2O. ")).toBe("H₂O. ");
  });

  it("ambiguous input stays conservative", () => {
    expect(typed("O2+ ")).toBe("O2+ ");
    expect(typed("SO42- ")).toBe("SO42- ");
  });
});

describe("explicit Greek phrases are whole-phrase and case-insensitive", () => {
  it.each(["capital sigma", "Capital sigma", "CAPITAL SIGMA", "uppercase sigma", "Uppercase Sigma", "Upper Case Sigma"])(
    "%j → exactly Σ",
    (phrase) => {
      expect(typed(`${phrase} `)).toBe("Σ ");
    },
  );

  it.each(["lowercase sigma", "Lowercase Sigma", "LOWER CASE SIGMA"])("%j → exactly σ", (phrase) => {
    expect(typed(`${phrase} `)).toBe("σ ");
  });

  it.each([
    ["capital delta", "Δ"],
    ["Capital Delta", "Δ"],
    ["capital omega", "Ω"],
    ["CAPITAL OMEGA", "Ω"],
  ])("%j → %s", (phrase, glyph) => {
    expect(typed(`${phrase} `)).toBe(`${glyph} `);
  });

  it("never produces a partial replacement like 'Capital σ'", () => {
    for (const phrase of ["Capital sigma", "CAPITAL SIGMA", "Uppercase Sigma"]) {
      const { editor } = setup(product);
      editor.type(`${phrase} `);
      expect(editor.text).not.toContain("σ");
      expect(editor.visibleSuggestions).toBeUndefined();
    }
  });

  it("a bare name right after a qualifier word is never converted or offered on its own", () => {
    const { editor } = setup(product);
    editor.type("upper sigma ");
    expect(editor.text).toBe("upper sigma ");
    expect(editor.visibleSuggestions).toBeUndefined();
  });

  it("bare names convert automatically, case-insensitively, to the lowercase letter (spec V2 §9.1)", () => {
    for (const word of ["sigma", "Sigma", "SIGMA"]) {
      const { editor } = setup(product);
      editor.type(`The ${word} `);
      expect(editor.text, word).toBe("The σ ");
      expect(editor.visibleSuggestions).toBeUndefined();
    }
  });
});

describe("chemistry-aware capitalisation recovery (required examples)", () => {
  it.each([
    ["h2o", "H₂O"],
    ["h2so4", "H₂SO₄"],
    ["nacl", "NaCl"],
    ["fecl3", "FeCl₃"],
    ["kmno4", "KMnO₄"],
    ["c6h12o6", "C₆H₁₂O₆"],
  ])("%s → %s, and immediate Backspace restores %s", (input, expected) => {
    const { editor } = setup(product);
    editor.type(`${input} `);
    expect(editor.text).toBe(`${expected} `);
    editor.press("Backspace");
    expect(editor.text).toBe(input);
  });

  it("lowercase reactions are recovered species by species", () => {
    expect(typed("2h2 + o2 -> 2h2o ")).toBe("2H₂ + O₂ → 2H₂O ");
  });

  it("native Undo reverts a recovered conversion in one step", () => {
    const { editor } = setup(product);
    editor.type("h2so4 ").undo();
    expect(editor.text).toBe("h2so4 ");
  });

  it("a restored lowercase species is not overwritten by a later reaction rewrite", () => {
    const { editor } = setup(product);
    editor.type("2h2 ").press("Backspace").type(" + O2 -> 2H2O ");
    expect(editor.text).toBe("2h2 + O₂ → 2H₂O ");
  });
});

describe("false-positive protections hold under the product profile", () => {
  it.each([
    "I bought an M2 MacBook. ",
    "Meet me in Room H2. ",
    "The B2B segment grew. ",
    "Plug into USB3 or usb3 ports. ",
    "C3PO and c3po are droids. ",
    "Visit https://example.com/H2O today. ",
    "Upgrade to version 2.0 now. ",
    "This is model X2 and css3 with ipv6. ",
  ])("%j is unchanged", (sentence) => {
    expect(typed(sentence)).toBe(sentence);
  });
});

/**
 * A host that, like Google Docs, re-capitalises the first word of a sentence
 * after it is typed, while Amper's model still holds what the user typed.
 * Its applyRewrite reports the document's real text (as the Docs adapter's
 * copy-verification now does for case-only differences).
 */
class AutoCapitalisingHost implements EditorAdapter {
  doc = "";
  model = "";
  visible: AmperSuggestion[] | undefined;
  readonly capabilities = { interceptKeys: true };
  private input: ((e: EditorInputEvent) => void)[] = [];
  private keys: ((e: EditorKeyEvent) => boolean)[] = [];

  getContextBeforeCaret(max: number) {
    return this.model.slice(-max);
  }
  applyRewrite({ deleteCount, insertText }: TailRewrite): ApplyResult {
    const actual = this.doc.slice(this.doc.length - deleteCount);
    const expected = this.model.slice(this.model.length - deleteCount);
    if (actual.toLowerCase() !== expected.toLowerCase()) return false;
    this.doc = this.doc.slice(0, this.doc.length - deleteCount) + insertText;
    this.model = this.model.slice(0, this.model.length - deleteCount) + insertText;
    return { ok: true, removedTail: actual };
  }
  onTextInput(h: (e: EditorInputEvent) => void): Disposable {
    this.input.push(h);
    return { dispose() {} };
  }
  onKeyDown(h: (e: EditorKeyEvent) => boolean): Disposable {
    this.keys.push(h);
    return { dispose() {} };
  }
  onSelectionChange(): Disposable {
    return { dispose() {} };
  }
  onComposition(): Disposable {
    return { dispose() {} };
  }
  showSuggestions(items: AmperSuggestion[]) {
    this.visible = items;
  }
  hideSuggestions() {
    this.visible = undefined;
  }
  type(text: string) {
    for (const ch of text) {
      this.doc += ch;
      this.model += ch;
      // Docs-style sentence auto-capitalisation of the first word, after its Space.
      if (ch === " " && /^[a-z]+ $/.test(this.doc)) this.doc = this.doc[0]!.toUpperCase() + this.doc.slice(1);
      this.input.forEach((h) => h({ type: "insertText", text: ch }));
    }
    return this;
  }
  backspace() {
    const key = { key: "Backspace", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false };
    if (this.keys.some((h) => h(key))) return this;
    this.doc = this.doc.slice(0, -1);
    this.model = this.model.slice(0, -1);
    this.input.forEach((h) => h({ type: "deleteBackward" }));
    return this;
  }
}

describe("host-side case drift (Docs auto-capitalisation)", () => {
  function host() {
    const h = new AutoCapitalisingHost();
    new AmperController(h, new AmperSession(createEngine(), () => product)).start();
    return h;
  }

  it("Docs turning 'capital' into 'Capital' still yields exactly Σ", () => {
    const h = host().type("capital sigma ");
    expect(h.doc).toBe("Σ ");
  });

  it("immediate Backspace restores what was really in the document", () => {
    const h = host().type("capital sigma ").backspace();
    expect(h.doc).toBe("Capital sigma");
  });

  it("works the same for case-recovered formulas", () => {
    const h = host().type("h2so4 ").backspace();
    expect(h.doc).toBe("h2so4");
  });
});
