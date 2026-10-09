import type { Block, Link, StargateState, Workspace } from "./types";
import { DEFAULT_BLOCK_TITLE_SIZE, DEFAULT_LINK_STYLE, DEFAULT_WORKSPACE_LAYOUT, newId, newWorkspace } from "./core";

/** A parsed bookmark link: title + URL, entities already decoded. */
export interface BookmarksLink {
  type: "link";
  title: string;
  url: string;
}

/**
 * A parsed bookmark folder: its name, its stable identity within one parse, and its ordered
 * children (folders or links). `path` is the folder-name path from the tree root, so a folder's
 * identity does not depend on array positions (used to select/prune subtrees).
 */
export interface BookmarksFolder {
  type: "folder";
  name: string;
  path: string[];
  children: BookmarksEntry[];
}

export type BookmarksEntry = BookmarksFolder | BookmarksLink;

/**
 * Links and subfolders a folder holds, counted recursively at any depth. The folder itself is not
 * counted; only its children and their descendants.
 */
export function bookmarksFolderCounts(
  folder: BookmarksFolder,
): { links: number; subfolders: number } {
  let links = 0;
  let subfolders = 0;
  for (const child of folder.children) {
    if (child.type === "folder") {
      subfolders += 1;
      const nested = bookmarksFolderCounts(child);
      links += nested.links;
      subfolders += nested.subfolders;
    } else {
      links += 1;
    }
  }
  return { links, subfolders };
}

/** Root of a parsed bookmarks file: top-level folders and root-level loose links, in file order. */
export interface BookmarksTree {
  entries: BookmarksEntry[];
}

/** One folder row of the picker: its identity, indentation depth and recursive counts. */
export interface BookmarkFolderRow {
  path: string[];
  name: string;
  /** 0 for a top-level folder, 1 for its subfolders, and so on. */
  depth: number;
  /** Links held by the folder and its descendants, at any depth. */
  links: number;
  /** Subfolders held by the folder and its descendants, at any depth. */
  subfolders: number;
}

/** Stable string key for a folder `path`, used to store/compare exclusions across the seam. */
export function folderPathKey(path: string[]): string {
  return JSON.stringify(path);
}

/**
 * Every folder of the tree, in pre-order (a folder before its subfolders), with indentation depth
 * and recursive link/subfolder counts. Links never appear: the picker shows links only as counts.
 */
export function listBookmarkFolders(tree: BookmarksTree): BookmarkFolderRow[] {
  const rows: BookmarkFolderRow[] = [];
  const walk = (folder: BookmarksFolder, depth: number) => {
    const { links, subfolders } = bookmarksFolderCounts(folder);
    rows.push({ path: folder.path, name: folder.name, depth, links, subfolders });
    for (const child of folder.children) {
      if (child.type === "folder") walk(child, depth + 1);
    }
  };
  for (const entry of tree.entries) {
    if (entry.type === "folder") walk(entry, 0);
  }
  return rows;
}

/**
 * Which folders to leave out. Everything is included by default; `excludedFolders` holds the
 * `folderPathKey` of folders to exclude, and excluding a folder prunes its whole subtree.
 */
export interface BookmarksSelection {
  excludedFolders: string[];
  includeRootLinks?: boolean;
  /** Whether a folder's own loose links become a `DEFAULT_UNGROUPED_BLOCK_TITLE` block (default on). */
  includeUngroupedBlock?: boolean;
}

/** Title of the synthetic block that collects a folder's ungrouped links. */
export const DEFAULT_UNGROUPED_BLOCK_TITLE = "Generali";
/** Title of the synthetic workspace that collects root-level loose links. */
export const DEFAULT_BOOKMARKS_WORKSPACE_TITLE = "Segnalibri";
/** Title of the single column every imported workspace gets. */
export const DEFAULT_BOOKMARKS_COLUMN_TITLE = "Links";

