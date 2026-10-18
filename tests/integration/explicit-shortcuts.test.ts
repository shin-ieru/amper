/**
 * Explicit scientific shortcuts as rule families: sup(...), sub(...), frac(...),
 * temperature shortcuts and audited symbol aliases. Formatting is asserted as
 * native spans (the in-memory editor records exactly which text a host would format).
 */
import { describe, expect, it } from "vitest";
import { productSettings, SAFE_PUNCTUATION } from "@amper/core";
import { setup } from "./virtual-editor";

const product = productSettings();
const TRIGGERS = [" ", "\n", ...SAFE_PUNCTUATION];

type Span = { text: string; style: string };

/** Types `input + trigger` and checks text, formatting, no Tab needed, exact Backspace restore and one-step Undo. */
function checkFamily(input: string, output: string, spans: Span[]): string[] {
  const failures: string[] = [];
  for (const trigger of TRIGGERS) {
    const label = JSON.stringify(input + trigger);
    const { editor } = setup(product);
    editor.type(input + trigger);
    if (editor.text !== output + trigger) {
      failures.push(`${label} → ${JSON.stringify(editor.text)} (want ${JSON.stringify(output + trigger)})`);
      continue;
    }
    if (JSON.stringify(editor.formatted) !== JSON.stringify(spans)) failures.push(`${label}: formatted ${JSON.stringify(editor.formatted)}`);
    if (editor.visibleSuggestions) failures.push(`${label}: needed Tab`);
    editor.press("Backspace");
    if (editor.text !== input) failures.push(`${label} Backspace → ${JSON.stringify(editor.text)}`);
    const undo = setup(product).editor.type(input + trigger).undo();
    if (undo.text !== input + trigger) failures.push(`${label} Undo → ${JSON.stringify(undo.text)}`);
  }
  return failures;
}

function unchanged(inputs: readonly string[]): string[] {
  const changed: string[] = [];
  for (const input of inputs) {
    for (const trigger of [" ", ","]) {
      const { editor } = setup(product);
      editor.type(input + trigger);
      if (editor.text !== input + trigger || editor.formatted.length > 0) changed.push(`${JSON.stringify(input + trigger)} → ${JSON.stringify(editor.text)}`);
    }
  }
  return changed;
}

const SCRIPT_CONTENTS: [string, string][] = [
  ["digits", "2"],
  ["multi-digit", "12"],
  ["negative", "-3"],
  ["positive sign", "+1"],
  ["expression", "n+1"],
  ["letter", "n"],
  ["word", "max"],
  ["capitalised word", "Max"],
  ["multi-word phrase", "activation energy"],
  ["longer phrase", "formation of methane"],
  ["punctuation inside", "a,b"],
  ["balanced parentheses inside", "(n+1)"],
  ["Greek-looking word stays literal", "alpha"],
  ["formula-looking text stays literal", "H2O"],
];

