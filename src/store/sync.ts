import { importState, serialize } from "./core";
import type { StorageLike } from "./persistence";
import type { StargateState } from "./types";

export const SYNC_META_KEY = "stargate.v1.sync";
/** Quiet period after the last local edit before pushing it. */
export const PUSH_DEBOUNCE_MS = 1500;
/** How many times a conflicting push re-fetches and retries before giving up. */
export const MAX_PUSH_ATTEMPTS = 3;

/** The synced row as the server holds it. */
export interface RemoteRow {
  data: unknown;
  revision: number;
}

/** The backend seam: Supabase in the app, an in-memory fake in tests. */
export interface RemoteStore {
  fetch(): Promise<RemoteRow | null>;
  /** Writes only if the server is still at `expectedRevision` (0 = no row yet). Returns the new revision, or null on conflict. */
  save(expectedRevision: number, data: StargateState): Promise<number | null>;
  /** Calls back whenever the row changes on the server; returns an unsubscribe function. */
  subscribe(onChange: (revision: number) => void): () => void;
}

/** Per-device bookkeeping, persisted next to the state. */
export interface SyncMeta {
  userId: string | null;
  /** Server revision this device last saw (0 = never synced for this user). */
  baseRevision: number;
  /** Local edits not yet pushed. */
  dirty: boolean;
  /** When the last local edit happened (ISO 8601, this device's clock). */
  localChangedAt: string | null;
}

export type SyncStatus = "off" | "syncing" | "synced" | "offline" | "error";

export const EMPTY_META: SyncMeta = { userId: null, baseRevision: 0, dirty: false, localChangedAt: null };

export function loadSyncMeta(storage: StorageLike): SyncMeta {
  const raw = storage.getItem(SYNC_META_KEY);
  if (raw === null) return { ...EMPTY_META };
  try {
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      baseRevision: typeof parsed.baseRevision === "number" ? parsed.baseRevision : 0,
      dirty: parsed.dirty === true,
      localChangedAt: typeof parsed.localChangedAt === "string" ? parsed.localChangedAt : null,
    };
  } catch {
    return { ...EMPTY_META };
  }
}