/** Appearance of imported workspaces: a neutral icon/color, like a hand-made one. */
const IMPORTED_WORKSPACE_ICON = "✨";
const IMPORTED_WORKSPACE_COLOR = "#5f7161";

/**
 * Parses a Netscape bookmark export (`<!DOCTYPE NETSCAPE-Bookmark-file-1>`, the format
 * Chrome/Firefox/Edge write) into a plain, serializable tree:
 * - a folder node (name + ordered children),
 * - a link node (title + url).
 *
 * Top-level folders and root-level loose links are both returned in `entries`, in file order.
 * `HR` separators, comments and metadata (`TITLE`, `H1`, `META`) are ignored; HTML entities in
 * names/URLs are decoded.
 *
 * @throws {Error} on input that is not a Netscape bookmarks file (no `<DL>`), on unbalanced
 * `<DL>`/`</DL>` blocks, or on unterminated comments/tags. A valid file with no bookmarks
 * (an empty `<DL>`) yields an empty tree, not an error.
 */
export function parseBookmarksHtml(html: string): BookmarksTree {
  const tokens = tokenize(html);
  const listCount = assertBalancedLists(tokens);
  if (listCount === 0) {
    throw new Error("not a Netscape bookmarks file: no <DL> list found");
  }
  const root: BookmarksEntry[] = [];
  parseList(tokens, 0, root, []);
  return { entries: root };
}

/**
 * Appends the selected bookmark folders as new workspaces to `state`, returning a new state and
 * leaving the input untouched. Everything is included by default: each top-level folder becomes a
 * workspace unless it is listed in `selection.excludedFolders` (as a `folderPathKey`); excluding a
 * folder prunes its whole subtree. `selection.includeRootLinks` also imports the root-level loose
 * links as a single `DEFAULT_BOOKMARKS_WORKSPACE_TITLE` workspace.
 *
 * Mapping per included folder: the folder becomes a workspace (one `"Links"` column); its included
 * first-level subfolders become blocks (excluded subfolders are pruned); their links (and everything
 * nested deeper, flattened) become links; the folder's own loose links land in a
 * `DEFAULT_UNGROUPED_BLOCK_TITLE` block only when `selection.includeUngroupedBlock` is not `false`.
 * Empty blocks/workspaces are skipped, duplicate names get `" (2)"`/`" (3)"` suffixes, and the order
 * follows the file. No workspace is ever created from a nested folder.
 */
export function importBookmarksFromTree(
  state: StargateState,
  tree: BookmarksTree,
  selection: BookmarksSelection,
): StargateState {
  const usedNames = new Set(state.workspaces.map((w) => w.name));
  const newWorkspaces: Workspace[] = [];

  const excluded = new Set(selection.excludedFolders);
  const includeUngroupedBlock = selection.includeUngroupedBlock ?? true;

  for (const entry of tree.entries) {
    if (entry.type !== "folder" || excluded.has(folderPathKey(entry.path))) continue;
    const workspace = folderToWorkspace(entry, usedNames, excluded, includeUngroupedBlock);
    if (workspace) newWorkspaces.push(workspace);
  }

  if (selection.includeRootLinks) {
    const looseLinks = tree.entries.filter((e): e is BookmarksLink => e.type === "link");
    if (looseLinks.length > 0) {
      newWorkspaces.push(rootLinksWorkspace(looseLinks, usedNames));
    }
  }

  return { ...state, workspaces: [...state.workspaces, ...newWorkspaces] };
}

