import { describe, expect, it } from "vitest";
import { createEngine, resolveSettings, type ChemlyMode } from "@chemly/core";
import { setup } from "../integration/virtual-editor";
import {
  ARROW_PROSE,
  CARET_IONS,
  COMPLEX_IONS,
  HYDRATES,
  ISOTOPES,
  MONATOMIC_IONS,
  PHASE2_NEGATIVE_TOKENS,
  PHASE2_NO_CONVERSION_SENTENCES,
  POLYATOMIC_IONS,
  REACTIONS,
  STATE_BASES,
  STATES,
} from "./phase2";

// ---- Independent oracles (string arithmetic on curated, known-valid input) ----
const SUB = "₀₁₂₃₄₅₆₇₈₉";
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const sub = (d: string) => [...d].map((c) => SUB[Number(c)]).join("");
const sup = (d: string) => [...d].map((c) => SUP[Number(c)]).join("");
const supSign = (s: string) => (s === "+" ? "⁺" : "⁻");
/** Digits after a letter or closing bracket are counts. Valid only for curated formulas. */
const counts = (body: string) => body.replace(/(?<=[A-Za-z)\]])\d+/g, sub);
const charge = (n: string, sign: string) => (n && n !== "1" ? sup(n) : "") + supSign(sign);

function ionOracle(input: string): string {
  let m = /^(.*)\^(\d*)([+-])$/.exec(input);
  if (m) return counts(m[1]!) + charge(m[2]!, m[3]!);
  m = /^(.*\])(\d*)([+-])$/.exec(input);
  if (m) return counts(m[1]!) + charge(m[2]!, m[3]!);
  m = /^([A-Z][a-z]?)(\d*)([+-])$/.exec(input);
  if (m) return m[1]! + charge(m[2]!, m[3]!);
  m = /^(.*?)([+-])$/.exec(input);
  return counts(m![1]!) + supSign(m![2]!);
}
const speciesOracle = (input: string) => (/[+-]$/.test(input) ? ionOracle(input) : counts(input));
const hydrateOracle = (input: string) => counts(input.replace(/[*•∙⋅]/g, "·"));
const isotopeOracle = (input: string) => {
  const m = /^\^(\d+)(.*)$/.exec(input)!;
  return sup(m[1]!) + counts(m[2]!);
};
const configOracle = (config: string) => config.replace(/(?<=[spdf])\d+/g, sup);

// ---- Engine helpers ----
const engine = createEngine();
const decide = (text: string, mode: ChemlyMode = "chemistry") =>
  engine.evaluate({ textBefore: text, trigger: "space" }, resolveSettings({ mode }));
const converted = (text: string, mode: ChemlyMode = "chemistry") => {
  const d = decide(text, mode);
  return d.action === "autocorrect" ? d.recognition.replacement : `(${d.action})`;
};

function expectAll(inputs: readonly string[], oracle: (s: string) => string, mode: ChemlyMode = "chemistry") {
  const failures = inputs.filter((i) => converted(i, mode) !== oracle(i)).map((i) => `${i} → ${converted(i, mode)} (want ${oracle(i)})`);
  expect(failures).toEqual([]);
}

describe("ion corpora (Chemistry Mode autocorrect)", () => {
  it("monatomic ions with conventional charges", () => expectAll(MONATOMIC_IONS, ionOracle));
  it("polyatomic ions", () => expectAll(POLYATOMIC_IONS, ionOracle));
  it("square-bracketed complexes", () => expectAll(COMPLEX_IONS, ionOracle));
  it("explicit caret charges", () => expectAll(CARET_IONS, ionOracle));
  it("explicit caret charges also convert in Standard Mode", () => expectAll(CARET_IONS, ionOracle, "standard"));

  it("implicit charges are suggested, not converted, in Standard Mode", () => {
    for (const ion of [...MONATOMIC_IONS, ...POLYATOMIC_IONS.filter((i) => !i.includes("^")), ...COMPLEX_IONS]) {
      expect(decide(ion, "standard").action, ion).not.toBe("autocorrect");
    }
  });
});

describe("state corpus", () => {
  const inputs = STATE_BASES.flatMap((base) => STATES.map((state) => base + state));

  it(`converts ${inputs.length} species-with-state combinations`, () => {
    const oracle = (input: string) => {
      const state = STATES.find((s) => input.endsWith(s))!;
      return speciesOracle(input.slice(0, -state.length)) + state;
    };
    // Digit-free bases (NaCl(aq)) and already-final ones are correct no-ops.
    const failures = inputs
      .filter((i) => {
        const want = oracle(i);
        const d = decide(i);
        return want === i ? d.action !== "none" : !(d.action === "autocorrect" && d.recognition.replacement === want);
      })
      .map((i) => `${i} → ${converted(i)} (want ${oracle(i)})`);
    expect(failures).toEqual([]);
  });
});

describe("hydrate corpus", () => {
  it("converts every hydrate/adduct, normalising the dot to ·", () => expectAll(HYDRATES, hydrateOracle));
});