for (const [keyword, style] of [["sup", "superscript"], ["sub", "subscript"]] as const) {
  describe(`${keyword}(...): native ${style}`, () => {
    it.each(SCRIPT_CONTENTS)(`attached to a base: x ${keyword}(…) with %s`, (_kind, content) => {
      expect(checkFamily(`x ${keyword}(${content})`, `x${content}`, [{ text: content, style }])).toEqual([]);
    });

    it.each([["10", "10"], ["E", "E"], ["V", "V"], ["k", "k"], ["H", "H"]])(`base %s`, (base) => {
      expect(checkFamily(`${base} ${keyword}(obs)`, `${base}obs`, [{ text: "obs", style }])).toEqual([]);
    });

    it("consumes exactly one separating space: two or more spaces are kept as typed", () => {
      expect(checkFamily(`x  ${keyword}(2)`, "x  2", [{ text: "2", style }])).toEqual([]);
      expect(checkFamily(`E ${keyword}(activation energy)`, "Eactivation energy", [{ text: "activation energy", style }])).toEqual([]);
    });

    it("standalone at the start of a line, and after an opening bracket", () => {
      expect(checkFamily(`${keyword}(2)`, "2", [{ text: "2", style }])).toEqual([]);
      expect(checkFamily(`(${keyword}(2)`, "(2", [{ text: "2", style }])).toEqual([]);
    });

    it("is case-insensitive in the keyword (Docs may auto-capitalise it)", () => {
      const cap = `${keyword[0]!.toUpperCase()}${keyword.slice(1)}`;
      expect(checkFamily(`x ${cap}(2)`, "x2", [{ text: "2", style }])).toEqual([]);
      expect(checkFamily(`x ${keyword.toUpperCase()}(2)`, "x2", [{ text: "2", style }])).toEqual([]);
    });

    it("keeps trailing sentence punctuation outside the formatted range", () => {
      const { editor } = setup(product);
      editor.type(`the x ${keyword}(2). Next`);
      expect(editor.text).toBe("the x2. Next");
      expect(editor.formatted).toEqual([{ text: "2", style }]);
    });

    it("only the content is formatted; following text stays baseline", () => {
      const { editor } = setup(product);
      editor.type(`x ${keyword}(n+1) is large`);
      expect(editor.text).toBe("xn+1 is large");
      expect(editor.formatted).toEqual([{ text: "n+1", style }]);
    });

    it("content is never converted while the command is open", () => {
      const { editor } = setup(product);
      editor.type(`E ${keyword}(alpha decay of H2O and sigma) `);
      expect(editor.text).toBe("Ealpha decay of H2O and sigma ");
      expect(editor.formatted).toEqual([{ text: "alpha decay of H2O and sigma", style }]);
    });

    it("malformed, empty, nested or embedded commands stay literal", () => {
      expect(
        unchanged([
          `${keyword}()`,
          `${keyword}(   )`,
          `x ${keyword}(2`,
          `x ${keyword}2)`,
          `x${keyword}(2)`,
          `look${keyword}(2)`,
          `x ${keyword}(2)y`,
          `${keyword}(${keyword}(2))`,
          `${keyword}(sub(2))`,
          `${keyword}(frac(1/2))`,
        ]),
      ).toEqual([]);
    });

    it("code, markup, URL and path contexts stay literal", () => {
      expect(
        unchanged([
          `\`x ${keyword}(2)\``,
          `<b>${keyword}(2)</b>`,
          `https://example.com/${keyword}(2)`,
          `/tmp/${keyword}(2)`,
          `const y = ${keyword}(2)`,
          `file ${keyword}(2)`,
        ]),
      ).toEqual([]);
    });
  });
}

describe("frac(...): native fraction", () => {
  const VALID: [string, string, string][] = [
    ["digit/digit", "5", "4"],
    ["multi-digit", "12", "24"],
    ["three digits", "100", "250"],
    ["variable/variable", "x", "y"],
    ["digit/variable", "3", "y"],
    ["variable/digit", "x", "2"],
    ["protected slash pair, made explicit", "b", "c"],
  ];

  it.each(VALID)("%s: frac(%s/%s)", (_kind, numerator, denominator) => {
    expect(
      checkFamily(`frac(${numerator}/${denominator})`, `${numerator}⁄${denominator}`, [
        { text: numerator, style: "superscript" },
        { text: denominator, style: "subscript" },
      ]),
    ).toEqual([]);
  });

  it("does not attach to the preceding word (mixed numbers keep their space)", () => {
    const { editor } = setup(product);
    editor.type("1 frac(1/2) cups ");
    expect(editor.text).toBe("1 1⁄2 cups ");
  });

  it("uses U+2044 FRACTION SLASH, kept baseline", () => {
    const { editor } = setup(product);
    editor.type("frac(12/24) ");
    expect([...editor.text].map((c) => c.codePointAt(0)!.toString(16))).toContain("2044");
    expect(editor.formatted.map((f) => f.text)).toEqual(["12", "24"]);
  });

  it("malformed fractions stay literal", () => {
    expect(
      unchanged([
        "frac()", "frac(x/)", "frac(/y)", "frac( / )", "frac(x//y)", "frac(x/y/z)", "frac(x)", "frac(12)", "frac(x/y", "xfrac(x/y)",
        "frac(P sub() / 2)", "frac(P sub(1) / frac(1/2))", "frac(P sub(sup(2)) / 2)", "frac(P sub(1 / 2)", "frac(a / b / c)",
      ]),
    ).toEqual([]);
  });

  it("code, URL and path contexts stay literal", () => {
    expect(unchanged(["`frac(x/y)`", "https://example.com/frac(x/y)", "/srv/frac(x/y)", "url frac(x/y)"])).toEqual([]);
  });
});

