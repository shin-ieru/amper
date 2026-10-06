import { productSettings, type AmperSettings, type AmperSettingsInput } from "@amper/core";
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

const SETTINGS_KEY = "amper.settings";
const OPTIONS_KEY = "amper.extension";

/**
 * Storage keys written before the Chemly → Amper rename. Retained only so that
 * existing users keep their settings; migrateLegacyStorage moves them once.
 */
export const LEGACY_STORAGE_KEYS: Readonly<Record<string, string>> = {
  "chemly.settings": SETTINGS_KEY,
  "chemly.extension": OPTIONS_KEY,
};

/** The subset of chrome.storage.local used here (injectable for tests). */
export interface StorageAreaLike {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

/**
 * One-time, idempotent migration of pre-rename keys. A value already stored
 * under the new key always wins; legacy keys are removed once copied.
 */
export async function migrateLegacyStorage(area: StorageAreaLike): Promise<string[]> {
  const legacy = Object.keys(LEGACY_STORAGE_KEYS);
  const stored = await area.get([...legacy, ...Object.values(LEGACY_STORAGE_KEYS)]);
  const present = legacy.filter((key) => stored[key] !== undefined);
  if (present.length === 0) return [];
  const copy: Record<string, unknown> = {};
  for (const key of present) {
    const target = LEGACY_STORAGE_KEYS[key]!;
    if (stored[target] === undefined) copy[target] = stored[key];
  }
  if (Object.keys(copy).length > 0) await area.set(copy);
  await area.remove(present);
  return present;
}

export interface StoredState {
  settings: AmperSettings;
  options: ExtensionOptions;
}

// chrome.storage.local, not sync: custom rules and never-convert lists stay on this device (spec §45).
/**
 * Stored-settings schema. Version 2 made subscript state labels the product
 * default; earlier popups saved "stateLabels: baseline" whenever any switch was
 * touched, which was the old default rather than a user choice.
 */
export const SETTINGS_SCHEMA_VERSION = 2;
const SCHEMA_KEY = "amper.settingsVersion";

export async function migrateSettingsSchema(area: StorageAreaLike): Promise<boolean> {
  const stored = await area.get([SCHEMA_KEY, SETTINGS_KEY]);
  if (typeof stored[SCHEMA_KEY] === "number" && stored[SCHEMA_KEY] >= SETTINGS_SCHEMA_VERSION) return false;
  const settings = stored[SETTINGS_KEY] as Record<string, unknown> | undefined;
  const patch: Record<string, unknown> = { [SCHEMA_KEY]: SETTINGS_SCHEMA_VERSION };
  if (settings && "stateLabels" in settings) {
    const { stateLabels: _old, ...rest } = settings;
    patch[SETTINGS_KEY] = rest;
  }
  await area.set(patch);
  return true;
}

export async function loadState(): Promise<StoredState> {
  await migrateLegacyStorage(chrome.storage.local as unknown as StorageAreaLike);
  await migrateSettingsSchema(chrome.storage.local as unknown as StorageAreaLike);
  const stored = await chrome.storage.local.get([SETTINGS_KEY, OPTIONS_KEY]);
  return {
    // Product profile: an enabled Amper is chemistry-aware. Any "mode" stored by
    // earlier builds is ignored rather than allowed to silence formula autocorrect.
    settings: productSettings((stored[SETTINGS_KEY] as AmperSettingsInput | undefined) ?? {}),
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
