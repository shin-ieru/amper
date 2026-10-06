import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { acronymStem } from "../confidence/context";
import { resolveSettings, type AmperMode } from "../types";
import { createEngine } from "./engine";
import { trimFormulaToken } from "./text";

const engine = createEngine();
const evaluate = (textBefore: string, mode: AmperMode = "standard") =>
  engine.evaluate({ textBefore, trigger: "space" }, resolveSettings({ mode }));

describe("named symbols", () => {
  it("autocorrects explicit phrases at confidence 1.0", () => {
    const d = evaluate("capital sigma");
    expect(d.action).toBe("autocorrect");
    if (d.action === "autocorrect") expect(d.recognition).toMatchObject({ replacement: "Σ", confidence: 1, start: 0, end: 13 });
  });

  it("prefers the longest phrase", () => {
    const d = evaluate("the forward reaction arrow");
    expect(d.action === "autocorrect" && d.recognition.original).toBe("forward reaction arrow");
  });

  it("demotes a phrase that a longer phrase extends", () => {
    const d = evaluate("x not equal");
    expect(d.action).toBe("suggest");
    expect(evaluate("x not equal to").action).toBe("autocorrect");
    expect(evaluate("x not equals").action).toBe("autocorrect");
  });

  it("demotes relational phrases after a copula", () => {
    expect(evaluate("the values are not equal to").action).toBe("suggest");
    expect(evaluate("y is proportional to").action).toBe("suggest");
    expect(evaluate("y proportional to").action).toBe("autocorrect");
  });

  it("only matches whole words", () => {
    expect(evaluate("xcapital sigma").action).not.toBe("autocorrect");
  });

  it("only looks at the current line", () => {
    expect(evaluate("capital\nsigma").action).toBe("suggest");
  });
});

describe("formulas", () => {
  it("regression: H3BO3 converts in Chemistry Mode", () => {
    const d = evaluate("H3BO3", "chemistry");
    expect(d.action === "autocorrect" && d.recognition.replacement).toBe("H₃BO₃");
  });

  it("acronym guard only fires on trailing-digit labels", () => {
    expect(acronymStem("USB3")).toBe("USB");
    expect(acronymStem("H3BO3")).toBeUndefined();
    expect(acronymStem("C6H12O6")).toBeUndefined();
    expect(evaluate("USB3", "chemistry").action).toBe("none");
  });

  it("explains rejections in debug output", () => {
    const d = evaluate("room H2", "chemistry");
    expect(d.action).toBe("none");
    expect(d.debug.rejections[0]?.reason).toContain("label word");
  });

  it("gives reasons for accepted formulas", () => {
    const d = evaluate("Ca(OH)2", "chemistry");
    expect(d.action === "autocorrect" && d.recognition.reasons).toEqual(
      expect.arrayContaining(["valid bracket grouping", "Chemistry Mode"]),
    );
  });

  it("is a no-op on already-rendered formulas", () => {
    expect(evaluate("H₂SO₄", "chemistry").action).toBe("none");
  });

  it("trims unbalanced brackets and sentence punctuation", () => {
    const trim = (s: string) => {
      const span = trimFormulaToken(s, 0, s.length);
      return s.slice(span.start, span.end);
    };
    expect(trim("H2O).")).toBe("H2O");
    expect(trim("(H2O),")).toBe("(H2O)");
    expect(trim("(Ca(OH)2")).toBe("Ca(OH)2");
    expect(trim("\"CO2\"")).toBe("CO2");
  });
});

describe("autocomplete", () => {
  const complete = (text: string) => engine.complete(text, resolveSettings()).map((s) => s.label);

  it("completes qualifier + partial name", () => {
    expect(complete("capital sig")).toEqual(["capital sigma"]);
    expect(complete("lower case om")).toEqual(expect.arrayContaining(["lowercase omega", "lowercase omicron"]));
  });

  it("accepts short partials like cap sig and capital sigm", () => {
    expect(complete("cap sig")).toContain("capital sigma");
    expect(complete("capital sigm")).toEqual(["capital sigma"]);
  });

  it("stays quiet on ordinary prose", () => {
    for (const text of ["the", "the cap", "capital", "integ", "prod", "degree", "not", "small p", "sig"]) {
      expect(complete(text), text).toEqual([]);
    }
  });

  it("returns nothing after whitespace", () => {
    expect(complete("capital sig ")).toEqual([]);
  });
});

describe("robustness and performance (spec §44, §52)", () => {
  it("never throws on arbitrary input in either mode", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 300 }), fc.constantFrom<AmperMode>("standard", "chemistry"), (text, mode) => {
        evaluate(text, mode);
        engine.complete(text, resolveSettings({ mode }));
      }),
      { numRuns: 1500 },
    );
  });

  it("bounds the context window regardless of document length", () => {
    const huge = "lorem ipsum ".repeat(50_000) + "capital sigma";
    const d = evaluate(huge);
    expect(d.action === "autocorrect" && d.recognition.start).toBe(huge.length - "capital sigma".length);
    expect(d.debug.text.length).toBeLessThanOrEqual(256);
  });

  it("median decision time is well under 5 ms", () => {
    const inputs = ["The reaction of H2SO4 with", "capital sigma", "equilibrium arrow", "Ca(OH)2", "ordinary words here"];
    const samples: number[] = [];
    for (let i = 0; i < 2000; i++) {
      const started = performance.now();
      evaluate(inputs[i % inputs.length]!, "chemistry");
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[samples.length >> 1]).toBeLessThan(5);
  });
});

describe("Phase 2 performance (spec §44)", () => {
  it("stays under 5 ms median on a full-window reaction line", () => {
    const line = ("Fe3+ + SO4^2- + Ca(OH)2 + " .repeat(12)).slice(0, 220) + " -> CuSO4·5H2O(aq)";
    const samples: number[] = [];
    for (let i = 0; i < 300; i++) {
      const started = performance.now();
      evaluate(line, "chemistry");
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    expect(samples[samples.length >> 1]).toBeLessThan(5);
  });
});

describe("architecture (ADR-001)", () => {
  it("engine packages contain no DOM or Google Docs references", () => {
    const roots = ["core", "chemistry", "rules", "renderer"].map((p) => join(__dirname, "..", "..", "..", p, "src"));
    const forbidden = /\b(document|window|HTMLElement|querySelector|chrome\.)\b|docs\.google|kix-|texteventtarget/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) {
          const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
          if (forbidden.test(code)) offenders.push(path);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
