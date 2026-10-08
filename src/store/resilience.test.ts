import { describe, expect, it } from "vitest";
import { createDefaultState, serialize, setBackground, setFavicon } from "./core";
import {
  BACKGROUND_BUDGET,
  CONFIG_BUDGET,
  QUOTA_WRITE_GUARD,
  SHADOW_KEY,
  STORAGE_KEY,
  TEMP_KEY,
  isQuotaError,
  loadState,
  meterState,
  saveState,
  stripImages,
  type StorageLike,
} from "./persistence";
import type { StargateState } from "./types";

function quotaError(): Error {
  const e = new Error("quota");
  e.name = "QuotaExceededError";
  return e;
}

function legacyCodeError(code: number): Error {
  const e = new Error("legacy quota");
  (e as unknown as { code: number }).code = code;
  return e;
}

function messageError(): Error {
  return new Error("NS_ERROR_DOM_QUOTA_REACHED");
}

function throwingStorage(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  let onSet: ((key: string, value: string) => void) | null = null;
  const storage: StorageLike & {
    data: Map<string, string>;
    failOnSet: (fn: (key: string, value: string) => void) => void;
  } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      onSet?.(k, v);
      data.set(k, v);
    },
    failOnSet: (fn) => {
      onSet = fn;
    },
  };
  return storage;
}

function stateWithImages(): StargateState {
  const state = createDefaultState("2026-01-01T00:00:00.000Z");
  const ws = state.workspaces[0];
  const withBg = setBackground(state, ws.id, { dataUrl: "data:image/webp;base64,AAAA", alpha: 50 });
  const col = withBg.workspaces[0].columns[0];
  const link = col.blocks[0].links[0];
  return setFavicon(withBg, ws.id, col.id, col.blocks[0].id, link.id, {
    dataUrl: "data:image/png;base64,AAAA",
    source: "custom",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("stripImages", () => {
  it("deep-copies and strips backgrounds and favicons without mutating the source", () => {
    const source = stateWithImages();
    const stripped = stripImages(source);

    expect(stripped.workspaces[0].background.dataUrl).toBeNull();
    expect(stripped.workspaces[0].columns[0].blocks[0].links[0].favicon).toBeUndefined();

    // original stays intact
    expect(source.workspaces[0].background.dataUrl).toBe("data:image/webp;base64,AAAA");
    expect(source.workspaces[0].columns[0].blocks[0].links[0].favicon?.dataUrl).toBe(
      "data:image/png;base64,AAAA",
    );
    expect(stripped).not.toBe(source);
    expect(stripped.workspaces[0]).not.toBe(source.workspaces[0]);
  });
});

describe("meterState", () => {
  it("estimates 2 bytes/char for total, backgrounds, and the config remainder", () => {
    const state = stateWithImages();
    const { totalBytes, backgroundBytes, configBytes } = meterState(state);

    const expectedTotal = serialize(state).length * 2;
    const expectedBackgrounds = "data:image/webp;base64,AAAA".length * 2;
    expect(totalBytes).toBe(expectedTotal);
    expect(backgroundBytes).toBe(expectedBackgrounds);
    expect(configBytes).toBe(expectedTotal - expectedBackgrounds);
    expect(configBytes).toBeGreaterThan(0);
  });

  it("exposes the conservative constants", () => {
    expect(QUOTA_WRITE_GUARD).toBe(4 * 1024 * 1024);
    expect(BACKGROUND_BUDGET).toBe(3 * 1024 * 1024);
    expect(CONFIG_BUDGET).toBe(1 * 1024 * 1024);
  });
});

describe("isQuotaError", () => {
  it("detects the name form", () => {
    expect(isQuotaError(quotaError())).toBe(true);
  });
  it("detects legacy code 22 and 1014", () => {
    expect(isQuotaError(legacyCodeError(22))).toBe(true);
    expect(isQuotaError(legacyCodeError(1014))).toBe(true);
  });
  it("detects the Firefox message", () => {
    expect(isQuotaError(messageError())).toBe(true);
  });
  it("rejects unrelated errors and non-errors", () => {
    expect(isQuotaError(new Error("nope"))).toBe(false);
    expect(isQuotaError(null)).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
    expect(isQuotaError({})).toBe(false);
  });
});

describe("saveState resilience", () => {
  it("writes temp, main, and a stripped shadow on success", () => {
    const storage = throwingStorage();
    const state = stateWithImages();
    saveState(storage, state);

    expect(storage.data.has(TEMP_KEY)).toBe(true);
    expect(storage.getItem(STORAGE_KEY)).toBe(serialize(state));
    const shadow = JSON.parse(storage.getItem(SHADOW_KEY) ?? "{}");
    expect(shadow.workspaces[0].background.dataUrl).toBeNull();
    expect(shadow.workspaces[0].columns[0].blocks[0].links[0].favicon).toBeUndefined();
  });

  it("leaves the previous main key intact when the temp probe hits quota", () => {
    const old = createDefaultState("2026-01-01T00:00:00.000Z");
    const storage = throwingStorage({ [STORAGE_KEY]: serialize(old) });
    const next = setBackground(old, old.workspaces[0].id, {
      dataUrl: "data:image/webp;base64,AAAA",
      alpha: 50,
    });

    storage.failOnSet((key) => {
      if (key === TEMP_KEY) throw quotaError();
    });

    expect(() => saveState(storage, next)).toThrow(/Storage is full/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(serialize(old));
    expect(storage.data.has(TEMP_KEY)).toBe(false);
  });

  it("rejects an over-budget background before touching main", () => {
    const old = createDefaultState("2026-01-01T00:00:00.000Z");
    const storage = throwingStorage({ [STORAGE_KEY]: serialize(old) });
    const overBudget = setBackground(old, old.workspaces[0].id, {
      dataUrl: "x".repeat(1_572_865),
      alpha: 50,
    });

    expect(() => saveState(storage, overBudget)).toThrow(/3 MB budget/i);
    expect(storage.getItem(STORAGE_KEY)).toBe(serialize(old));
  });
});

describe("loadState corruption recovery", () => {
  it("restores the stripped shadow when the main key is unparsable", () => {
    const state = stateWithImages();
    const stripped = stripImages(state);
    const storage = throwingStorage({
      [STORAGE_KEY]: "{ not valid json",
      [SHADOW_KEY]: serialize(stripped),
    });

    const result = loadState(storage);
    expect(result.recovered).toBe(true);
    expect(result.state).toEqual(stripped);
    // restored state is re-persisted to the main key
    expect(storage.getItem(STORAGE_KEY)).toBe(serialize(stripped));
  });

  it("seeds when both the main and shadow keys are unparsable", () => {
    const storage = throwingStorage({
      [STORAGE_KEY]: "{ bad",
      [SHADOW_KEY]: "{ also bad",
    });

    const result = loadState(storage);
    expect(result.recovered).toBe(false);
    expect(result.state.workspaces).toHaveLength(1);
  });
});
