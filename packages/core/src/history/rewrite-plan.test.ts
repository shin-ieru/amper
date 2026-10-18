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

  it("can avoid a pure deletion for hosts that delete by typing over a selection", () => {
    expect(planRewrite("25xyzC ", { deleteCount: 7, insertText: "25C " })).toEqual({ keepSuffix: "C ", deleteText: "xyz", insertText: "" });
    expect(planRewrite("25xyzC ", { deleteCount: 7, insertText: "25C " }, { nonEmptyInsert: true })).toEqual({ keepSuffix: " ", deleteText: "xyzC", insertText: "C" });
    expect(planRewrite("ab", { deleteCount: 2, insertText: "a" }, { nonEmptyInsert: true })).toEqual({ keepSuffix: "", deleteText: "ab", insertText: "a" });
    fc.assert(
      fc.property(fc.string({ maxLength: 20 }), fc.string({ maxLength: 20 }), (removed, inserted) => {
        const p = planRewrite(removed, { deleteCount: removed.length, insertText: inserted }, { nonEmptyInsert: true });
        if (p.deleteText && inserted) expect(p.insertText).not.toBe("");
        const doc = Array.from(removed);
        const head = doc.slice(0, doc.length - Array.from(p.keepSuffix).length - Array.from(p.deleteText).length).join("");
        expect(head + p.insertText + p.keepSuffix).toBe(inserted);
      }),
    );
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