describe("isotope corpus", () => {
  it("converts every explicit mass number in both modes", () => {
    expectAll(ISOTOPES, isotopeOracle);
    expectAll(ISOTOPES, isotopeOracle, "standard");
  });
});

describe("electron configuration corpus (Aufbau, Z = 1–118)", () => {
  const ORDER = ["1s", "2s", "2p", "3s", "3p", "4s", "3d", "4p", "5s", "4d", "5p", "6s", "4f", "5d", "6p", "7s", "5f", "6d", "7p"];
  const CAP: Record<string, number> = { s: 2, p: 6, d: 10, f: 14 };
  const config = (z: number) => {
    const parts: string[] = [];
    for (const orbital of ORDER) {
      if (z <= 0) break;
      const n = Math.min(z, CAP[orbital[1]!]!);
      parts.push(`${orbital}${n}`);
      z -= n;
    }
    return parts.join(" ");
  };

  it("converts every multi-orbital ground-state configuration typed in full", () => {
    const failures: string[] = [];
    for (let z = 3; z <= 118; z++) {
      const input = config(z);
      const { editor } = setup({ mode: "chemistry" });
      editor.type(`${input} `);
      if (editor.text !== `${configOracle(input)} `) failures.push(`Z=${z}: ${editor.text}`);
    }
    expect(failures).toEqual([]);
  });

  it("only offers single-orbital configurations (H, He)", () => {
    expect(decide("1s1").action).toBe("suggest");
    expect(decide("1s2").action).toBe("suggest");
  });

  it("noble-gas cores", () => {
    for (const [input, want] of [["[Ne] 3s2 3p5", "[Ne] 3s² 3p⁵"], ["[Ar] 4s2 3d10 4p5", "[Ar] 4s² 3d¹⁰ 4p⁵"], ["[Xe] 6s2 4f14 5d10", "[Xe] 6s² 4f¹⁴ 5d¹⁰"]]) {
      const { editor } = setup({ mode: "chemistry" });
      editor.type(`${input} `);
      expect(editor.text).toBe(`${want} `);
    }
  });
});

describe("reaction corpus", () => {
  it("converts every reaction when typed in Chemistry Mode", () => {
    const failures: string[] = [];
    for (const [input, want] of REACTIONS) {
      const { editor } = setup({ mode: "chemistry" });
      editor.type(`${input} `);
      if (editor.text !== `${want} `) failures.push(`${input} → ${editor.text}`);
    }
    expect(failures).toEqual([]);
  });

  it("offers every complete reaction as one suggestion in Standard Mode, applied with Tab", () => {
    const failures: string[] = [];
    for (const [input, want] of REACTIONS) {
      const { editor } = setup({ mode: "standard" });
      editor.type(`${input} `).press("Tab");
      if (editor.text !== `${want} `) failures.push(`${input} → ${editor.text}`);
    }
    expect(failures).toEqual([]);
  });

  it("restores each accepted reaction with an immediate Backspace, exactly as it was before acceptance", () => {
    for (const [input] of REACTIONS) {
      const { editor } = setup({ mode: "standard" });
      // Explicit caret species (SO4^2-) already converted while typing, even in Standard Mode.
      const before = editor.type(`${input} `).text;
      editor.press("Tab").press("Backspace");
      expect(editor.text, input).toBe(before);
    }
  });
});

describe("Phase 2 negative corpus", () => {
  for (const mode of ["standard", "chemistry"] as const) {
    it(`never changes charge/number/arrow-shaped prose automatically in ${mode} mode`, () => {
      const changed: string[] = [];
      for (const token of [...PHASE2_NEGATIVE_TOKENS, ...ARROW_PROSE]) {
        const { editor } = setup({ mode });
        editor.type(`${token} `);
        if (editor.text !== `${token} `) changed.push(`${token} → ${editor.text}`);
      }
      expect(changed).toEqual([]);
    });

    it(`leaves Phase 2 no-conversion sentences byte-identical in ${mode} mode`, () => {
      for (const sentence of PHASE2_NO_CONVERSION_SENTENCES) {
        const { editor } = setup({ mode });
        editor.type(`${sentence}\n`);
        expect(editor.text, sentence).toBe(`${sentence}\n`);
      }
    });
  }

  it("does not even suggest for non-arrow negative tokens in Standard Mode", () => {
    const noisy = PHASE2_NEGATIVE_TOKENS.filter((t) => decide(t, "standard").action !== "none");
    expect(noisy).toEqual([]);
  });

  it("only ever suggests for arrow-shaped prose", () => {
    for (const text of ARROW_PROSE) {
      const arrowOnly = text.split(" ").slice(0, 2).join(" ");
      for (const mode of ["standard", "chemistry"] as const) {
        expect(decide(arrowOnly, mode).action, `${arrowOnly} (${mode})`).toBe("suggest");
      }
    }
  });
});
