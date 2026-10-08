import type { Block, Column, Favicon, FaviconSource, KanbanColumn, Link, SearchEngine, StargateState, Theme, Workspace } from "./types";

export const SCHEMA_VERSION = "1" as const;
export const APP_NAME = "Stargate" as const;
export const APP_VERSION = "0.1.0" as const;
export const DEFAULT_KANBAN_TITLES = ["Todo", "In Progress", "Done"] as const;
export const MAX_FAVICON_BASE64 = 8192;

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

/** Deterministic 0–359 hue derived from a string (FNV-1a). */
export function hueOf(s: string): number {
  let hash = 2166136261;
  for (const ch of s) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/** Uppercase first Unicode code point of a domain. */
export function firstLetter(domain: string): string {
  const first = Array.from(domain.trim())[0];
  return first ? first.toUpperCase() : "";
}

/** Letter tile: first letter + deterministic hue, the offline base favicon tier. */
export function letterTile(domain: string): { letter: string; hue: number } {
  const d = domain.trim();
  return { letter: firstLetter(d), hue: hueOf(d) };
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

export function setSearchEngine(state: StargateState, engine: SearchEngine): StargateState {
  return { ...state, settings: { ...state.settings, searchEngine: engine } };
}

export function setTheme(state: StargateState, theme: Theme): StargateState {
  return { ...state, settings: { ...state.settings, theme } };
}

export function setFaviconSource(state: StargateState, source: FaviconSource): StargateState {
  return { ...state, settings: { ...state.settings, faviconSource: source } };
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

function updateById<T extends { id: string }>(items: T[], id: string, patch: Partial<T>): T[] | null {
  if (!items.some((item) => item.id === id)) return null;
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeById<T extends { id: string }>(items: T[], id: string): T[] | null {
  if (!items.some((item) => item.id === id)) return null;
  return items.filter((item) => item.id !== id);
}

function moveById<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] | null {
  const fromIndex = items.findIndex((item) => item.id === id);
  if (fromIndex === -1) return null;
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(clampIndex(toIndex, next.length), 0, item);
  return next;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(index, length));
}

function mapWorkspace(
  state: StargateState,
  workspaceId: string,
  patch: Partial<Workspace>,
): StargateState | null {
  if (!state.workspaces.some((w) => w.id === workspaceId)) return null;
  return {
    ...state,
    workspaces: state.workspaces.map((w) => (w.id === workspaceId ? { ...w, ...patch } : w)),
  };
}

function mapColumn(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  patch: Partial<Column>,
): StargateState | null {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace || !workspace.columns.some((c) => c.id === columnId)) return null;
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId
        ? { ...w, columns: w.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)) }
        : w,
    ),
  };
}

function mapBlock(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  patch: Partial<Block>,
): StargateState | null {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  const column = workspace?.columns.find((c) => c.id === columnId);
  if (!column || !column.blocks.some((b) => b.id === blockId)) return null;
  return {
    ...state,
    workspaces: state.workspaces.map((w) =>
      w.id === workspaceId
        ? {
            ...w,
            columns: w.columns.map((c) =>
              c.id === columnId
                ? { ...c, blocks: c.blocks.map((b) => (b.id === blockId ? { ...b, ...patch } : b)) }
                : c,
            ),
          }
        : w,
    ),
  };
}

export function renameWorkspace(
  state: StargateState,
  workspaceId: string,
  name: string,
): StargateState {
  const workspaces = updateById(state.workspaces, workspaceId, { name });
  return workspaces === null ? state : { ...state, workspaces };
}

export function updateWorkspace(
  state: StargateState,
  workspaceId: string,
  patch: { icon?: string; color?: string },
): StargateState {
  const workspaces = updateById(state.workspaces, workspaceId, patch);
  return workspaces === null ? state : { ...state, workspaces };
}