describe("frac(...) with compound scientific operands", () => {
  const sub = (text: string) => ({ text, style: "subscript" });
  const sup = (text: string) => ({ text, style: "superscript" });

  // Native Docs formatting has one vertical level per character: operands that contain sub()/sup()
  // stay baseline with their own native scripts, joined by U+2044 with the typed spacing.
  it.each([
    ["frac(P sub(0.5 atm) / P sub(1 bar))", "P0.5 atm ⁄ P1 bar", [sub("0.5 atm"), sub("1 bar")]],
    ["frac(T sub(0°C) / T sub(25°C))", "T0°C ⁄ T25°C", [sub("0°C"), sub("25°C")]],
    ["frac(n sub(1) / n sub(2))", "n1 ⁄ n2", [sub("1"), sub("2")]],
    ["frac(P sub(0.5 atm)/P sub(1 bar))", "P0.5 atm⁄P1 bar", [sub("0.5 atm"), sub("1 bar")]],
    ["frac(x sup(2) / y)", "x2 ⁄ y", [sup("2")]],
    ["frac(E sup(activation energy) / R T)", "Eactivation energy ⁄ R T", [sup("activation energy")]],
    ["frac(k sub(obs) / k sub(ref))", "kobs ⁄ kref", [sub("obs"), sub("ref")]],
  ] as const)("%s → %s", (typed, output, spans) => {
    expect(checkFamily(typed, output, [...spans])).toEqual([]);
  });

  it("the whole operand is the numerator/denominator: a / inside an inner command is not the separator", () => {
    expect(checkFamily("frac(P sub(a/b) / 2)", "Pa/b ⁄ 2", [sub("a/b")])).toEqual([]);
    expect(checkFamily("frac(c sub(x/y) / c sub(0))", "cx/y ⁄ c0", [sub("x/y"), sub("0")])).toEqual([]);
  });

  it("operands without inner commands are raised and lowered whole", () => {
    for (const [typed, numerator, denominator] of [
      ["frac(dx/dt)", "dx", "dt"],
      ["frac(1.5/2)", "1.5", "2"],
      ["frac(X/Y)", "X", "Y"],
      ["frac(xy/z)", "xy", "z"],
      ["frac((n+1)/2)", "(n+1)", "2"],
    ] as const) {
      expect(checkFamily(typed, `${numerator}⁄${denominator}`, [sup(numerator), sub(denominator)]), typed).toEqual([]);
    }
  });

  it("keeps the spacing typed around the slash exactly, at baseline", () => {
    expect(checkFamily("frac(x / y)", "x ⁄ y", [sup("x"), sub("y")])).toEqual([]);
    expect(checkFamily("frac(0.5 atm / 1 bar)", "0.5 atm ⁄ 1 bar", [sup("0.5 atm"), sub("1 bar")])).toEqual([]);
    expect(checkFamily("frac(x /y)", "x ⁄y", [sup("x"), sub("y")])).toEqual([]);
    expect(checkFamily("frac(12  /  24)", "12  ⁄  24", [sup("12"), sub("24")])).toEqual([]);
    // Spaces just inside the parentheses are not part of either operand.
    expect(checkFamily("frac( x/y )", "x⁄y", [sup("x"), sub("y")])).toEqual([]);
    const { editor } = setup(product);
    editor.type("frac(x / y) ");
    expect(editor.rewrites.at(-1)!.formatting).toEqual([
      { start: 0, end: 1, style: "superscript" },
      { start: 4, end: 5, style: "subscript" },
    ]);
  });

  it("nested fractions are not supported", () => {
    expect(unchanged(["frac(1/frac(2/3))", "frac(frac(1/2)/3)", "frac(x sub(1)/frac(1/2))"])).toEqual([]);
  });

  it("nothing converts while the fraction is still being typed", () => {
    const typed = "frac(P sub(0.5 atm) / P sub(1 bar)";
    const { editor } = setup(product);
    for (const ch of typed) {
      editor.type(ch);
      expect(editor.text, editor.text).toBe(typed.slice(0, editor.text.length));
      expect(editor.visibleSuggestions, editor.text).toBeUndefined();
    }
    expect(editor.formatted).toEqual([]);
  });

  it("operand text stays literal: no chemistry, Greek or temperature rules inside", () => {
    expect(checkFamily("frac(n sub(H2O) / n sub(total))", "nH2O ⁄ ntotal", [sub("H2O"), sub("total")])).toEqual([]);
    expect(checkFamily("frac(sigma sub(1) / 2)", "sigma1 ⁄ 2", [sub("1")])).toEqual([]);
  });

  it("following text returns to baseline and keeps converting normally", () => {
    const { editor } = setup(product);
    editor.type("frac(P sub(0.5 atm) / P sub(1 bar)) is about 0.5 for H2O ");
    expect(editor.text).toBe("P0.5 atm ⁄ P1 bar is about 0.5 for H₂O ");
    expect(editor.formatted).toEqual([sub("0.5 atm"), sub("1 bar")]);
  });

  it("without frac(...), compound slash expressions are never inferred as fractions", () => {
    const { editor } = setup(product);
    editor.type("P sub(0.5 atm) / P sub(1 bar) ");
    expect(editor.text).toBe("P0.5 atm / P1 bar ");
    expect(editor.text).not.toContain("⁄");
    for (const prose of ["0.5 atm/1 bar ", "dx/dt ", "mol/L ", "P1/P2 ", "(n+1)/2 "]) {
      const typed = setup(product).editor.type(prose);
      expect(typed.text, prose).toBe(prose);
      expect(typed.visibleSuggestions?.items.some((s) => s.replacement.includes("⁄")) ?? false, prose).toBe(false);
    }
  });
});

