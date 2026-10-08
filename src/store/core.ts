import type { KanbanColumn, StargateState, Workspace } from "./types";

export const SCHEMA_VERSION = "1" as const;
export const APP_NAME = "Stargate" as const;
export const APP_VERSION = "0.1.0" as const;
export const DEFAULT_KANBAN_TITLES = ["Todo", "In Progress", "Done"] as const;

/** Opaque, unique, random id — never displayed. */
export function newId(): string {
  const g = globalThis.crypto;
  if (g && typeof g.getRandomValues === "function") {
    const a = new Uint32Array(4);
    g.getRandomValues(a);
    return Array.from(a, (n) => n.toString(36)).join("");
  }
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** Hostname of a URL with a leading "www." stripped. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Turn a quick-add input into a title + url.
 * - bare domain          -> "https://domain", title = domain
 * - full url             -> as-is, title = domain
 * - "url title…"         -> url + explicit title
 */
export function parseLinkInput(input: string): { title: string; url: string } {
  const trimmed = input.trim();
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0] ?? "";
  const rest = tokens.slice(1).join(" ");
  const hasScheme = /^https?:\/\//i.test(first);
  const url = hasScheme ? first : "https://" + first.replace(/^\/+/, "");
  return { title: rest || domainOf(url), url };
}

export function defaultKanbanColumns(): KanbanColumn[] {
  return DEFAULT_KANBAN_TITLES.map((title) => ({ id: newId(), title, tasks: [] }));
}

export function newWorkspace(input: { name: string; icon: string; color: string }): Workspace {
  return {
    id: newId(),
    name: input.name,
    icon: input.icon,
    color: input.color,
    background: { dataUrl: null, alpha: 70 },
    columns: [],
    kanban: { columns: defaultKanbanColumns() },
  };
}

export function addWorkspace(
  state: StargateState,
  input: { name: string; icon: string; color: string },
): StargateState {
  return { ...state, workspaces: [...state.workspaces, newWorkspace(input)] };
}

export function addColumn(state: StargateState, workspaceId: string, title: string): StargateState {
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId ? { ...w, columns: [...w.columns, { id: newId(), title, blocks: [] }] } : w,
    ),
  };
}

export function addBlock(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  title: string,
): StargateState {
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId
        ? {
            ...w,
            columns: w.columns.map((c) =>
              c.id === columnId ? { ...c, blocks: [...c.blocks, { id: newId(), title, links: [] }] } : c,
            ),
          }
        : w,
    ),
  };
}

export function addLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  input: string,
): StargateState {
  const { title, url } = parseLinkInput(input);
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId
        ? {
            ...w,
            columns: w.columns.map((c) =>
              c.id === columnId
                ? {
                    ...c,
                    blocks: c.blocks.map((b) =>
                      b.id === blockId ? { ...b, links: [...b.links, { id: newId(), title, url }] } : b,
                    ),
                  }
                : c,
            ),
          }
        : w,
    ),
  };
}

export function createDefaultState(now = new Date().toISOString()): StargateState {
  let state: StargateState = {
    schemaVersion: SCHEMA_VERSION,
    app: { name: APP_NAME, version: APP_VERSION },
    exportedAt: now,
    settings: { theme: "system", searchEngine: "google", faviconSource: "off" },
    workspaces: [],
  };
  state = addWorkspace(state, { name: "Personal", icon: "🏠", color: "#5f7161" });
  const wsId = state.workspaces[0].id;
  state = addColumn(state, wsId, "Getting started");
  const colId = state.workspaces[0].columns[0].id;
  state = addBlock(state, wsId, colId, "Welcome");
  const blkId = state.workspaces[0].columns[0].blocks[0].id;
  state = addLink(state, wsId, colId, blkId, "https://github.com/Futura75/Stargate Stargate repo");
  return state;
}

export function serialize(state: StargateState): string {
  return JSON.stringify(state, null, 2);
}

export function deserialize(json: string): StargateState {
  const parsed: unknown = JSON.parse(json);
  if (!isState(parsed)) {
    throw new Error('Invalid Stargate state: expected schemaVersion "1" with a workspaces array');
  }
  return parsed;
}

function isState(x: unknown): x is StargateState {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    o.schemaVersion === SCHEMA_VERSION &&
    Array.isArray(o.workspaces) &&
    typeof o.settings === "object" &&
    o.settings !== null
  );
}
