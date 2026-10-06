import { describe, expect, it } from "vitest";
import { createEngine, productSettings, resolveSettings } from "@amper/core";
import { setup } from "../integration/virtual-editor";
import { CASE_RECOVERY_AMBIGUOUS, CASE_RECOVERY_AUTO, CASE_RECOVERY_NEGATIVE, CASE_RECOVERY_SUGGEST_ONLY } from "./case-recovery";

const engine = createEngine();
const decide = (text: string, settings = productSettings()) => engine.evaluate({ textBefore: text, trigger: "space" }, settings);

describe("case recovery: one clear interpretation autocorrects", () => {
  it.each(CASE_RECOVERY_AUTO)("%s → %s", (typed, expected) => {
    const { editor } = setup(productSettings());
    editor.type(`${typed} `);
    expect(editor.text).toBe(`${expected} `);
  });

  it.each(CASE_RECOVERY_AUTO)("%s: immediate Backspace restores exactly what was typed", (typed) => {
    const { editor } = setup(productSettings());
    editor.type(`${typed} `).press("Backspace");
    expect(editor.text).toBe(typed);
    editor.type(" ");
    expect(editor.text).toBe(`${typed} `);
  });

  it("records the typed original in the transaction", () => {
    const { editor, events } = setup(productSettings());
    editor.type("h2so4 ");
    const applied = events.find((e) => e.type === "applied");
    expect(applied?.type === "applied" && applied.transaction).toMatchObject({
      originalText: "h2so4",
      replacementText: "H₂SO₄",
      ruleId: "formula.case-recovered",
      restoreText: "h2so4",
    });
  });

  it("is a separate stage: correctly-cased input never goes through it", () => {
    const d = decide("H2SO4");
    expect(d.action === "autocorrect" && d.recognition.ruleId).toBe("formula.neutral");
  });

  it("only suggests in the conservative engine profile", () => {
    expect(decide("h2so4", resolveSettings({ mode: "standard" })).action).toBe("suggest");
  });
});

describe("case recovery: genuine ambiguity is offered, not guessed", () => {
  it.each(CASE_RECOVERY_AMBIGUOUS)("%s offers %j", (typed, alternatives) => {
    const { editor } = setup(productSettings());
    editor.type(`${typed} `);
    expect(editor.text).toBe(`${typed} `);
    expect(editor.visibleSuggestions?.items.map((s) => s.replacement)).toEqual(alternatives);
  });

  it.each(CASE_RECOVERY_SUGGEST_ONLY)("%s is suggested only", (typed) => {
    expect(decide(typed).action).toBe("suggest");
  });
});

describe("case recovery: negative corpus", () => {
  it("never changes identifiers, words or URLs automatically", () => {
    const changed: string[] = [];
    for (const token of CASE_RECOVERY_NEGATIVE) {
      const { editor } = setup(productSettings());
      editor.type(`${token} `);
      if (editor.text !== `${token} `) changed.push(`${token} → ${editor.text}`);
    }
    expect(changed).toEqual([]);
  });

  it("does not even suggest for them", () => {
    const noisy = CASE_RECOVERY_NEGATIVE.filter((t) => decide(t).action !== "none");
    expect(noisy).toEqual([]);
  });

  it("leaves ordinary lowercase prose byte-identical", () => {
    const prose = "so he said no to the bacon and chips, then cops in boss cabs went home.\n";
    const { editor } = setup(productSettings());
    editor.type(prose);
    expect(editor.text).toBe(prose);
  });
});
