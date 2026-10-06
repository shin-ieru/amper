import { describe, expect, it } from "vitest";
import {
  CONSENT_VERSION_KEY,
  CURRENT_CONSENT_VERSION,
  LEGACY_STORAGE_KEYS,
  migrateLegacyStorage,
  migrateSettingsSchema,
  SETTINGS_SCHEMA_VERSION,
  stateFromStorage,
  type StorageAreaLike,
} from "./settings";

function memoryArea(initial: Record<string, unknown>): StorageAreaLike & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
    async remove(keys) {
      for (const k of keys) delete data[k];
    },
  };
}

describe("Chemly → Amper storage migration", () => {
  const settings = { enabled: false, autocomplete: false, neverConvert: ["H2O"] };
  const options = { strategy: "paste", verifyBeforeReplace: true, diagnostics: true };

  it("moves pre-rename settings to the new keys and removes the old ones", async () => {
    const area = memoryArea({ "chemly.settings": settings, "chemly.extension": options });
    expect(await migrateLegacyStorage(area)).toEqual(["chemly.settings", "chemly.extension"]);
    expect(area.data).toEqual({ "amper.settings": settings, "amper.extension": options });
  });

  it("never overwrites settings already saved under the new keys", async () => {
    const newer = { enabled: true };
    const area = memoryArea({ "chemly.settings": settings, "amper.settings": newer });
    await migrateLegacyStorage(area);
    expect(area.data).toEqual({ "amper.settings": newer });
  });

  it("is idempotent and does nothing without legacy data", async () => {
    const area = memoryArea({ "amper.settings": settings });
    expect(await migrateLegacyStorage(area)).toEqual([]);
    expect(await migrateLegacyStorage(area)).toEqual([]);
    expect(area.data).toEqual({ "amper.settings": settings });
  });

  it("maps every legacy key to an amper key", () => {
    for (const [legacy, current] of Object.entries(LEGACY_STORAGE_KEYS)) {
      expect(legacy.startsWith("chemly.")).toBe(true);
      expect(current).toBe(legacy.replace("chemly.", "amper."));
    }
  });
});

describe("settings schema v2: subscript state labels become the default", () => {
  it("drops a stateLabels value saved by older popups (it was the old default, not a choice)", async () => {
    const area = memoryArea({ "amper.settings": { enabled: true, stateLabels: "baseline", autocomplete: false } });
    expect(await migrateSettingsSchema(area)).toBe(true);
    expect(area.data).toEqual({ "amper.settings": { enabled: true, autocomplete: false }, "amper.settingsVersion": SETTINGS_SCHEMA_VERSION });
  });

  it("keeps a choice made after the migration", async () => {
    const area = memoryArea({ "amper.settings": { stateLabels: "baseline" }, "amper.settingsVersion": SETTINGS_SCHEMA_VERSION });
    expect(await migrateSettingsSchema(area)).toBe(false);
    expect(area.data["amper.settings"]).toEqual({ stateLabels: "baseline" });
  });

  it("works with no stored settings", async () => {
    const area = memoryArea({});
    await migrateSettingsSchema(area);
    expect(area.data).toEqual({ "amper.settingsVersion": SETTINGS_SCHEMA_VERSION });
  });
});

describe("current consent disclosure", () => {
  it("keeps a fresh installation disabled until it accepts the disclosure", () => {
    const state = stateFromStorage({});
    expect(state.consentAccepted).toBe(false);
    expect(state.settings.enabled).toBe(false);
  });

  it("does not treat enabled settings from an older installation as consent", () => {
    const state = stateFromStorage({
      "amper.settings": { enabled: true, autocomplete: false, neverConvert: ["H2O"] },
      "amper.extension": { strategy: "paste" },
    });
    expect(state.consentAccepted).toBe(false);
    expect(state.settings.enabled).toBe(false);
    expect(state.settings.autocomplete).toBe(false);
    expect(state.settings.neverConvert).toEqual(["H2O"]);
    expect(state.options.strategy).toBe("paste");
  });

  it("restores processing only for the current accepted disclosure version", () => {
    const state = stateFromStorage({
      [CONSENT_VERSION_KEY]: CURRENT_CONSENT_VERSION,
      "amper.settings": { enabled: true },
    });
    expect(state.consentAccepted).toBe(true);
    expect(state.settings.enabled).toBe(true);
  });
});
