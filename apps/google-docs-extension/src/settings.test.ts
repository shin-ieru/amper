import { describe, expect, it } from "vitest";
import { LEGACY_STORAGE_KEYS, migrateLegacyStorage, type StorageAreaLike } from "./settings";

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
