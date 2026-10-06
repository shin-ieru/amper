import type { AmperSettings } from "@amper/core";
import { TRY_TYPING, type ShortcutEntry } from "../reference/catalog";
import { loadState, saveState, type ExtensionOptions, type StoredState } from "../settings";

declare const __AMPER_DEVELOPMENT__: boolean;

/** <li><kbd>equi</kbd> → ⇌</li>, built with DOM APIs (no markup strings). */
function renderExamples(list: HTMLElement, entries: readonly ShortcutEntry[]) {
  list.replaceChildren(
    ...entries.map((entry) => {
      const li = document.createElement("li");
      const kbd = Object.assign(document.createElement("kbd"), { textContent: entry.input });
      const to = Object.assign(document.createElement("span"), { className: "to", textContent: "→" });
      to.setAttribute("aria-label", "becomes");
      const out = Object.assign(document.createElement("span"), { className: "out", textContent: entry.output });
      li.append(kbd, to, out);
      return li;
    }),
  );
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const SETTING_BOXES = ["enabled", "autoConvert", "autocomplete", "backspaceRestore"] as const;
const OPTION_BOXES = ["verifyBeforeReplace", "diagnostics"] as const;
let state: StoredState;

function render() {
  $("consentDisclosure").hidden = state.consentAccepted;
  $("productControls").hidden = !state.consentAccepted;
  $("try").hidden = !state.consentAccepted;
  for (const id of SETTING_BOXES) $<HTMLInputElement>(id).checked = state.settings[id];
  $<HTMLInputElement>("subscriptStates").checked = state.settings.stateLabels === "subscript";
  if (__AMPER_DEVELOPMENT__) {
    for (const id of OPTION_BOXES) $<HTMLInputElement>(id).checked = state.options[id];
    $<HTMLSelectElement>("strategy").value = state.options.strategy;
  }
}

async function update(
  settings: Partial<AmperSettings>,
  options: Partial<ExtensionOptions> = {},
  consentAccepted = state.consentAccepted,
) {
  state = {
    settings: { ...state.settings, ...settings },
    options: { ...state.options, ...options },
    consentAccepted,
  };
  await saveState(state);
  render();
}

function setupHelp() {
  renderExamples($<HTMLUListElement>("tryList"), TRY_TYPING);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action=view-all]")) {
    button.addEventListener("click", async () => {
      await chrome.tabs.create({ url: chrome.runtime.getURL("reference.html") });
      window.close();
    });
  }
}

async function main() {
  setupHelp();
  state = await loadState();
  render();

  $<HTMLButtonElement>("enableAmper").addEventListener("click", () => update({ enabled: true }, {}, true));
  for (const id of SETTING_BOXES) {
    $<HTMLInputElement>(id).addEventListener("change", (e) => update({ [id]: (e.target as HTMLInputElement).checked }));
  }
  $<HTMLInputElement>("subscriptStates").addEventListener("change", (e) =>
    update({ stateLabels: (e.target as HTMLInputElement).checked ? "subscript" : "baseline" }),
  );

  if (__AMPER_DEVELOPMENT__) {
    for (const id of OPTION_BOXES) {
      $<HTMLInputElement>(id).addEventListener("change", (e) =>
        update({}, { [id]: (e.target as HTMLInputElement).checked }),
      );
    }
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
}

void main();
