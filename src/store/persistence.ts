import { createDefaultState, deserialize, serialize } from "./core";
import type { StargateState } from "./types";

export const STORAGE_KEY = "stargate.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function saveState(storage: StorageLike, state: StargateState): void {
  storage.setItem(STORAGE_KEY, serialize(state));
}

/** Load persisted state; seed a default workspace on first run or corrupt data. */
export function loadState(storage: StorageLike, now?: string): StargateState {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) {
    return seed(storage, now);
  }
  try {
    return deserialize(raw);
  } catch {
    return seed(storage, now);
  }
}

function seed(storage: StorageLike, now?: string): StargateState {
  const seeded = createDefaultState(now);
  saveState(storage, seeded);
  return seeded;
}
