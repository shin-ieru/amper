import { describe, expect, it } from "vitest";
import { TypingBuffer, type KeyInfo } from "./typing-buffer";

const key = (k: string, mods: Partial<KeyInfo> = {}): KeyInfo => ({
  key: k,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

function typeInto(buffer: TypingBuffer, text: string) {
  for (const ch of text) buffer.keyDown(key(ch === "\n" ? "Enter" : ch));
}

describe("TypingBuffer", () => {
  it("records typed characters, Enter and Backspace", () => {
    const b = new TypingBuffer();
    typeInto(b, "capital sigmx");
    expect(b.keyDown(key("Backspace"))).toEqual({ kind: "deleteBackward" });
    typeInto(b, "a \n");
    expect(b.text).toBe("capital sigma \n");
  });

  it("treats shifted characters as text, not shortcuts", () => {
    const b = new TypingBuffer();
    b.keyDown(key("C", { shiftKey: true }));
    b.keyDown(key("(", { shiftKey: true }));
    expect(b.text).toBe("C(");
  });

  it.each([
    ["ArrowLeft", {}],
    ["Home", {}],
    ["v", { metaKey: true }],
    ["z", { ctrlKey: true }],
    ["e", { altKey: true }],
    ["Dead", {}],
    ["Process", {}],
    ["Tab", {}],
  ])("resets on %s", (k, mods) => {
    const b = new TypingBuffer();
    typeInto(b, "H2O");
    expect(b.keyDown(key(k, mods)).kind).toBe("reset");
    expect(b.text).toBe("");
  });

  it("ignores keys that do not change text before the caret", () => {
    const b = new TypingBuffer();
    typeInto(b, "H2O");
    for (const k of ["Shift", "Escape", "Delete", "CapsLock", "F5"]) b.keyDown(key(k));
    expect(b.text).toBe("H2O");
  });

  it("Backspace on an empty buffer stays empty (unknown text before is never invented)", () => {
    const b = new TypingBuffer();
    b.keyDown(key("Backspace"));
    expect(b.text).toBe("");
  });

  it("mirrors rewrites and refuses impossible ones", () => {
    const b = new TypingBuffer();
    typeInto(b, "capital sigma ");
    expect(b.applyRewrite({ deleteCount: 14, insertText: "Σ " })).toBe(true);
    expect(b.text).toBe("Σ ");
    expect(b.applyRewrite({ deleteCount: 99, insertText: "x" })).toBe(false);
    expect(b.text).toBe("");
  });

  it("is bounded", () => {
    const b = new TypingBuffer(16);
    typeInto(b, "a".repeat(100));
    expect(b.text.length).toBe(16);
  });

  it("removes whole code points on Backspace", () => {
    const b = new TypingBuffer();
    typeInto(b, "x😀");
    b.keyDown(key("Backspace"));
    expect(b.text).toBe("x");
  });
});
