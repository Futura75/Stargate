import { createDefaultState, importState, serialize } from "./core";
import type { StargateState } from "./types";

export const STORAGE_KEY = "stargate.v1";
export const SHADOW_KEY = "stargate.v1.shadow";
export const TEMP_KEY = "stargate.v1.tmp";

/** Conservative UTF-16 estimate: 2 bytes per serialized character. */
export const QUOTA_WRITE_GUARD = 4 * 1024 * 1024;
export const BACKGROUND_BUDGET = 3 * 1024 * 1024;
export const CONFIG_BUDGET = 1 * 1024 * 1024;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface MeteredUsage {
  totalBytes: number;
  backgroundBytes: number;
  configBytes: number;
}

export interface LoadResult {
  state: StargateState;
  recovered: boolean;
}

/** Deep copy with bulky image payloads stripped: backgrounds null, favicons omitted. */
export function stripImages(state: StargateState): StargateState {
  return {
    ...state,
    workspaces: state.workspaces.map((w) => ({
      ...w,
      background: { ...w.background, dataUrl: null },
      columns: w.columns.map((c) => ({
        ...c,
        blocks: c.blocks.map((b) => ({
          ...b,
          links: b.links.map(({ favicon: _favicon, ...rest }) => rest),
        })),
      })),
    })),
  };
}

/** Self-metered usage: serialize once and estimate 2 bytes/char (UTF-16). */
export function meterState(state: StargateState): MeteredUsage {
  const totalBytes = serialize(state).length * 2;
  let backgroundBytes = 0;
  for (const w of state.workspaces) {
    if (w.background.dataUrl) backgroundBytes += w.background.dataUrl.length * 2;
  }
  const configBytes = Math.max(0, totalBytes - backgroundBytes);
  return { totalBytes, backgroundBytes, configBytes };
}

/** Detects QuotaExceededError by name, legacy code (22/1014), or Firefox message. */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { name?: unknown; code?: unknown; message?: unknown };
  if (err.name === "QuotaExceededError") return true;
  if (err.code === 22 || err.code === 1014) return true;
  return typeof err.message === "string" && err.message.includes("NS_ERROR_DOM_QUOTA_REACHED");
}

function quotaMessage(context: string): Error {
  return new Error(`Storage is full — remove a background or export a backup (${context}).`);
}

/**
 * Persist state atomically:
 * 1. pre-check the self-metered usage against the write-guard and sub-budgets;
 * 2. probe-write the full payload to a temp key (so a quota failure never touches main);
 * 3. swap the main key into place;
 * 4. write a stripped last-good shadow copy.
 */
export function saveState(storage: StorageLike, state: StargateState): void {
  const usage = meterState(state);
  if (usage.totalBytes > QUOTA_WRITE_GUARD) {
    throw quotaMessage(`estimated ${usage.totalBytes} bytes exceeds the 4 MB write-guard`);
  }
  if (usage.backgroundBytes > BACKGROUND_BUDGET) {
    throw quotaMessage(`backgrounds use ${usage.backgroundBytes} bytes of the 3 MB budget`);
  }
  if (usage.configBytes > CONFIG_BUDGET) {
    throw quotaMessage(`configuration uses ${usage.configBytes} bytes of the 1 MB budget`);
  }

  const serialized = serialize(state);

  try {
    storage.setItem(TEMP_KEY, serialized);
  } catch (e) {
    if (isQuotaError(e)) throw quotaMessage("the temp write was refused");
    throw e;
  }

  storage.setItem(STORAGE_KEY, serialized);

  try {
    storage.setItem(SHADOW_KEY, serialize(stripImages(state)));
  } catch (e) {
    if (isQuotaError(e)) throw quotaMessage("the shadow write was refused");
    throw e;
  }
}

/**
 * Load persisted state; recover the stripped shadow copy if the main key is
 * unparsable, and seed a default workspace when both are missing or corrupt.
 */
export function loadState(storage: StorageLike, now?: string): LoadResult {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null) {
    try {
      return { state: importState(raw), recovered: false };
    } catch {
      // main key is unparsable — fall through to the shadow copy
    }
  }

  const shadow = storage.getItem(SHADOW_KEY);
  if (shadow !== null) {
    try {
      const state = importState(shadow);
      try {
        saveState(storage, state);
      } catch {
        // recovery still succeeds even if persisting the restored copy fails
      }
      return { state, recovered: true };
    } catch {
      // shadow copy is also unparsable — fall through to seed
    }
  }

  return { state: seed(storage, now), recovered: false };
}

function seed(storage: StorageLike, now?: string): StargateState {
  const seeded = createDefaultState(now);
  saveState(storage, seeded);
  return seeded;
}
