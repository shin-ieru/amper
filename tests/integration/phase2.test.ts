import { describe, expect, it } from "vitest";
import type { AmperSettingsInput } from "@amper/core";
import { setup } from "./virtual-editor";

const chemistry: AmperSettingsInput = { mode: "chemistry" };
const typed = (text: string, settings: AmperSettingsInput = chemistry) => setup(settings).editor.type(text).text;
const suggestions = (text: string, settings: AmperSettingsInput = chemistry) =>
  setup(settings).editor.type(text).visibleSuggestions?.items.map((s) => s.replacement);

describe("Phase 2 required examples (Chemistry Mode, typed end-to-end)", () => {
  it.each([
    ["Fe3+ ", "Fe³⁺ "],
    ["SO4^2- ", "SO₄²⁻ "],
    ["NH4+ ", "NH₄⁺ "],
    ["[Fe(CN)6]3- ", "[Fe(CN)₆]³⁻ "],
    ["H2O(l) ", "H₂O(l) "],
    ["CO2(g) ", "CO₂(g) "],
    ["CuSO4·5H2O ", "CuSO₄·5H₂O "],
    ["^14C ", "¹⁴C "],
    ["^235U ", "²³⁵U "],
    ["1s2 2s2 2p6 ", "1s² 2s² 2p⁶ "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["N2 + 3H2 <=> 2NH3 ", "N₂ + 3H₂ ⇌ 2NH₃ "],
  ])("%j → %j", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });
});

describe("more charges, states, hydrates and isotopes", () => {
  it.each([
    ["Na+ and Cl- ", "Na⁺ and Cl⁻ "],
    ["Ca2+ ", "Ca²⁺ "],
    ["H3O+ ", "H₃O⁺ "],
    ["OH- ", "OH⁻ "],
    ["CO3^2- ", "CO₃²⁻ "],
    ["Fe^3+ ", "Fe³⁺ "],
    ["O2^+ ", "O₂⁺ "],
    ["Hg2^2+ ", "Hg₂²⁺ "],
    ["[Cu(NH3)4]2+ ", "[Cu(NH₃)₄]²⁺ "],
    ["Fe3+(aq) ", "Fe³⁺(aq) "],
    ["NaCl(aq) ", "NaCl(aq) "],
    ["CaCO3(s) ", "CaCO₃(s) "],
    ["O2(g) ", "O₂(g) "],
    ["CoCl2·6H2O ", "CoCl₂·6H₂O "],
    ["CuSO4*5H2O ", "CuSO₄·5H₂O "],
    ["^13CO2 ", "¹³CO₂ "],
    ["^2H ", "²H "],
    // Sentence punctuation after a species is kept, as in Phase 1 ("H2O." → "H₂O.").
    ["Add CuSO4. ", "Add CuSO₄. "],
    ["Na+, ", "Na⁺, "],
    ["[Ne] 3s2 3p5 ", "[Ne] 3s² 3p⁵ "],
  ])("%j → %j", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });
});

describe("reactions", () => {
  it.each([
    ["HCl + NaOH -> NaCl + H2O ", "HCl + NaOH → NaCl + H₂O "],
    ["AgNO3(aq) + NaCl(aq) -> AgCl(s) + NaNO3(aq) ", "AgNO₃(aq) + NaCl(aq) → AgCl(s) + NaNO₃(aq) "],
    ["CH4 + 2O2 -> CO2 + 2H2O ", "CH₄ + 2O₂ → CO₂ + 2H₂O "],
    ["Fe3+ + e- -> Fe2+ ", "Fe³⁺ + e⁻ → Fe²⁺ "],
    ["Ag+ + Cl- -> AgCl ", "Ag⁺ + Cl⁻ → AgCl "],
    ["Cu2+(aq) + 2e- -> Cu(s) ", "Cu²⁺(aq) + 2e⁻ → Cu(s) "],
    ["2 H2 + O2 -> 2 H2O ", "2 H₂ + O₂ → 2 H₂O "],
    ["H2O <-> H2O ", "H₂O ⇄ H₂O "],
    ["Fe2+ <- Fe3+ + e- ", "Fe²⁺ ← Fe³⁺ + e⁻ "],
    ["The reaction 2H2 + O2 -> 2H2O is exothermic. ", "The reaction 2H₂ + O₂ → 2H₂O is exothermic. "],
  ])("%j → %j", (input, expected) => {
    expect(typed(input)).toBe(expected);
  });

  it("converts a reaction pasted or typed with already-converted parts, touching only what changed", () => {
    const { editor, events } = setup(chemistry);
    editor.type("N2 + 3H2 <=> 2NH3 ");
    const last = events.filter((e) => e.type === "applied").at(-1);
    // N2 converted when typed (elemental molecule), so the final rewrite touches only 2NH3.
    expect(last?.type === "applied" && last.transaction.originalText).toBe("2NH3");
  });

  it("does not split unspaced equations, where + could be a charge", () => {
    expect(typed("2H2+O2->2H2O ")).toBe("2H2+O2->2H2O ");
  });
});