describe("temperature shortcuts", () => {
  it.each([
    ["deg", "°"],
    ["degC", "°C"],
    ["degF", "°F"],
    ["DegC", "°C"],
    ["DEGF", "°F"],
  ])("%s → %s", (input, output) => {
    expect(checkFamily(input, output, [])).toEqual([]);
  });

  it.each([
    ["25degC", "25°C"],
    ["72degF", "72°F"],
    ["-20degC", "-20°C"],
    ["−40degF", "−40°F"],
    ["36.5degC", "36.5°C"],
    ["98.6degF", "98.6°F"],
    ["90deg", "90°"],
    ["0degC", "0°C"],
  ])("numeric %s → %s (spacing preserved)", (input, output) => {
    expect(checkFamily(input, output, [])).toEqual([]);
  });

  it("keeps the user's space: 100 degC → 100 °C", () => {
    expect(setup(product).editor.type("100 degC ").text).toBe("100 °C ");
  });

  it("there is no kelvin shortcut: degK and 298degK stay exactly as typed", () => {
    expect(unchanged(["degK", "298degK", "298 degK", "DegK", "298degk", "-20degK"])).toEqual([]);
    for (const typed of ["degK", "298degK", "298 degK"]) {
      const { editor } = setup(product);
      editor.type(`${typed} `);
      expect(editor.visibleSuggestions, typed).toBeUndefined();
    }
  });

  it("SI kelvin is typed directly and preserved: 298 K, never °K", () => {
    expect(unchanged(["298 K", "0 K", "273.15 K", "a 298 K sample"])).toEqual([]);
    const all = ["298 K", "298degK", "kelvin"].map((t) => setup(product).editor.type(`${t} `));
    for (const editor of all) expect(editor.text).not.toContain("°K");
  });

  it("unit names in prose are only offered", () => {
    for (const [word, unit] of [["celsius", "°C"], ["fahrenheit", "°F"], ["kelvin", "K"], ["Celsius", "°C"]]) {
      const { editor } = setup(product);
      editor.type(`25 ${word} `);
      expect(editor.text, word).toBe(`25 ${word} `);
      expect(editor.visibleSuggestions?.items.map((s) => s.replacement), word).toContain(unit);
    }
  });

  it("bare C, F and K are never temperatures (carbon, fluorine, potassium)", () => {
    expect(unchanged(["C", "F", "K", "25 C", "72 F", "298 K", "25C", "the K ion", "Vitamin C"])).toEqual([]);
    expect(setup(product).editor.type("K+ CO2 F2 ").text).toBe("K⁺ CO₂ F₂ ");
    expect(setup(product).editor.type("KCl K2SO4 2K + Cl2 -> 2KCl ").text).toBe("KCl K₂SO₄ 2K + Cl₂ → 2KCl ");
  });

  it("deg inside other words or identifiers is left alone", () => {
    expect(unchanged(["degree", "degrees", "degC2", "xdegC", "25degX", "25 deg-C", "`25degC`", "https://x.com/25degC"])).toEqual([]);
  });
});

