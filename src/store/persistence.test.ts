import { describe, expect, it } from "vitest";
import { createDefaultState } from "./core";
import { loadState, saveState, STORAGE_KEY, type StorageLike } from "./persistence";

function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe("saveState / loadState", () => {
  it("round-trips state through storage", () => {
    const storage = fakeStorage();
    const state = createDefaultState("2026-01-01T00:00:00.000Z");
    saveState(storage, state);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(loadState(storage)).toEqual(state);
  });

  it("seeds and persists a default workspace on first load", () => {
    const storage = fakeStorage();
    const state = loadState(storage);
    expect(state.workspaces).toHaveLength(1);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
  });

  it("recovers with a fresh seed when the stored JSON is unparsable", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "{ not valid json" });
    const state = loadState(storage);
    expect(state.schemaVersion).toBe("1");
    expect(state.workspaces).toHaveLength(1);
  });
});
