import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { planRewrite } from "./rewrite-plan";

const plan = (removed: string, insertText: string) => planRewrite(removed, { deleteCount: removed.length, insertText });

describe("planRewrite", () => {
  it("keeps the typed boundary out of the edit", () => {
    expect(plan("capital sigma ", "Σ ")).toEqual({ keepSuffix: " ", deleteText: "capital sigma", insertText: "Σ" });
    expect(plan("plus minus\n", "±\n")).toEqual({ keepSuffix: "\n", deleteText: "plus minus", insertText: "±" });
  });

  it("skips unchanged leading characters", () => {
    expect(plan("H2SO4 ", "H₂SO₄ ")).toEqual({ keepSuffix: " ", deleteText: "2SO4", insertText: "₂SO₄" });
  });

  it("handles restoration (the reverse direction)", () => {
    expect(plan("Σ ", "capital sigma")).toEqual({ keepSuffix: "", deleteText: "Σ ", insertText: "capital sigma" });
  });

  it("never splits surrogate pairs", () => {
    const p = plan("😀a", "😃a");
    expect(p.deleteText).toBe("😀");
    expect(p.insertText).toBe("😃");
  });

  it("reconstructs the intended result for any input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), fc.string({ maxLength: 10 }), (removed, inserted, before) => {
        const p = plan(removed, inserted);
        // Apply the plan to `before + removed` and compare with the naive rewrite.
        const doc = Array.from(before + removed);
        const keep = Array.from(p.keepSuffix).length;
        const del = Array.from(p.deleteText).length;
        const head = doc.slice(0, doc.length - keep - del).join("");
        expect(head + p.insertText + p.keepSuffix).toBe(before + inserted);
      }),
    );
  });
});