describe("audited symbol aliases", () => {
  it.each([
    ["plusminus", "±"],
    ["minusplus", "∓"],
    ["neq", "≠"],
    ["propto", "∝"],
    ["sqrt", "√"],
    ["lte", "≤"],
    ["gte", "≥"],
    ["nabla", "∇"],
  ])("%s → %s automatically", (input, output) => {
    expect(checkFamily(input, output, [])).toEqual([]);
  });

  it("approx and inf are only offered (prose abbreviation, infimum)", () => {
    for (const [word, symbol] of [["approx", "≈"], ["inf", "∞"]]) {
      const { editor } = setup(product);
      editor.type(`${word} `);
      expect(editor.text).toBe(`${word} `);
      expect(editor.visibleSuggestions?.items[0]?.replacement).toBe(symbol);
    }
  });

  it("LTE and GTE (mobile standard, company) stay unchanged", () => {
    expect(unchanged(["LTE", "GTE", "4G LTE"])).toEqual([]);
  });

  it("deliberately not added: English words and common abbreviations stay unchanged", () => {
    expect(unchanged(["pm", "3 pm", "mp", "therefore", "because", "partial", "integral", "sum", "product", "times", "dot"])).toEqual([]);
  });
});

describe("chemistry precedence is unchanged", () => {
  it.each([
    ["H2SO4 ", "H₂SO₄ "],
    ["SO4^2- ", "SO₄²⁻ "],
    ["^14C ", "¹⁴C "],
    ["equi ", "⇌ "],
    ["sigma ", "σ "],
    ["N2 ", "N₂ "],
    ["H2O(l) ", "H₂O(l) "],
    ["2H2 + O2 -> 2H2O ", "2H₂ + O₂ → 2H₂O "],
    ["1s2 2s2 ", "1s² 2s² "],
    ["h2so4 ", "H₂SO₄ "],
  ])("%j → %j", (input, output) => {
    expect(setup(product).editor.type(input).text).toBe(output);
  });

  it("chemistry after a closed command on the same line still converts", () => {
    const { editor } = setup(product);
    editor.type("E sup(a) and H2O ");
    expect(editor.text).toBe("Ea and H₂O ");
  });
});

