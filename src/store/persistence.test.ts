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
    expect(loadState(storage).state).toEqual(state);
  });

  it("seeds and persists a default workspace on first load", () => {
    const storage = fakeStorage();
    const state = loadState(storage).state;
    expect(state.workspaces).toHaveLength(1);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
  });

  it("recovers with a fresh seed when the stored JSON is unparsable", () => {
    const storage = fakeStorage({ [STORAGE_KEY]: "{ not valid json" });
    const result = loadState(storage);
    expect(result.recovered).toBe(false);
    expect(result.state.schemaVersion).toBe("3");
    expect(result.state.workspaces).toHaveLength(1);
  });

  it("migrates a v1 document on load (no data loss)", () => {
    const v1doc = JSON.parse(JSON.stringify(createDefaultState("2026-01-01T00:00:00.000Z")));
    v1doc.schemaVersion = "1";
    for (const w of v1doc.workspaces) {
      delete w.layout;
      delete w.blockTitleSize;
      for (const c of w.columns) {
        for (const b of c.blocks) {
          delete b.description;
          delete b.faviconSize;
        }
      }
    }
    const storage = fakeStorage({ [STORAGE_KEY]: JSON.stringify(v1doc) });
    const { state, recovered } = loadState(storage);
    expect(recovered).toBe(false);
    expect(state.schemaVersion).toBe("3");
    expect(state.workspaces[0].layout).toEqual({ columnCount: 0, fluid: true, columnGap: 18 });
    expect(state.workspaces[0].blockTitleSize).toBe("md");
    expect(state.workspaces[0].columns[0].blocks[0].description).toBe("");
    expect(state.workspaces[0].columns[0].blocks[0].faviconSize).toBe("sm");
    expect(state.workspaces[0].columns[0].blocks[0].linkStyle).toBe("list");
  });
});