describe("Backspace restoration for every new conversion", () => {
  it.each([
    ["Fe3+ ", "Fe3+"],
    ["SO4^2- ", "SO4^2-"],
    ["H2O(l) ", "H2O(l)"],
    ["CuSO4*5H2O ", "CuSO4*5H2O"],
    ["^14C ", "^14C"],
    ["1s2 2s2 ", "1s2 2s2"],
    ["H2O -> ", "H₂O ->"],
  ])("%j then Backspace → %j", (input, restored) => {
    const { editor } = setup(chemistry);
    editor.type(input).press("Backspace");
    expect(editor.text).toBe(restored);
  });

  it("restores a whole-reaction rewrite to exactly what preceded it", () => {
    const { editor } = setup(chemistry);
    editor.type("N2 + 3H2 <=> 2NH3 ").press("Backspace");
    expect(editor.text).toBe("N₂ + 3H₂ ⇌ 2NH3");
    editor.type(" ");
    expect(editor.text).toBe("N₂ + 3H₂ ⇌ 2NH3 "); // suppressed: not re-converted
  });

  it("works on hosts without key interception", () => {
    const { editor } = setup(chemistry, { interceptKeys: false });
    editor.type("SO4^2- ").press("Backspace");
    expect(editor.text).toBe("SO4^2-");
  });
});