describe("bare / is suggestion-only (pre-v0.1.5 decision); frac(...) is automatic", () => {
  // Imported lazily to keep this file's top section focused on the explicit commands.
  const corpus = import("../corpus/scientific-notation");

  it("no bare slash expression is ever rewritten on a boundary", async () => {
    const { BARE_FRACTION_SUGGESTIONS, AMBIGUOUS_SLASH_PROSE } = await corpus;
    const rewritten: string[] = [];
    for (const input of [...BARE_FRACTION_SUGGESTIONS.map(([typed]) => typed), ...AMBIGUOUS_SLASH_PROSE]) {
      for (const trigger of TRIGGERS) {
        const { editor } = setup(product);
        editor.type(input + trigger);
        if (editor.text !== input + trigger || editor.formatted.length) rewritten.push(`${JSON.stringify(input + trigger)} → ${JSON.stringify(editor.text)}`);
      }
    }
    expect(rewritten).toEqual([]);
  });

  it("ambiguous prose (24/7, 50/50, 9/11, 10/06, 2026/10, y/n, q/a, p/e, h/w) survives a whole sentence", async () => {
    const { AMBIGUOUS_SLASH_PROSE } = await corpus;
    const sentence = `Open ${AMBIGUOUS_SLASH_PROSE.join(", then ")} today.\n`;
    expect(setup(product).editor.type(sentence).text).toBe(sentence);
  });

  it("each bare fraction offers the exact native fraction, and Tab applies it", async () => {
    const { BARE_FRACTION_SUGGESTIONS } = await corpus;
    for (const [typed, output] of BARE_FRACTION_SUGGESTIONS) {
      const { editor } = setup(product);
      editor.type(`${typed} `);
      expect(editor.visibleSuggestions?.items[0]?.replacement, typed).toBe(output);
      editor.press("Tab");
      expect(editor.text, typed).toBe(`${output} `);
      const [numerator, denominator] = typed.split("/");
      expect(editor.formatted, typed).toEqual([
        { text: numerator, style: "superscript" },
        { text: denominator, style: "subscript" },
      ]);
      editor.press("Backspace");
      expect(editor.text, typed).toBe(`${typed} `);
    }
  });

  it("the suggestion disappears when the user keeps typing (nothing is applied)", () => {
    const { editor } = setup(product);
    editor.type("5/4 and more ");
    expect(editor.text).toBe("5/4 and more ");
    expect(editor.formatted).toEqual([]);
  });

  it.each(["5/4", "12/24", "x/y", "3/y", "x/2"])("frac(%s) converts automatically", (pair) => {
    const [numerator, denominator] = pair.split("/");
    expect(
      checkFamily(`frac(${pair})`, `${numerator}⁄${denominator}`, [
        { text: numerator!, style: "superscript" },
        { text: denominator!, style: "subscript" },
      ]),
    ).toEqual([]);
  });
});

describe("Backspace reversal of a formatted conversion asks the host for plain text", () => {
  const lastRewrite = (typed: string, tab = false) => {
    const { editor } = setup(product);
    editor.type(typed);
    if (tab) editor.press("Tab");
    editor.press("Backspace");
    return editor.rewrites.at(-1)!;
  };

  it.each(["x sup(2) ", "V sub(max) ", "frac(12/24) ", "x_(max) ", "H2O(l) "])("%j", (typed) => {
    expect(lastRewrite(typed).plain).toBe(true);
  });

  it("after Tab accepts a bare fraction", () => {
    expect(lastRewrite("5/4 ", true).plain).toBe(true);
  });

  it("not for conversions without native formatting", () => {
    expect(lastRewrite("H2O ").plain).toBeUndefined();
    expect(lastRewrite("25degC ").plain).toBeUndefined();
  });
});
