/**
 * The popup, onboarding and reference page must never advertise a shortcut that
 * does not behave exactly as shown. Every catalog entry is typed through the real
 * engine with the product settings the extension uses.
 */
import { describe, expect, it } from "vitest";
import { productSettings } from "@amper/core";
import { matches, ONBOARDING, shortcutGroups, TRY_TYPING, type ShortcutEntry } from "../../apps/google-docs-extension/src/reference/catalog";
import { setup } from "./virtual-editor";

function verify(entry: ShortcutEntry): string | undefined {
  const { editor } = setup(productSettings());
  if (entry.example) {
    editor.type(`${entry.example.type} `);
    return editor.text === `${entry.example.result} ` ? undefined : `${entry.example.type} → ${editor.text}`;
  }
  editor.type(`${entry.input} `);
  if (entry.badge === "suggestion") {
    const offered = editor.visibleSuggestions?.items.map((s) => s.replacement) ?? [];
    return editor.text === `${entry.input} ` && offered.includes(entry.output) ? undefined : `${entry.input}: not offered as a suggestion`;
  }
  if (editor.text !== `${entry.output} `) return `${entry.input} → ${JSON.stringify(editor.text)} (catalog says ${entry.output})`;
  if (editor.visibleSuggestions) return `${entry.input}: converted but needed Tab`;
  if (entry.stateLabel && !editor.formatted.some((f) => f.text === entry.stateLabel && f.style === "subscript")) {
    return `${entry.input}: ${entry.stateLabel} not subscripted`;
  }
  return undefined;
}

describe("shortcut catalog is truthful", () => {
  it("Try typing", () => expect(TRY_TYPING.map(verify).filter(Boolean)).toEqual([]));
  it("onboarding", () => expect(ONBOARDING.map(verify).filter(Boolean)).toEqual([]));

  for (const group of shortcutGroups()) {
    it(`reference: ${group.title} (${group.entries.length} entries)`, () => {
      expect(group.entries.length).toBeGreaterThan(0);
      expect(group.entries.map(verify).filter(Boolean)).toEqual([]);
    });
  }
});

describe("catalog content", () => {
  const groups = shortcutGroups();

  it("has the five groups in order", () => {
    expect(groups.map((g) => g.title)).toEqual(["Greek", "Reaction arrows", "Formulas & charges", "States", "Scientific symbols"]);
  });

  it("covers all 24 Greek letters, lowercase and capital", () => {
    expect(groups[0]!.entries.filter((e) => !e.hint)).toHaveLength(48);
  });

  it("marks equi as the recommended equilibrium shortcut, with equilibrium arrow and <=> as alternatives", () => {
    const arrows = groups[1]!.entries;
    expect(arrows[0]).toMatchObject({ input: "equi", output: "⇌", badge: "recommended" });
    expect(arrows.find((e) => e.input === "equilibrium arrow")).toMatchObject({ output: "⇌", badge: "alternative" });
    expect(arrows.find((e) => e.input === "<=>")).toMatchObject({ output: "⇌", badge: "alternative" });
    expect(arrows.find((e) => e.input === "<->")).toMatchObject({ output: "⇄" });
    expect(arrows.filter((e) => e.badge === "recommended")).toHaveLength(1);
  });

  it("documents all four state labels as subscripted", () => {
    expect(groups[3]!.entries.map((e) => e.stateLabel)).toEqual(["(l)", "(g)", "(aq)", "(s)"]);
  });

  it("search matches input, output, hints and group, case-insensitively", () => {
    const [greekGroup, arrowGroup] = groups;
    const sigma = greekGroup!.entries.find((e) => e.input === "sigma")!;
    expect(matches(sigma, greekGroup!, "SIG")).toBe(true);
    expect(matches(sigma, greekGroup!, "σ")).toBe(true);
    expect(matches(sigma, greekGroup!, "greek")).toBe(true);
    expect(matches(sigma, greekGroup!, "arrow")).toBe(false);
    expect(matches(arrowGroup!.entries[0]!, arrowGroup!, "recommended")).toBe(true);
    expect(matches(sigma, greekGroup!, "   ")).toBe(true);
    // Any name of an arrow finds all of its forms, including the shorthand.
    const equilibrium = arrowGroup!.entries.filter((e) => matches(e, arrowGroup!, "equi")).map((e) => e.input);
    expect(equilibrium).toEqual(["equi", "equilibrium arrow", "<=>"]);
  });
});