describe("native Undo reverts each new conversion in one step", () => {
  it.each([
    ["Fe3+ ", "Fe3+ "],
    ["^235U ", "^235U "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H2O "],
  ])("%j, Undo → %j", (input, afterUndo) => {
    const { editor } = setup(chemistry);
    editor.type(input).undo();
    expect(editor.text).toBe(afterUndo);
  });
});

describe("ambiguity: suggestions instead of guesses", () => {
  it("O2+ is not converted; both readings are offered, dioxygenyl first", () => {
    expect(typed("O2+ ")).toBe("O2+ ");
    expect(suggestions("O2+ ")).toEqual(["O₂⁺", "O²⁺"]);
  });

  it("O2- offers oxide and superoxide", () => {
    expect(typed("O2- ")).toBe("O2- ");
    expect(suggestions("O2- ")).toEqual(["O²⁻", "O₂⁻"]);
  });

  it("N3- offers nitride and azide", () => {
    expect(suggestions("N3- ")).toEqual(["N³⁻", "N₃⁻"]);
  });

  it("explicit caret syntax removes the ambiguity", () => {
    expect(typed("O2^+ ")).toBe("O₂⁺ ");
    expect(typed("O^2- ")).toBe("O²⁻ ");
    expect(typed("O2^- ")).toBe("O₂⁻ ");
  });

  it("SO42- (no caret) is offered as SO₄²⁻, not converted", () => {
    expect(typed("SO42- ")).toBe("SO42- ");
    expect(suggestions("SO42- ")?.[0]).toBe("SO₄²⁻");
  });

  it("a parenthesised count before a sign is ambiguous", () => {
    expect(typed("Fe(OH)2+ ")).toBe("Fe(OH)2+ ");
    expect(suggestions("Fe(OH)2+ ")).toEqual(["Fe(OH)₂⁺", "Fe(OH)²⁺"]);
  });

  it("an ambiguous species makes the whole reaction a suggestion; certain tokens still convert as typed", () => {
    const { editor } = setup(chemistry);
    editor.type("O2 + 4e- -> 2O2- ");
    // O2 (elemental), 4e- and -> were certain; only the ambiguous 2O2- (oxide vs superoxide) is offered.
    expect(editor.text).toBe("O₂ + 4e⁻ → 2O2- ");
    const offered = editor.visibleSuggestions!.items.map((s) => s.replacement);
    expect(offered).toEqual(["2O²⁻", "2O₂⁻"]);
    editor.press("Tab");
    expect(editor.text).toBe("O₂ + 4e⁻ → 2O²⁻ ");
  });

  it("coefficient vs subscript: leading digits are coefficients, interior digits are counts", () => {
    expect(typed("2H2O H2O2 3Ca(OH)2 ")).toBe("2H₂O H₂O₂ 3Ca(OH)₂ ");
  });

  it("single-letter bare signs that are usually grades or blood types are never auto-converted", () => {
    for (const t of ["B+", "C-", "O+", "O-", "V+"]) expect(typed(`${t} `), t).toBe(`${t} `);
  });

  it("a period is never read as a hydrate dot, only offered", () => {
    expect(typed("CuSO4.5H2O ")).toBe("CuSO4.5H2O ");
    expect(suggestions("CuSO4.5H2O ")?.[0]).toBe("CuSO₄·5H₂O");
  });

  it("a single orbital is only offered; a run converts", () => {
    expect(typed("3d6 ")).toBe("3d6 ");
    expect(suggestions("3d6 ")).toEqual(["3d⁶"]);
    expect(typed("3d6 4s2 ")).toBe("3d⁶ 4s² ");
  });

  it("arrows without chemistry before them are only offered", () => {
    expect(typed("x -> y ")).toBe("x -> y ");
    expect(suggestions("x -> ")).toEqual(["→"]);
    expect(typed("a <- b ")).toBe("a <- b ");
  });
});

describe("Standard Mode", () => {
  const standard = { mode: "standard" as const };

  it("explicit caret syntax converts automatically", () => {
    expect(typed("SO4^2- ^14C ", standard)).toBe("SO₄²⁻ ¹⁴C ");
  });

  it("implicit charges, states, hydrates and reactions are suggested", () => {
    for (const input of ["Fe3+ ", "H2O(l) ", "CuSO4·5H2O ", "1s2 2s2 "]) {
      expect(typed(input, standard), input).toBe(input);
      expect(suggestions(input, standard), input).toBeDefined();
    }
  });

  it("a whole reaction can be accepted with Tab", () => {
    const { editor } = setup(standard);
    editor.type("2H2 + O2 -> 2H2O ");
    expect(editor.text).toBe("2H2 + O2 -> 2H2O ");
    expect(editor.visibleSuggestions?.items[0]?.replacement).toBe("2H₂ + O₂ → 2H₂O");
    editor.press("Tab");
    expect(editor.text).toBe("2H₂ + O₂ → 2H₂O ");
    editor.press("Backspace");
    expect(editor.text).toBe("2H2 + O2 -> 2H2O ");
  });
});

describe("settings toggles for new categories", () => {
  const off = (category: string): AmperSettingsInput => ({ mode: "chemistry", categories: { [category]: false } });

  it("charges", () => expect(typed("Fe3+ H2O ", off("charge"))).toBe("Fe3+ H₂O "));
  it("isotopes", () => expect(typed("^14C H2O ", off("isotope"))).toBe("^14C H₂O "));
  it("reactions", () => expect(typed("H2O -> H2O(g) ", off("reaction"))).toBe("H₂O -> H₂O(g) "));
  it("electron configurations", () => expect(typed("1s2 2s2 ", off("electron"))).toBe("1s2 2s2 "));
});

describe("Amper never revisits text the user reverted", () => {
  it("a Backspace-restored token is not re-converted by a later reaction rewrite", () => {
    const { editor } = setup(chemistry);
    editor.type("SO4^2- ").press("Backspace").type(" + Ba2+ -> BaSO4 ");
    expect(editor.text).toBe("SO4^2- + Ba²⁺ → BaSO₄ ");
  });

  it("a natively undone conversion is not re-converted by a later reaction rewrite", () => {
    const { editor } = setup(chemistry);
    editor.type("N2 "); // converts to N₂ (elemental molecule)
    expect(editor.text).toBe("N₂ ");
    editor.undo();
    expect(editor.text).toBe("N2 ");
    editor.type("+ 3H2 -> 2NH3 ");
    expect(editor.text).toBe("N2 + 3H₂ → 2NH₃ ");
  });

  it("after restoring a whole reaction, none of its tokens convert at the next boundary", () => {
    const { editor } = setup(chemistry);
    editor.type("N2 + 3H2 <=> 2NH3 ").press("Backspace").type(" ");
    expect(editor.text).toBe("N₂ + 3H₂ ⇌ 2NH3 ");
  });

  it("an electron-configuration run respects a restored orbital", () => {
    const { editor } = setup(chemistry);
    editor.type("1s2 2s2 ").press("Backspace").type(" 2p6 ");
    expect(editor.text).toBe("1s2 2s2 2p⁶ ");
  });

  it("new, unrelated text still converts normally afterwards", () => {
    const { editor } = setup(chemistry);
    editor.type("Fe3+ ").press("Backspace").type(" and Cu2+ ");
    expect(editor.text).toBe("Fe3+ and Cu²⁺ ");
  });
});
