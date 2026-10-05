import { productSettings, type ChemlySettings, type ChemlySettingsInput } from "@chemly/core";
import type { InsertStrategy } from "./content/bridge-protocol";

/** Extension-only switches used by the spike; not part of the engine's settings. */
export interface ExtensionOptions {
  strategy: InsertStrategy;
  verifyBeforeReplace: boolean;
  /** Logs event names, rule ids and lengths to the console. Never document text. */
  diagnostics: boolean;
}

export const DEFAULT_EXTENSION_OPTIONS: ExtensionOptions = {
  strategy: "keypress",
  verifyBeforeReplace: true,
  diagnostics: false,
};

const SETTINGS_KEY = "chemly.settings";
const OPTIONS_KEY = "chemly.extension";

export interface StoredState {
  settings: ChemlySettings;
  options: ExtensionOptions;
}

// chrome.storage.local, not sync: custom rules and never-convert lists stay on this device (spec §45).
export async function loadState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, OPTIONS_KEY]);
  return {
    // Product profile: an enabled Chemly is chemistry-aware. Any "mode" stored by
    // earlier builds is ignored rather than allowed to silence formula autocorrect.
    settings: productSettings((stored[SETTINGS_KEY] as ChemlySettingsInput | undefined) ?? {}),
    options: { ...DEFAULT_EXTENSION_OPTIONS, ...(stored[OPTIONS_KEY] as Partial<ExtensionOptions> | undefined) },
  };
}

export async function saveState(state: Partial<StoredState>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (state.settings) patch[SETTINGS_KEY] = state.settings;
  if (state.options) patch[OPTIONS_KEY] = state.options;
  await chrome.storage.local.set(patch);
}

export function onStateChange(listener: (state: StoredState) => void): void {
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") void loadState().then(listener);
  });
}