export function saveSyncMeta(storage: StorageLike, meta: SyncMeta): void {
  storage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

/**
 * What goes to the server: background images are stripped (they stay per-device for now),
 * and `exportedAt` carries the time of the last local edit so devices can compare edits.
 */
export function toRemotePayload(state: StargateState, changedAt: string): StargateState {
  return {
    ...state,
    exportedAt: changedAt,
    workspaces: state.workspaces.map((w) => ({ ...w, background: { ...w.background, dataUrl: null } })),
  };
}

/**
 * Adopt a server copy: validate/migrate it like an import, then keep this device's
 * background images for workspaces that still exist.
 */
export function mergeRemoteIntoLocal(remoteData: unknown, local: StargateState): StargateState {
  const remote = importState(JSON.stringify(remoteData));
  const localImages = new Map(local.workspaces.map((w) => [w.id, w.background.dataUrl]));
  return {
    ...remote,
    workspaces: remote.workspaces.map((w) => ({
      ...w,
      background: { ...w.background, dataUrl: localImages.get(w.id) ?? null },
    })),
  };
}

/** Same content ignoring background images and the timestamp: avoids no-op pushes and re-renders. */
export function sameSyncedContent(a: StargateState, b: StargateState): boolean {
  const stamp = "1970-01-01T00:00:00.000Z";
  return serialize(toRemotePayload(a, stamp)) === serialize(toRemotePayload(b, stamp));
}

function remoteChangedAt(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const at = (data as { exportedAt?: unknown }).exportedAt;
  return typeof at === "string" ? at : null;
}

export interface SyncEngineOptions {
  remote: RemoteStore;
  storage: StorageLike;
  userId: string;
  /** Current local state (the app's source of truth). */
  getState: () => StargateState;
  /** Called when the server copy replaces local state. `previous` is the local state it replaced. */
  onRemoteState: (next: StargateState, previous: StargateState, firstLink: boolean) => void;
  onStatus: (status: SyncStatus, message?: string) => void;
  now?: () => string;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/**
 * Keeps one user's state in sync with the server.
 *
 * Conflicts are resolved per whole document with optimistic concurrency: a push names the
 * revision it started from; if the server moved on, the device re-fetches. Then, if this device
 * has unpushed edits newer than the server's last edit, they win and are pushed on top;
 * otherwise the server copy is adopted. On the first link of a device to an account that
 * already has data, the server copy is adopted and the app offers Undo to keep the local one.
 */
export class SyncEngine {
  private meta: SyncMeta;
  private running: Promise<void> | null = null;
  private again = false;
  private timer: unknown = null;
  private unsubscribe: (() => void) | null = null;
  private stopped = false;
  private readonly now: () => string;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly opts: SyncEngineOptions) {
    this.now = opts.now ?? (() => new Date().toISOString());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    const stored = loadSyncMeta(opts.storage);
    // A different (or no) account on this device: start a fresh link, keep pending-edit info.
    this.meta =
      stored.userId === opts.userId
        ? stored
        : { userId: opts.userId, baseRevision: 0, dirty: stored.dirty, localChangedAt: stored.localChangedAt };
    this.persistMeta();
  }

  get syncMeta(): SyncMeta {
    return { ...this.meta };
  }

  /** Begin: subscribe to server changes and run a first sync. */
  start(): Promise<void> {
    this.unsubscribe = this.opts.remote.subscribe((revision) => {
      if (revision > this.meta.baseRevision) void this.sync();
    });
    return this.sync();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Record a local edit and push it after a short quiet period. */
  notifyLocalChange(): void {
    if (this.stopped) return;
    this.meta = { ...this.meta, dirty: true, localChangedAt: this.now() };
    this.persistMeta();
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.sync();
    }, PUSH_DEBOUNCE_MS);
  }

  /** Pull and/or push as needed. Concurrent calls coalesce into one extra run. */
  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.runOnce();
        } while (this.again && !this.stopped);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async runOnce(): Promise<void> {
    this.opts.onStatus("syncing");
    try {
      for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
        if (this.stopped) return;
        const row = await this.opts.remote.fetch();
        if (this.stopped) return;
        const expected = this.reconcile(row);
        if (expected === null) {
          this.opts.onStatus("synced");
          return;
        }
        const changedAt = this.meta.localChangedAt ?? this.now();
        const revision = await this.opts.remote.save(expected, toRemotePayload(this.opts.getState(), changedAt));
        if (this.stopped) return;
        if (revision !== null) {
          this.meta = { ...this.meta, baseRevision: revision, dirty: false };
          this.persistMeta();
          this.opts.onStatus("synced");
          return;
        }
        // Conflict: someone else pushed in between — re-fetch and decide again.
      }
      this.opts.onStatus("error", "Another device keeps changing your data; will retry.");
    } catch (err) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      this.opts.onStatus(offline ? "offline" : "error", err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Decide what to do with the server row. Applies the server copy locally when it wins.
   * Returns the revision to push against, or null when nothing needs pushing.
   */
  private reconcile(row: RemoteRow | null): number | null {
    const { meta } = this;
    if (row === null) return 0; // account has no data yet: upload this device's state

    if (row.revision === meta.baseRevision) {
      return meta.dirty ? row.revision : null;
    }

    const firstLink = meta.baseRevision === 0;
    const remoteAt = remoteChangedAt(row.data);
    const localWins =
      !firstLink && meta.dirty && meta.localChangedAt !== null && (remoteAt === null || meta.localChangedAt > remoteAt);
    if (localWins) return row.revision;

    const previous = this.opts.getState();
    const next = mergeRemoteIntoLocal(row.data, previous);
    this.meta = { ...meta, baseRevision: row.revision, dirty: false };
    this.persistMeta();
    if (!sameSyncedContent(next, previous)) this.opts.onRemoteState(next, previous, firstLink);
    return null;
  }

  private persistMeta(): void {
    try {
      saveSyncMeta(this.opts.storage, this.meta);
    } catch {
      // bookkeeping is best-effort; worst case the next sync re-fetches
    }
  }
}
