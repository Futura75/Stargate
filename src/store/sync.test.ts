import { describe, expect, it } from "vitest";
import { addWorkspace, createDefaultState, renameWorkspace, setBackground, setTheme } from "./core";
import type { StorageLike } from "./persistence";
import {
  loadSyncMeta,
  mergeRemoteIntoLocal,
  SyncEngine,
  SYNC_META_KEY,
  toRemotePayload,
  type RemoteRow,
  type RemoteStore,
  type SyncStatus,
} from "./sync";
import type { StargateState } from "./types";

const T0 = "2026-01-01T00:00:00.000Z";
const IMG = "data:image/jpeg;base64,AAAA";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

/** In-memory server with the same optimistic-write contract as save_stargate_state(). */
function fakeRemote(initial: RemoteRow | null = null) {
  let row: RemoteRow | null = initial;
  const listeners: ((revision: number) => void)[] = [];
  /** Lets a test sneak in another device's write right before the next save. */
  let beforeSave: (() => void) | null = null;
  const remote: RemoteStore & {
    row: () => RemoteRow | null;
    put: (data: StargateState) => void;
    beforeNextSave: (fn: () => void) => void;
    saves: number;
  } = {
    saves: 0,
    row: () => row,
    put(data) {
      row = { data: JSON.parse(JSON.stringify(data)), revision: (row?.revision ?? 0) + 1 };
      listeners.forEach((l) => l(row!.revision));
    },
    beforeNextSave(fn) {
      beforeSave = fn;
    },
    async fetch() {
      return row ? { data: JSON.parse(JSON.stringify(row.data)), revision: row.revision } : null;
    },
    async save(expected, data) {
      remote.saves++;
      const hook = beforeSave;
      beforeSave = null;
      hook?.();
      const current = row?.revision ?? 0;
      if (current !== expected) return null;
      row = { data: JSON.parse(JSON.stringify(data)), revision: current + 1 };
      return row.revision;
    },
    subscribe(onChange) {
      listeners.push(onChange);
      return () => listeners.splice(listeners.indexOf(onChange), 1);
    },
  };
  return remote;
}

function device(remote: RemoteStore, initial: StargateState, opts: { userId?: string; storage?: StorageLike } = {}) {
  let state = initial;
  let clock = Date.parse(T0);
  const replaced: { next: StargateState; previous: StargateState; firstLink: boolean }[] = [];
  const statuses: SyncStatus[] = [];
  let pending: (() => void) | null = null;
  const storage = opts.storage ?? fakeStorage();
  const engine = new SyncEngine({
    remote,
    storage,
    userId: opts.userId ?? "user-1",
    getState: () => state,
    onRemoteState: (next, previous, firstLink) => {
      state = next;
      replaced.push({ next, previous, firstLink });
    },
    onStatus: (s) => statuses.push(s),
    now: () => new Date((clock += 1000)).toISOString(),
    setTimer: (fn) => {
      pending = fn;
      return 1;
    },
    clearTimer: () => {
      pending = null;
    },
  });
  return {
    engine,
    storage,
    replaced,
    statuses,
    get state() {
      return state;
    },
    /** Make a local edit the way the app does: commit, then notify. */
    edit(next: StargateState) {
      state = next;
      engine.notifyLocalChange();
    },
    /** Advance this device's clock (to model edits made later on another device). */
    tick(ms: number) {
      clock += ms;
    },
    async flush() {
      const fn = pending;
      pending = null;
      fn?.();
      await engine.sync();
    },
  };
}

describe("remote payload", () => {
  it("strips background images and stamps the edit time", () => {
    let s = createDefaultState(T0);
    const ws = s.workspaces[0].id;
    s = setBackground(s, ws, { dataUrl: IMG, alpha: 0.4 });
    const payload = toRemotePayload(s, "2026-02-02T00:00:00.000Z");
    expect(payload.workspaces[0].background).toEqual({ dataUrl: null, alpha: 0.4 });
    expect(payload.exportedAt).toBe("2026-02-02T00:00:00.000Z");
    expect(s.workspaces[0].background.dataUrl).toBe(IMG);
  });

  it("merging a server copy keeps this device's backgrounds by workspace id", () => {
    let local = createDefaultState(T0);
    const ws = local.workspaces[0].id;
    local = setBackground(local, ws, { dataUrl: IMG, alpha: 0.4 });
    const remote = toRemotePayload(renameWorkspace(local, ws, "Renamed"), T0);
    const merged = mergeRemoteIntoLocal(remote, local);
    expect(merged.workspaces[0].name).toBe("Renamed");
    expect(merged.workspaces[0].background.dataUrl).toBe(IMG);
  });

  it("refuses a server copy from a newer schema", () => {
    const local = createDefaultState(T0);
    expect(() => mergeRemoteIntoLocal({ ...local, schemaVersion: "99" }, local)).toThrow();
  });
});