export function deleteWorkspace(state: StargateState, workspaceId: string): StargateState {
  if (state.workspaces.length <= 1) return state;
  const workspaces = removeById(state.workspaces, workspaceId);
  return workspaces === null ? state : { ...state, workspaces };
}

export function renameColumn(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  title: string,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return state;
  const columns = updateById(workspace.columns, columnId, { title });
  if (columns === null) return state;
  return mapWorkspace(state, workspaceId, { columns }) ?? state;
}

export function deleteColumn(
  state: StargateState,
  workspaceId: string,
  columnId: string,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return state;
  const columns = removeById(workspace.columns, columnId);
  if (columns === null) return state;
  return mapWorkspace(state, workspaceId, { columns }) ?? state;
}

export function renameBlock(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  title: string,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  if (!column) return state;
  const blocks = updateById(column.blocks, blockId, { title });
  if (blocks === null) return state;
  return mapColumn(state, workspaceId, columnId, { blocks }) ?? state;
}

export function deleteBlock(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  if (!column) return state;
  const blocks = removeById(column.blocks, blockId);
  if (blocks === null) return state;
  return mapColumn(state, workspaceId, columnId, { blocks }) ?? state;
}

export function renameLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
  title: string,
  url: string,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  const block = column?.blocks.find((b) => b.id === blockId);
  if (!block) return state;
  const links = updateById(block.links, linkId, { title, url });
  if (links === null) return state;
  return mapBlock(state, workspaceId, columnId, blockId, { links }) ?? state;
}

export function deleteLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  const block = column?.blocks.find((b) => b.id === blockId);
  if (!block) return state;
  const links = removeById(block.links, linkId);
  if (links === null) return state;
  return mapBlock(state, workspaceId, columnId, blockId, { links }) ?? state;
}

function mapLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
  update: (link: Link) => Link,
): StargateState | null {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  const column = workspace?.columns.find((c) => c.id === columnId);
  const block = column?.blocks.find((b) => b.id === blockId);
  if (!block || !block.links.some((l) => l.id === linkId)) return null;
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
                      b.id === blockId
                        ? { ...b, links: b.links.map((l) => (l.id === linkId ? update(l) : l)) }
                        : b,
                    ),
                  }
                : c,
            ),
          }
        : w,
    ),
  };
}

export function setFavicon(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
  favicon: Favicon,
): StargateState {
  return mapLink(state, workspaceId, columnId, blockId, linkId, (l) => ({ ...l, favicon })) ?? state;
}

export function removeFavicon(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  const column = workspace?.columns.find((c) => c.id === columnId);
  const block = column?.blocks.find((b) => b.id === blockId);
  const link = block?.links.find((l) => l.id === linkId);
  if (!link || link.favicon === undefined) return state;
  return mapLink(state, workspaceId, columnId, blockId, linkId, (l) => {
    const { favicon: _removed, ...rest } = l;
    return rest;
  }) ?? state;
}

export function reorderColumn(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  toIndex: number,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return state;
  const columns = moveById(workspace.columns, columnId, toIndex);
  if (columns === null) return state;
  return mapWorkspace(state, workspaceId, { columns }) ?? state;
}

export function reorderBlock(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  toIndex: number,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  if (!column) return state;
  const blocks = moveById(column.blocks, blockId, toIndex);
  if (blocks === null) return state;
  return mapColumn(state, workspaceId, columnId, { blocks }) ?? state;
}

export function reorderLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  blockId: string,
  linkId: string,
  toIndex: number,
): StargateState {
  const column = state.workspaces
    .find((w) => w.id === workspaceId)
    ?.columns.find((c) => c.id === columnId);
  const block = column?.blocks.find((b) => b.id === blockId);
  if (!block) return state;
  const links = moveById(block.links, linkId, toIndex);
  if (links === null) return state;
  return mapBlock(state, workspaceId, columnId, blockId, { links }) ?? state;
}