/** Builds one workspace from an included folder, or `null` when it has no links to import. */
function folderToWorkspace(
  folder: BookmarksFolder,
  usedNames: Set<string>,
  excluded: Set<string>,
  includeUngroupedBlock: boolean,
): Workspace | null {
  const blocks: Block[] = [];
  const looseLinks: Link[] = [];
  for (const child of folder.children) {
    if (child.type === "folder") {
      if (excluded.has(folderPathKey(child.path))) continue;
      const links = collectLinks(child, excluded);
      if (links.length > 0) blocks.push(makeBlock(child.name, links));
    } else {
      looseLinks.push(toLink(child));
    }
  }
  if (includeUngroupedBlock && looseLinks.length > 0) {
    blocks.push(makeBlock(DEFAULT_UNGROUPED_BLOCK_TITLE, looseLinks));
  }
  if (blocks.length === 0) return null;

  return decorate(
    newWorkspace({
      name: uniqueName(folder.name, usedNames),
      icon: IMPORTED_WORKSPACE_ICON,
      color: IMPORTED_WORKSPACE_COLOR,
    }),
    blocks,
  );
}

/** Workspace that collects the root-level loose links of the file. */
function rootLinksWorkspace(links: BookmarksLink[], usedNames: Set<string>): Workspace {
  const block = makeBlock(DEFAULT_UNGROUPED_BLOCK_TITLE, links.map(toLink));
  return decorate(
    newWorkspace({
      name: uniqueName(DEFAULT_BOOKMARKS_WORKSPACE_TITLE, usedNames),
      icon: IMPORTED_WORKSPACE_ICON,
      color: IMPORTED_WORKSPACE_COLOR,
    }),
    [block],
  );
}

/** Applies the single Links column and the app's default appearance/layout/title size. */
function decorate(workspace: Workspace, blocks: Block[]): Workspace {
  return {
    ...workspace,
    layout: { ...DEFAULT_WORKSPACE_LAYOUT },
    blockTitleSize: DEFAULT_BLOCK_TITLE_SIZE,
    columns: [{ id: newId(), title: DEFAULT_BOOKMARKS_COLUMN_TITLE, blocks }],
  };
}

/** Depth-first links of a folder, flattening any nesting deeper than the first level. */
function collectLinks(folder: BookmarksFolder, excluded: Set<string>): Link[] {
  const links: Link[] = [];
  for (const child of folder.children) {
    if (child.type === "folder") {
      if (excluded.has(folderPathKey(child.path))) continue;
      links.push(...collectLinks(child, excluded));
    } else {
      links.push(toLink(child));
    }
  }
  return links;
}

function toLink(link: BookmarksLink): Link {
  return { id: newId(), title: link.title, url: link.url };
}

function makeBlock(title: string, links: Link[]): Block {
  return { id: newId(), title, linkStyle: DEFAULT_LINK_STYLE, links };
}

/** A name that collides with an existing (or just-created) one gets " (2)", " (3)"… */
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  const name = `${base} (${n})`;
  used.add(name);
  return name;
}

interface Token {
  kind: "open" | "close" | "text";
  /** Lowercased tag name for open/close; empty for text. */
  tag: string;
  /** Raw attribute string for open tags; text content for text tokens. */
  raw: string;
}

/** Splits HTML into open/close/text tokens, dropping comments and declarations. */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      tokens.push({ kind: "text", tag: "", raw: html.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ kind: "text", tag: "", raw: html.slice(i, lt) });

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      if (end === -1) throw new Error("malformed bookmarks file: unterminated comment");
      i = end + 3;
      continue;
    }

    const gt = findTagEnd(html, lt);
    if (gt === -1) throw new Error("malformed bookmarks file: unterminated tag");
    const inner = html.slice(lt + 1, gt);

    if (inner.startsWith("!") || inner.startsWith("?")) {
      i = gt + 1; // doctype / processing instruction
      continue;
    }
    if (inner.startsWith("/")) {
      const tag = inner.slice(1).trim().toLowerCase();
      if (tag) tokens.push({ kind: "close", tag, raw: "" });
      i = gt + 1;
      continue;
    }
    const match = /^([a-zA-Z][a-zA-Z0-9]*)([\s\S]*)$/.exec(inner);
    if (!match) {
      tokens.push({ kind: "text", tag: "", raw: "<" }); // stray "<" — treat as text
      i = lt + 1;
      continue;
    }
    tokens.push({ kind: "open", tag: match[1].toLowerCase(), raw: match[2] });
    i = gt + 1;
  }
  return tokens;
}

