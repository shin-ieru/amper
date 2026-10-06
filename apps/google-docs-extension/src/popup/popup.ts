import type { AmperSettings } from "@amper/core";
import { loadState, saveState, type ExtensionOptions, type StoredState } from "../settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SETTING_BOXES = ["enabled", "autoConvert", "autocomplete", "backspaceRestore"] as const;
const OPTION_BOXES = ["verifyBeforeReplace", "diagnostics"] as const;

let state: StoredState;

function render() {
  for (const id of SETTING_BOXES) $<HTMLInputElement>(id).checked = state.settings[id];
  for (const id of OPTION_BOXES) $<HTMLInputElement>(id).checked = state.options[id];
  $<HTMLSelectElement>("strategy").value = state.options.strategy;
  $<HTMLInputElement>("subscriptStates").checked = state.settings.stateLabels === "subscript";
}

async function update(settings: Partial<AmperSettings>, options: Partial<ExtensionOptions> = {}) {
  state = { settings: { ...state.settings, ...settings }, options: { ...state.options, ...options } };
  await saveState(state);
}

async function main() {
  state = await loadState();
  render();
  for (const id of SETTING_BOXES) $<HTMLInputElement>(id).addEventListener("change", (e) => update({ [id]: (e.target as HTMLInputElement).checked }));
  for (const id of OPTION_BOXES) $<HTMLInputElement>(id).addEventListener("change", (e) => update({}, { [id]: (e.target as HTMLInputElement).checked }));
  $<HTMLInputElement>("subscriptStates").addEventListener("change", (e) =>
    update({ stateLabels: (e.target as HTMLInputElement).checked ? "subscript" : "baseline" }),
  );
  $<HTMLSelectElement>("strategy").addEventListener("change", (e) =>
    update({}, { strategy: (e.target as HTMLSelectElement).value as ExtensionOptions["strategy"] }),
  );
  $<HTMLButtonElement>("probe").addEventListener("click", async () => {
    const out = $<HTMLPreElement>("probeOut");
    out.hidden = false;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) {
      out.textContent = "No active tab.";
      return;
    }
    try {
      const report = await chrome.tabs.sendMessage(tab.id, { type: "amper:probe" });
      out.textContent = JSON.stringify(report, null, 2);
    } catch {
      out.textContent = "Amper is not running in this tab. Open a Google Doc (docs.google.com/document/…) and reload it.";
    }
  });
}

void main();