export function moveBlock(
  state: StargateState,
  workspaceId: string,
  fromColumnId: string,
  toColumnId: string,
  blockId: string,
  toIndex: number,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  if (!workspace) return state;
  const fromColumn = workspace.columns.find((c) => c.id === fromColumnId);
  const toColumn = workspace.columns.find((c) => c.id === toColumnId);
  if (!fromColumn || !toColumn) return state;
  const block = fromColumn.blocks.find((b) => b.id === blockId);
  if (!block) return state;

  if (fromColumnId === toColumnId) {
    const blocks = moveById(fromColumn.blocks, blockId, toIndex);
    if (blocks === null) return state;
    return mapColumn(state, workspaceId, fromColumnId, { blocks }) ?? state;
  }

  const fromBlocks = fromColumn.blocks.filter((b) => b.id !== blockId);
  const toBlocks = toColumn.blocks.slice();
  toBlocks.splice(clampIndex(toIndex, toBlocks.length), 0, block);
  const columns = workspace.columns.map((c) => {
    if (c.id === fromColumnId) return { ...c, blocks: fromBlocks };
    if (c.id === toColumnId) return { ...c, blocks: toBlocks };
    return c;
  });
  return mapWorkspace(state, workspaceId, { columns }) ?? state;
}

export function moveLink(
  state: StargateState,
  workspaceId: string,
  columnId: string,
  fromBlockId: string,
  toBlockId: string,
  linkId: string,
  toIndex: number,
): StargateState {
  const workspace = state.workspaces.find((w) => w.id === workspaceId);
  const column = workspace?.columns.find((c) => c.id === columnId);
  if (!column) return state;
  const fromBlock = column.blocks.find((b) => b.id === fromBlockId);
  const toBlock = column.blocks.find((b) => b.id === toBlockId);
  if (!fromBlock || !toBlock) return state;
  const link = fromBlock.links.find((l) => l.id === linkId);
  if (!link) return state;

  if (fromBlockId === toBlockId) {
    const links = moveById(fromBlock.links, linkId, toIndex);
    if (links === null) return state;
    return mapBlock(state, workspaceId, columnId, fromBlockId, { links }) ?? state;
  }

  const fromLinks = fromBlock.links.filter((l) => l.id !== linkId);
  const toLinks = toBlock.links.slice();
  toLinks.splice(clampIndex(toIndex, toLinks.length), 0, link);
  const blocks = column.blocks.map((b) => {
    if (b.id === fromBlockId) return { ...b, links: fromLinks };
    if (b.id === toBlockId) return { ...b, links: toLinks };
    return b;
  });
  return mapColumn(state, workspaceId, columnId, { blocks }) ?? state;
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
  return sanitizeFavicons(parsed);
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

const FAVICON_SOURCES = new Set(["custom", "direct", "google-s2", "duckduckgo"]);

function sanitizeFavicons(state: StargateState): StargateState {
  return {
    ...state,
    workspaces: state.workspaces.map((w) => ({
      ...w,
      columns: (w.columns ?? []).map((c) => ({
        ...c,
        blocks: (c.blocks ?? []).map((b) => ({
          ...b,
          links: (b.links ?? []).map(sanitizeLink),
        })),
      })),
    })),
  };
}

function sanitizeLink(link: Link): Link {
  if (link.favicon === undefined) return link;
  const favicon = sanitizeFavicon(link.favicon);
  if (favicon === undefined) {
    const { favicon: _dropped, ...rest } = link;
    return rest;
  }
  return { ...link, favicon };
}

function sanitizeFavicon(favicon: unknown): Favicon | undefined {
  if (typeof favicon !== "object" || favicon === null) return undefined;
  const f = favicon as Record<string, unknown>;
  if (typeof f.dataUrl !== "string" || !f.dataUrl.startsWith("data:")) return undefined;
  if (f.dataUrl.length > MAX_FAVICON_BASE64) return undefined;
  if (typeof f.source !== "string" || !FAVICON_SOURCES.has(f.source)) return undefined;
  if (typeof f.fetchedAt !== "string") return undefined;
  return favicon as Favicon;
}