/** Index of the `>` closing a tag at `start`, skipping quoted attribute values (or -1). */
function findTagEnd(html: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return i;
    }
  }
  return -1;
}

/** Validates `<DL>` balance and returns how many `<DL>` opens were seen. */
function assertBalancedLists(tokens: Token[]): number {
  let depth = 0;
  let opens = 0;
  for (const t of tokens) {
    if (t.kind === "open" && t.tag === "dl") {
      depth++;
      opens++;
    } else if (t.kind === "close" && t.tag === "dl") {
      depth--;
      if (depth < 0) throw new Error("malformed bookmarks file: unexpected </DL>");
    }
  }
  if (depth !== 0) throw new Error("malformed bookmarks file: unbalanced <DL>/</DL>");
  return opens;
}

/**
 * Collects the entries of the list that starts at `start` (right after a `<DL>` open tag) into
 * `out`, returning the index just past the matching `</DL>` (or the end of input for the implicit
 * root list). A folder entry claims the `<DL>` that immediately follows it as its children; an
 * unattached `<DL>` (e.g. the root list) is merged into the current list.
 */
function parseList(tokens: Token[], start: number, out: BookmarksEntry[], parentPath: string[]): number {
  let pendingFolder: BookmarksFolder | null = null;
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "close" && t.tag === "dl") return i + 1;
    if (t.kind === "open" && t.tag === "dl") {
      const children: BookmarksEntry[] = [];
      i = parseList(tokens, i + 1, children, pendingFolder ? pendingFolder.path : parentPath);
      if (pendingFolder) {
        pendingFolder.children = children;
        pendingFolder = null;
      } else {
        out.push(...children);
      }
      continue;
    }
    if (t.kind === "open" && t.tag === "dt") {
      const entry = parseEntryAfterDt(tokens, i + 1, parentPath);
      if (entry) {
        out.push(entry.node);
        pendingFolder = entry.node.type === "folder" ? entry.node : null;
        i = entry.next;
      } else {
        pendingFolder = null;
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

/**
 * Reads the entry a `<DT>` introduces. Returns `null` (without consuming anything) when no `<H3>`
 * or `<A>` follows — e.g. a stray `<DT>` or the start of the next list.
 */
function parseEntryAfterDt(tokens: Token[], start: number, parentPath: string[]): { node: BookmarksEntry; next: number } | null {
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "text") {
      i++;
      continue;
    }
    if (t.kind === "close") {
      if (t.tag === "dl" || t.tag === "dt") return null;
      i++;
      continue;
    }
    if (t.tag === "dt" || t.tag === "dl") return null;
    if (t.tag === "h3") {
      const { text, next } = readElementText(tokens, i, "h3");
      const name = decodeEntities(text).trim();
      return { node: { type: "folder", name, path: [...parentPath, name], children: [] }, next };
    }
    if (t.tag === "a") {
      const { text, next } = readElementText(tokens, i, "a");
      return { node: { type: "link", title: decodeEntities(text).trim(), url: decodeEntities(readHref(t.raw)) }, next };
    }
    i++; // <DD>, <p> and other non-entry tags inside the current item
  }
  return null;
}

/** Concatenates the text of an element up to its matching close tag; throws when unclosed. */
function readElementText(tokens: Token[], start: number, tag: string): { text: string; next: number } {
  let text = "";
  let i = start + 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === "text") {
      text += t.raw;
      i++;
      continue;
    }
    if (t.kind === "close" && t.tag === tag) return { text, next: i + 1 };
    i++;
  }
  throw new Error(`malformed bookmarks file: unclosed <${tag.toUpperCase()}>`);
}

/** Value of the `HREF` attribute (entities decoded by the caller); empty when absent. */
function readHref(attrs: string): string {
  const match = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(attrs);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/** Decodes the named and numeric HTML entities a bookmark export can contain. */
function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}
