import { describe, expect, it, vi } from "vitest";
import { ProcessingConsentGate } from "./processing-consent-gate";

describe("Google Docs processing consent gate", () => {
  it("does not attach typing processing before consent and starts only after affirmative consent", () => {
    const processText = vi.fn();
    let onTypedText: ((text: string) => void) | undefined;
    const gate = new ProcessingConsentGate(
      () => {
        onTypedText = (text) => processText(text);
      },
      () => {
        onTypedText = undefined;
      },
    );
    const typeInDocument = (text: string) => onTypedText?.(text);

    typeInDocument("h2so4 ");
    gate.update(false, true);
    typeInDocument("H2O ");
    expect(processText).not.toHaveBeenCalled();

    gate.update(true, false);
    typeInDocument("equi ");
    expect(processText).not.toHaveBeenCalled();

    gate.update(true, true);
    typeInDocument("h2so4 ");
    expect(processText).toHaveBeenCalledOnce();
    expect(processText).toHaveBeenCalledWith("h2so4 ");
  });

  it("detaches typing processing when the user disables Amper", () => {
    const processText = vi.fn();
    let onTypedText: ((text: string) => void) | undefined;
    const gate = new ProcessingConsentGate(
      () => {
        onTypedText = (text) => processText(text);
      },
      () => {
        onTypedText = undefined;
      },
    );

    gate.update(true, true);
    onTypedText?.("H2O ");
    gate.update(true, false);
    onTypedText?.("NH3 ");

    expect(processText.mock.calls).toEqual([["H2O "]]);
  });
});
