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
    if (editor.text !== `${entry.input} ` || !offered.includes(entry.output)) return `${entry.input}: not offered as a suggestion`;
    if (offered[0] !== entry.output) return undefined; // listed as one of several offered readings (O2+)
    // Accepting with Tab must give exactly what the reference shows, including native formatting.
    editor.press("Tab");
    if (editor.text !== `${entry.output} `) return `${entry.input} Tab → ${JSON.stringify(editor.text)} (catalog says ${entry.output})`;
    for (const span of entry.formatting ?? []) {
      if (!editor.formatted.some((f) => f.text === span.text && f.style === span.style)) return `${entry.input}: Tab did not ${span.style} ${span.text}`;
    }
    return undefined;
  }
  if (editor.text !== `${entry.output} `) return `${entry.input} → ${JSON.stringify(editor.text)} (catalog says ${entry.output})`;
  if (editor.visibleSuggestions) return `${entry.input}: converted but needed Tab`;
  if (entry.stateLabel && !editor.formatted.some((f) => f.text === entry.stateLabel && f.style === "subscript")) {
    return `${entry.input}: ${entry.stateLabel} not subscripted`;
  }
  for (const span of entry.formatting ?? []) {
    if (!editor.formatted.some((formatted) => formatted.text === span.text && formatted.style === span.style)) {
      return `${entry.input}: ${span.text} not natively ${span.style} formatted`;
    }
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
  const byId = (id: string) => groups.find((g) => g.id === id)!;

  it("has the six groups in order", () => {
    expect(groups.map((g) => g.title)).toEqual(["Greek", "Reaction arrows", "Formatting shortcuts", "Formulas & charges", "States", "Scientific symbols"]);
  });

  it("covers all 24 Greek letters, lowercase and capital", () => {
    expect(byId("greek").entries.filter((e) => !e.hint)).toHaveLength(48);
  });

  it("marks equi as the recommended equilibrium shortcut, with equilibrium arrow and <=> as alternatives", () => {
    const arrows = byId("arrows").entries;
    expect(arrows[0]).toMatchObject({ input: "equi", output: "⇌", badge: "recommended" });
    expect(arrows.find((e) => e.input === "equilibrium arrow")).toMatchObject({ output: "⇌", badge: "alternative" });
    expect(arrows.find((e) => e.input === "<=>")).toMatchObject({ output: "⇌", badge: "alternative" });
    expect(arrows.find((e) => e.input === "<->")).toMatchObject({ output: "⇄" });
    expect(arrows.filter((e) => e.badge === "recommended")).toHaveLength(1);
  });

  it("documents all four state labels as subscripted", () => {
    expect(byId("states").entries.map((e) => e.stateLabel)).toEqual(["(l)", "(g)", "(aq)", "(s)"]);
  });

  it("documents explicit underscore subscripts with exact outputs", () => {
    const formulas = byId("formatting").entries;
    expect(formulas.filter((entry) => ["x_2", "x_12", "a_0", "x_-1", "V_max", "x_β"].includes(entry.input)))
      .toMatchObject([
        { input: "x_2", output: "x₂", hint: "_ makes a subscript" },
        { input: "x_12", output: "x₁₂" },
        { input: "a_0", output: "a₀" },
        { input: "x_-1", output: "x₋₁" },
        { input: "V_max", output: "Vₘₐₓ" },
        { input: "x_β", output: "xᵦ" },
      ]);
  });

  it("documents parenthesized native subscript and superscript phrases", () => {
    const formulas = byId("formatting").entries;
    expect(formulas.find((entry) => entry.input === "x_(max)")).toMatchObject({
      output: "xmax",
      formatting: [{ text: "max", style: "subscript" }],
    });
    expect(formulas.find((entry) => entry.input === "x^(effective)")).toMatchObject({
      output: "xeffective",
      formatting: [{ text: "effective", style: "superscript" }],
    });
  });

  it("documents native simple fraction formatting with an ordinary fraction slash", () => {
    const fraction = byId("formatting").entries.find((entry) => entry.input === "x/y");
    expect(fraction).toMatchObject({
      output: "x⁄y",
      formatting: [{ text: "x", style: "superscript" }, { text: "y", style: "subscript" }],
    });
    const integerFraction = byId("formatting").entries.find((entry) => entry.input === "12/24");
    expect(integerFraction).toMatchObject({
      output: "12⁄24",
      formatting: [{ text: "12", style: "superscript" }, { text: "24", style: "subscript" }],
    });
  });

  it("search matches input, output, hints and group, case-insensitively", () => {
    const [greekGroup, arrowGroup] = [byId("greek"), byId("arrows")];
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

describe("Formatting shortcuts section", () => {
  const formatting = shortcutGroups().find((g) => g.id === "formatting")!;

  it("explains when to use explicit shortcuts", () => {
    expect(formatting.description).toContain("without guessing");
  });

  it("recommends sup(...), sub(...) and frac(...), and lists the temperature shortcuts", () => {
    expect(formatting.entries.filter((e) => e.badge === "recommended").map((e) => e.input)).toEqual(["x sup(2)", "V sub(max)", "frac(x/y)"]);
    for (const input of ["deg", "degC", "degF", "25degC"]) expect(formatting.entries.some((e) => e.input === input), input).toBe(true);
    expect(shortcutGroups().flatMap((g) => g.entries).some((e) => /degK/i.test(e.input)), "no kelvin shortcut").toBe(false);
  });

  it("never documents °K", () => {
    expect(shortcutGroups().flatMap((g) => g.entries).some((e) => e.output.includes("°K"))).toBe(false);
  });

  it("teaches explicit commands first, then compact alternatives, with bare / as suggestion-only", () => {
    const inputs = formatting.entries.map((e) => e.input);
    const lastExplicit = Math.max(...["x sup(2)", "V sub(max)", "frac(x/y)", "deg", "degC", "degF"].map((i) => inputs.indexOf(i)));
    const firstCompact = Math.min(...["x^2", "x_2", "x_(max)", "x^(effective)", "x/y", "12/24"].map((i) => inputs.indexOf(i)));
    expect(lastExplicit).toBeLessThan(firstCompact);
    for (const input of ["x^2", "x_2", "x_(max)", "x^(effective)"]) {
      expect(formatting.entries.find((e) => e.input === input)?.badge, input).toBe("alternative");
    }
    for (const input of ["x/y", "12/24"]) {
      expect(formatting.entries.find((e) => e.input === input)?.badge, input).toBe("suggestion");
    }
    expect(shortcutGroups().find((g) => g.id === "formulas")!.entries.some((e) => /[_^/]/.test(e.input) && !/\^\d*[+-]$|^\^\d/.test(e.input))).toBe(false);
  });

  it("lists audited one-word symbol aliases as searchable hints", () => {
    const symbols = shortcutGroups().find((g) => g.id === "symbols")!;
    expect(symbols.entries.find((e) => e.input === "not equals")?.hint).toBe("also neq");
    expect(symbols.entries.some((e) => matches(e, symbols, "sqrt"))).toBe(true);
    expect(symbols.entries.some((e) => e.input === "lte")).toBe(true);
  });
});