describe("SyncEngine", () => {
  it("uploads local state when the account has no data yet", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    expect(remote.row()?.revision).toBe(1);
    expect(a.engine.syncMeta).toMatchObject({ baseRevision: 1, dirty: false });
    expect(a.statuses.at(-1)).toBe("synced");
  });

  it("adopts the account's data on a device's first link, flagged so the app can offer Undo", async () => {
    const remote = fakeRemote();
    const a = device(remote, setTheme(createDefaultState(T0), "dark"));
    await a.engine.start();

    const b = device(remote, createDefaultState(T0));
    await b.engine.start();
    expect(b.state.settings.theme).toBe("dark");
    expect(b.replaced).toHaveLength(1);
    expect(b.replaced[0].firstLink).toBe(true);
    expect(remote.saves).toBe(1);
  });

  it("pushes debounced local edits and other devices pull them", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    const b = device(remote, createDefaultState(T0));
    await b.engine.start();

    a.edit(setTheme(a.state, "dark"));
    expect(a.engine.syncMeta.dirty).toBe(true);
    await a.flush();
    expect(remote.row()?.revision).toBe(2);

    await b.engine.sync();
    expect(b.state.settings.theme).toBe("dark");
    expect(b.replaced.at(-1)?.firstLink).toBe(false);
  });

  it("does not push when nothing changed", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    await a.engine.sync();
    expect(remote.saves).toBe(1);
  });

  it("on conflict, newer local edits win and are pushed on top", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    const b = device(remote, createDefaultState(T0));
    await b.engine.start();

    // B edits and pushes first, A edits later (A's clock is ahead) and pushes second.
    b.edit(setTheme(b.state, "light"));
    await b.flush();
    a.tick(60_000);
    a.edit(setTheme(a.state, "dark"));
    await a.flush();

    expect(a.state.settings.theme).toBe("dark");
    expect((remote.row()?.data as StargateState).settings.theme).toBe("dark");
    expect(a.engine.syncMeta).toMatchObject({ baseRevision: 3, dirty: false });
  });

  it("on conflict, an older local edit loses to the newer server copy", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    const b = device(remote, createDefaultState(T0));
    await b.engine.start();

    a.edit(setTheme(a.state, "dark")); // A edits first but stays offline…
    b.tick(60_000);
    b.edit(setTheme(b.state, "light")); // …B edits later and pushes.
    await b.flush();
    await a.flush();

    expect(a.state.settings.theme).toBe("light");
    expect(a.engine.syncMeta).toMatchObject({ baseRevision: 2, dirty: false });
  });

  it("re-fetches and retries when another device writes between fetch and save", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();

    a.edit(addWorkspace(a.state, { name: "Work", icon: "💼", color: "#336699" }));
    remote.beforeNextSave(() => remote.put(setTheme(toRemotePayload(a.state, T0), "light")));
    await a.flush();

    expect(a.state.workspaces.map((w) => w.name)).toContain("Work");
    expect(remote.row()?.revision).toBe(3);
    expect((remote.row()?.data as StargateState).workspaces.map((w) => w.name)).toContain("Work");
  });

  it("follows server changes announced by the subscription", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    remote.put(setTheme(toRemotePayload(a.state, "2030-01-01T00:00:00.000Z"), "dark"));
    await a.engine.sync(); // the subscription kicked off a sync; wait for it
    expect(a.state.settings.theme).toBe("dark");
  });

  it("reports errors without throwing and recovers on the next sync", async () => {
    const remote = fakeRemote();
    const realFetch = remote.fetch;
    remote.fetch = async () => {
      throw new Error("network down");
    };
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    expect(a.statuses.at(-1)).toBe("error");

    remote.fetch = realFetch;
    await a.engine.sync();
    expect(a.statuses.at(-1)).toBe("synced");
    expect(remote.row()?.revision).toBe(1);
  });

  it("persists its bookkeeping and starts a fresh link for a different account", async () => {
    const remote = fakeRemote();
    const storage = fakeStorage();
    const a = device(remote, createDefaultState(T0), { storage });
    await a.engine.start();
    expect(loadSyncMeta(storage)).toMatchObject({ userId: "user-1", baseRevision: 1 });

    const other = device(fakeRemote(), createDefaultState(T0), { storage, userId: "user-2" });
    expect(other.engine.syncMeta).toMatchObject({ userId: "user-2", baseRevision: 0 });
    expect(storage.data.has(SYNC_META_KEY)).toBe(true);
  });

  it("stops pushing after stop()", async () => {
    const remote = fakeRemote();
    const a = device(remote, createDefaultState(T0));
    await a.engine.start();
    a.engine.stop();
    a.edit(setTheme(a.state, "dark"));
    await a.flush();
    expect(remote.saves).toBe(1);
  });
});
