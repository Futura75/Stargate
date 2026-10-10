<script lang="ts">
  import {
    addBlock,
    addColumn,
    addKanbanColumn,
    addLink,
    addTask,
    addWorkspace,
    deleteBlock,
    deleteColumn,
    deleteKanbanColumn,
    deleteLink,
    deleteTask,
    deleteWorkspace,
    domainOf,
    exportState,
    importState,
    letterTile,
    linkStyleOf,
    MAX_BACKGROUND_BASE64,
    moveBlock,
    moveLink,
    moveTask,
    moveWorkspace,
    removeBackground,
    removeFavicon,
    renameBlock,
    renameColumn,
    renameKanbanColumn,
    renameLink,
    renameWorkspace,
    reorderColumn,
    reorderKanbanColumn,
    resolveActiveWorkspace,
    setBackground,
    setBackgroundAlpha,
    setFavicon,
    setFaviconSource,
    setLastWorkspaceId,
    setLinkUrl,
    setOpenWorkspace,
    setSearchEngine,
    setTheme,
    updateBlockSettings,
    updateBlockTitleSize,
    updateTask,
    updateWorkspace,
    updateWorkspaceLayout,
    DEFAULT_BLOCK_TITLE_SIZE,
    DEFAULT_LINK_STYLE,
    DEFAULT_OPEN_WORKSPACE,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "./store/core";
  import {
    DEFAULT_UNGROUPED_BLOCK_TITLE,
    DEFAULT_BOOKMARKS_WORKSPACE_TITLE,
    folderPathKey,
    importBookmarksFromTree,
    listBookmarkFolders,
    parseBookmarksHtml,
    type BookmarkFolderRow,
    type BookmarksTree,
  } from "./store/bookmarks";
  import { browserCodec } from "./store/codec";
  import { loadState, meterState, saveState } from "./store/persistence";
  import { SyncEngine, type SyncStatus } from "./store/sync";
  import { signIn, signOut, supabaseRemote, syncConfigured, watchSession, type OAuthProvider } from "./sync/supabase";
  import type {
    Block,
    BlockTitleSize,
    Column,
    FaviconSize,
    FaviconSource,
    KanbanColumn,
    Link,
    LinkStyle,
    SearchEngine,
    StargateState,
    Task,
    Theme,
    Workspace,
  } from "./store/types";

  const loaded = loadState(localStorage);
  let doc: StargateState = $state(loaded.state);
  let recovered: boolean = $state(loaded.recovered);
  let activeId: string = $state(resolveActiveWorkspace(loaded.state)?.id ?? "");

  const active = $derived(doc.workspaces.find((w) => w.id === activeId) ?? doc.workspaces[0]);

  const workspaceLayout = $derived(active?.layout ?? DEFAULT_WORKSPACE_LAYOUT);
  const blockTitleSize = $derived(active?.blockTitleSize ?? DEFAULT_BLOCK_TITLE_SIZE);

  type DragPayload =
    | { kind: "workspace"; workspaceId: string }
    | { kind: "column"; columnId: string }
    | { kind: "block"; columnId: string; blockId: string }
    | { kind: "link"; columnId: string; blockId: string; linkId: string }
    | { kind: "kanbanColumn"; columnId: string }
    | { kind: "task"; columnId: string; taskId: string };

  /** Inline add forms ("+ Add link", "+ Add block", …) are revealed one at a time. */
  type AddingKind = "link" | "block" | "column" | "task" | "kanbanColumn";

  let drag: DragPayload | null = $state(null);
  let dropTarget: string | null = $state(null);
  let view: "links" | "kanban" = $state("links");
  let sheet: "settings" | "workspace" | null = $state(null);
  let storageError: string | null = $state(null);
  let pendingSave: StargateState | null = $state(null);
  let recompressing: boolean = $state(false);
  let expandedTaskId: string | null = $state(null);
  let expandedColumnId: string | null = $state(null);
  let notesDraft: string = $state("");
  let dueDraft: string = $state("");
  let editingTaskId: string | null = $state(null);
  let editingColumnId: string | null = $state(null);
  let titleDraft: string = $state("");
  let adding: { kind: AddingKind; id: string } | null = $state(null);
  let renaming: { kind: "column" | "kanbanColumn"; id: string } | null = $state(null);
  let renameDraft: string = $state("");
  let settingsColumnId: string | null = $state(null);
  let settingsBlockId: string | null = $state(null);
  let settingsDescription: string = $state("");
  let settingsFaviconSize: FaviconSize = $state("sm");
  let settingsLinkStyle: LinkStyle = $state(DEFAULT_LINK_STYLE);
  let settingsTitle: string = $state("");
  let linkSettingsColumnId: string | null = $state(null);
  let linkSettingsBlockId: string | null = $state(null);
  let linkSettingsLinkId: string | null = $state(null);
  let linkSettingsTitle: string = $state("");
  let linkSettingsUrl: string = $state("");
  let bookmarksInput: HTMLInputElement | null = null;
  let bookmarksTree = $state<BookmarksTree | null>(null);
  let bookmarksExcluded: string[] = $state([]);
  let bookmarksIncludeRootLinks: boolean = $state(false);
  let bookmarksIncludeUngroupedBlock: boolean = $state(true);
  let confirmDialog: { title: string; text: string; ok: string; run: () => void } | null = $state(null);
  let toasts: { id: number; message: string; undo: StargateState | null }[] = $state([]);
  let toastSeq = 0;
  let searchQuery: string = $state("");
  let searchSel: number = $state(0);
  let searchFocused: boolean = $state(false);
  let searchInput: HTMLInputElement | null = $state(null);
  let paletteOpen: boolean = $state(false);
  let paletteQuery: string = $state("");
  let paletteSel: number = $state(0);

  const bookmarksFolders = $derived(bookmarksTree ? listBookmarkFolders(bookmarksTree) : []);
  const bookmarksHasRootLinks = $derived(bookmarksTree?.entries.some((e) => e.type === "link") ?? false);
  const bookmarksRootLinkCount = $derived(
    bookmarksTree?.entries.filter((e) => e.type === "link").length ?? 0,
  );
  const bookmarksCanConfirm = $derived(
    bookmarksFolders.some((f) => f.depth === 0 && !bookmarksExcluded.includes(folderPathKey(f.path))) ||
      (bookmarksIncludeRootLinks && bookmarksHasRootLinks),
  );
  const bookmarksWorkspaceCount = $derived(
    bookmarksFolders.filter((f) => f.depth === 0 && !bookmarksExcluded.includes(folderPathKey(f.path))).length +
      (bookmarksIncludeRootLinks && bookmarksHasRootLinks ? 1 : 0),
  );

  const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
  const THEME_LABEL: Record<Theme, string> = {
    light: "Light",
    dark: "Dark",
    system: "System",
  };
  const THEME_ICON: Record<Theme, string> = {
    light: "sun",
    dark: "moon",
    system: "system",
  };

  const ENGINE_LABEL: Record<SearchEngine, string> = {
    google: "Google",
    ddg: "DuckDuckGo",
    bing: "Bing",
  };

  const ENGINE_OPTIONS: SearchEngine[] = ["google", "ddg", "bing"];

  const FAVICON_SOURCE_OPTIONS: FaviconSource[] = ["off", "google-s2", "duckduckgo"];
  const FAVICON_SOURCE_LABEL: Record<FaviconSource, string> = {
    off: "Off",
    "google-s2": "Google",
    duckduckgo: "DuckDuckGo",
  };

  const FAVICON_SIZE_OPTIONS: FaviconSize[] = ["sm", "md", "lg"];
  const FAVICON_SIZE_LABEL: Record<FaviconSize, string> = {
    sm: "Small 16",
    md: "Medium 24",
    lg: "Large 32",
  };
  const FAVICON_SIZE_PX: Record<FaviconSize, number> = {
    sm: 16,
    md: 24,
    lg: 32,
  };

  const LINK_STYLE_OPTIONS: LinkStyle[] = ["list", "detail", "tiles"];
  const LINK_STYLE_LABEL: Record<LinkStyle, string> = {
    list: "List",
    detail: "Detail",
    tiles: "Tiles",
  };

  /** `tiles` renders a fixed large favicon regardless of the block's faviconSize (#33). */
  const TILE_FAVICON_PX = 40;

  const BLOCK_TITLE_SIZE_OPTIONS: BlockTitleSize[] = ["sm", "md", "lg"];
  const BLOCK_TITLE_SIZE_LABEL: Record<BlockTitleSize, string> = {
    sm: "Small",
    md: "Medium",
    lg: "Large",
  };
  const BLOCK_TITLE_SIZE_PX: Record<BlockTitleSize, number> = {
    sm: 14,
    md: 16,
    lg: 18.5,
  };

  const OPEN_WORKSPACE_OPTIONS = ["first", "last"] as const;
  const OPEN_WORKSPACE_LABEL: Record<(typeof OPEN_WORKSPACE_OPTIONS)[number], string> = {
    first: "First workspace",
    last: "Last used",
  };

  const WORKSPACE_ICONS = ["🏠", "💼", "✈️", "📚", "🎵", "🧪", "🛒", "🎮", "🌿", "⭐", "🧭", "🛠️", "🎨", "📰", "💡", "✨"];
  const WORKSPACE_COLORS = ["#5f7161", "#3f6d8c", "#b0683f", "#8a5a9c", "#a8873a", "#4f7f7a", "#9b4b5a", "#59606b"];

  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || "");
  const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

  const ICONS: Record<string, string> = {
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    system: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
    folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
    command: '<path d="M9 6a3 3 0 10-3 3h12a3 3 0 10-3-3v12a3 3 0 103-3H6a3 3 0 103 3z"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    undo: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
    link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/>',
  };

  function icon(name: string): string {
    return `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ""}</svg>`;
  }

  /** Focuses (and optionally selects) an element as soon as it mounts. */
  function autofocus(node: HTMLInputElement | HTMLTextAreaElement, select: boolean = false) {
    node.focus();
    if (select) node.select();
  }

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  let prefersDark: boolean = $state(mq.matches);

  $effect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      prefersDark = e.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  const resolvedTheme = $derived(
    doc.settings.theme === "dark" || (doc.settings.theme === "system" && prefersDark) ? "dark" : "light",
  );

  $effect(() => {
    document.body.dataset.resolved = resolvedTheme;
    document.body.dataset.theme = doc.settings.theme;
  });

  $effect(() => {
    document.body.style.setProperty("--ws", active?.color ?? "#5f7161");
  });

  const todayLabel = new Date().toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" });

  function commit(next: StargateState): boolean {
    try {
      saveState(localStorage, next);
      doc = next;
      pendingSave = null;
      storageError = null;
      syncEngine?.notifyLocalChange();
      return true;
    } catch (err) {
      pendingSave = next;
      storageError = err instanceof Error ? err.message : "Could not save your changes.";
      return false;
    }
  }

  // ── Remote sync (SPEC §9): optional, only when the build has Supabase settings ──

  let account: { id: string; email: string } | null = $state(null);
  let syncStatus: SyncStatus = $state("off");
  let syncMessage: string | null = $state(null);
  let syncEngine: SyncEngine | null = null;
  let syncUserId: string | null = null;

  const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
    off: "Not signed in.",
    syncing: "Syncing…",
    synced: "Up to date.",
    offline: "Offline — changes will sync when you reconnect.",
    error: "Sync problem — will retry.",
  };

  /** The server copy replaced local state (another browser changed it, or first sign-in). */
  function applyRemoteState(next: StargateState, previous: StargateState, firstLink: boolean) {
    try {
      saveState(localStorage, next);
    } catch {
      // keep showing the synced copy even if this browser's storage refuses it
    }
    doc = next;
    if (!doc.workspaces.some((w) => w.id === activeId)) activeId = resolveActiveWorkspace(doc)?.id ?? "";
    if (firstLink) showToast("Loaded the data synced to your account.", previous);
  }

  function startSync(userId: string) {
    syncEngine?.stop();
    syncUserId = userId;
    syncEngine = new SyncEngine({
      remote: supabaseRemote(userId),
      storage: localStorage,
      userId,
      getState: () => doc,
      onRemoteState: applyRemoteState,
      onStatus: (status, message) => {
        syncStatus = status;
        syncMessage = message ?? null;
      },
    });
    void syncEngine.start();
  }

  function stopSync() {
    syncEngine?.stop();
    syncEngine = null;
    syncUserId = null;
    syncStatus = "off";
    syncMessage = null;
  }

  $effect(() => {
    if (!syncConfigured) return;
    const unwatch = watchSession((session) => {
      const user = session?.user ?? null;
      if ((user?.id ?? null) === syncUserId) return;
      if (!user) {
        account = null;
        stopSync();
        return;
      }
      account = { id: user.id, email: user.email ?? "" };
      startSync(user.id);
    });
    const resync = () => {
      if (document.visibilityState === "visible") void syncEngine?.sync();
    };
    window.addEventListener("online", resync);
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      unwatch();
      stopSync();
      window.removeEventListener("online", resync);
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  });

  async function onSignIn(provider: OAuthProvider) {
    try {
      await signIn(provider);
    } catch (err) {
      showToast(err instanceof Error ? `Sign-in failed: ${err.message}` : "Sign-in failed.");
    }
  }

  async function onSignOut() {
    try {
      await signOut();
    } catch (err) {
      showToast(err instanceof Error ? `Sign-out failed: ${err.message}` : "Sign-out failed.");
    }
  }

  function showToast(message: string, undo: StargateState | null = null) {
    const id = ++toastSeq;
    toasts = [...toasts.slice(-2), { id, message, undo }];
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
    }, 6500);
  }

  /** Destructive edits apply at once and offer Undo, instead of a blocking confirm(). */
  function commitWithUndo(next: StargateState, message: string) {
    const previous = doc;
    if (commit(next)) showToast(message, previous);
  }

  function undoToast(id: number) {
    const toast = toasts.find((t) => t.id === id);
    toasts = toasts.filter((t) => t.id !== id);
    if (!toast?.undo) return;
    commit(toast.undo);
    if (!doc.workspaces.some((w) => w.id === activeId)) activeId = doc.workspaces[0]?.id ?? "";
  }

  function hasBackgroundImage(state: StargateState | null): boolean {
    return state?.workspaces.some((w) => w.background.dataUrl !== null) ?? false;
  }

  const canRecompress = $derived(hasBackgroundImage(pendingSave));
  const usage = $derived(meterState(doc));
  const STORAGE_CAP = 5 * 1024 * 1024;

  function formatBytes(n: number): string {
    return n > 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;
  }

  async function onRecompress() {
    const target = pendingSave;
    if (!target) return;
    recompressing = true;
    try {
      let next = target;
      for (const w of next.workspaces) {
        if (!w.background.dataUrl) continue;
        const compressed = await browserCodec.compressImage(w.background.dataUrl);
        next = setBackground(next, w.id, { dataUrl: compressed, alpha: w.background.alpha });
      }
      try {
        saveState(localStorage, next);
        doc = next;
        pendingSave = null;
        storageError = null;
      } catch (err) {
        pendingSave = next;
        storageError = err instanceof Error ? err.message : "Could not save your changes.";
      }
    } catch (err) {
      storageError = err instanceof Error ? err.message : "Could not re-compress the background image.";
    } finally {
      recompressing = false;
    }
  }

  function engineUrl(engine: SearchEngine, query: string): string {
    const q = encodeURIComponent(query);
    if (engine === "ddg") return `https://duckduckgo.com/?q=${q}`;
    if (engine === "bing") return `https://www.bing.com/search?q=${q}`;
    return `https://www.google.com/search?q=${q}`;
  }

  /** `detail` second line: drop the protocol and any trailing slash for display (#33). */
  function bareUrl(url: string): string {
    return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  function remoteFaviconUrl(domain: string, source: FaviconSource): string | null {
    if (source === "google-s2") {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
    }
    if (source === "duckduckgo") {
      return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
    }
    return null;
  }

  function linkCount(ws: Workspace): number {
    return ws.columns.reduce((n, c) => n + c.blocks.reduce((m, b) => m + b.links.length, 0), 0);
  }

  /** Tasks not in the last kanban column (by convention "Done"). */
  function openTaskCount(ws: Workspace): number {
    return ws.kanban.columns.slice(0, -1).reduce((n, c) => n + c.tasks.length, 0);
  }

  function dueOrOverdueCount(ws: Workspace): number {
    const today = todayISO();
    return ws.kanban.columns
      .slice(0, -1)
      .reduce((n, c) => n + c.tasks.filter((t) => t.due !== null && t.due <= today).length, 0);
  }

  // ---------- search, suggestions & quick actions ----------

  type Result = {
    group: "Web" | "Links" | "Actions";
    label: string;
    sub?: string;
    icon?: string;
    link?: Link;
    kbd?: string;
    run: () => void;
  };

  function openUrl(url: string) {
    window.open(url, "_blank", "noreferrer");
  }

  function results(query: string, withActions: boolean): Result[] {
    const q = query.trim().toLowerCase();
    const out: Result[] = [];
    if (q) {
      const raw = query.trim();
      out.push({
        group: "Web",
        icon: "globe",
        label: `Search ${ENGINE_LABEL[doc.settings.searchEngine]} for “${raw}”`,
        run: () => openUrl(engineUrl(doc.settings.searchEngine, raw)),
      });
    }
    const links: Result[] = [];
    for (const w of doc.workspaces) {
      for (const c of w.columns) {
        for (const b of c.blocks) {
          for (const l of b.links) {
            if (!q || `${l.title} ${l.url}`.toLowerCase().includes(q)) {
              links.push({ group: "Links", link: l, label: l.title, sub: `${w.icon} ${b.title}`, run: () => openUrl(l.url) });
            }
          }
        }
      }
    }
    out.push(...links.slice(0, q ? 6 : 4));
    if (withActions) {
      const actions: Result[] = [
        ...doc.workspaces.map((w, i) => ({
          group: "Actions" as const,
          icon: "chevR",
          label: `Go to ${w.icon} ${w.name}`,
          kbd: i < 9 ? `Alt ${i + 1}` : undefined,
          run: () => selectWorkspace(w.id),
        })),
        { group: "Actions", icon: "grid", label: "Show links", run: () => setView("links") },
        { group: "Actions", icon: "board", label: "Show kanban", run: () => setView("kanban") },
        { group: "Actions", icon: "plus", label: "New workspace", run: createWorkspace },
        { group: "Actions", icon: "pencil", label: "Edit this workspace", run: () => (sheet = "workspace") },
        { group: "Actions", icon: "moon", label: "Switch theme", run: cycleTheme },
        { group: "Actions", icon: "sliders", label: "Open settings", run: () => (sheet = "settings") },
        { group: "Actions", icon: "download", label: "Export backup", run: onExport },
        { group: "Actions", icon: "folder", label: "Import browser bookmarks", run: onImportBookmarks },
      ];
      out.push(...actions.filter((a) => !q || a.label.toLowerCase().includes(q)));
    }
    return out;
  }

  const suggestions = $derived(searchQuery.trim() ? results(searchQuery, false) : []);
  const paletteResults = $derived(paletteOpen ? results(paletteQuery, true) : []);

  function onSearch(e: SubmitEvent) {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    const pick = suggestions[searchSel];
    (pick ?? { run: () => openUrl(engineUrl(doc.settings.searchEngine, query)) }).run();
    searchQuery = "";
    searchSel = 0;
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      searchSel = (searchSel + step + suggestions.length) % suggestions.length;
    } else if (e.key === "Escape") {
      searchQuery = "";
      searchInput?.blur();
    }
  }

  function runSuggestion(r: Result) {
    r.run();
    searchQuery = "";
    searchSel = 0;
  }

  function openPalette() {
    paletteOpen = true;
    paletteQuery = "";
    paletteSel = 0;
  }

  function closePalette() {
    paletteOpen = false;
  }

  function runPaletteResult(r: Result | undefined) {
    paletteOpen = false;
    r?.run();
  }

  function onPaletteKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(1, paletteResults.length);
      paletteSel = (paletteSel + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
    } else if (e.key === "Enter") {
      e.preventDefault();
      runPaletteResult(paletteResults[paletteSel]);
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (paletteOpen) closePalette();
      else openPalette();
      return;
    }
    if (e.key === "Escape") {
      if (paletteOpen) closePalette();
      else if (confirmDialog) confirmDialog = null;
      else if (bookmarksTree) closeBookmarksPicker();
      else if (linkSettingsLinkId !== null) closeLinkSettings();
      else if (settingsBlockId !== null) closeBlockSettings();
      else if (sheet) sheet = null;
      else if (adding) adding = null;
      else if (expandedTaskId) expandedTaskId = expandedColumnId = null;
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = target?.closest("input, textarea, select, [contenteditable]");
    const modalOpen = paletteOpen || sheet || confirmDialog || bookmarksTree || settingsBlockId || linkSettingsLinkId;
    if (typing || modalOpen) return;
    if (e.key === "/") {
      e.preventDefault();
      searchInput?.focus();
    } else if (e.altKey && /^Digit[1-9]$/.test(e.code)) {
      const ws = doc.workspaces[Number(e.code.slice(5)) - 1];
      if (ws) {
        e.preventDefault();
        selectWorkspace(ws.id);
      }
    }
  }

  // ---------- favicons & backgrounds ----------

  function onPickIcon(wsId: string, columnId: string, blockId: string, linkId: string) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        try {
          const favicon = await browserCodec.normalizeFavicon(dataUrl);
          commit(setFavicon(doc, wsId, columnId, blockId, linkId, favicon));
        } catch {
          showToast("That image can't be used as an icon (max 8 KB after scaling).");
        }
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function onUploadBackground() {
    const wsId = active?.id;
    if (!wsId) return;
    const alpha = active.background.alpha;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl) return;
        try {
          const compressed = await browserCodec.compressImage(dataUrl);
          commit(setBackground(doc, wsId, { dataUrl: compressed, alpha }));
          showToast(`Background set (${formatBytes(compressed.length)})`);
        } catch (err) {
          const limit = Math.round(MAX_BACKGROUND_BASE64 / 1024);
          const message =
            err instanceof Error && err.message.includes("too large")
              ? err.message
              : `That image couldn't be used as a background (max ${limit} KB after compression).`;
          showToast(message);
        }
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function onBackgroundAlpha(e: Event) {
    const wsId = active?.id;
    if (!wsId) return;
    const alpha = Number((e.currentTarget as HTMLInputElement).value);
    commit(setBackgroundAlpha(doc, wsId, alpha));
  }

  function onRemoveBackground() {
    const wsId = active?.id;
    if (!wsId) return;
    commitWithUndo(removeBackground(doc, wsId), "Background removed");
  }

  // ---------- layout settings ----------

  function setColumnCount(columnCount: number) {
    const wsId = active?.id;
    if (!wsId) return;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, columnCount: Math.max(0, Math.min(8, columnCount)) }));
  }

  function onColumnGapChange(e: Event) {
    const wsId = active?.id;
    if (!wsId) return;
    const raw = Number((e.currentTarget as HTMLInputElement).value);
    const columnGap = Number.isFinite(raw)
      ? Math.max(0, Math.round(raw))
      : DEFAULT_WORKSPACE_LAYOUT.columnGap;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, columnGap }));
  }

  function toggleFluid() {
    const wsId = active?.id;
    if (!wsId) return;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, fluid: !workspaceLayout.fluid }));
  }

  function onBlockTitleSize(size: BlockTitleSize) {
    const wsId = active?.id;
    if (!wsId) return;
    commit(updateBlockTitleSize(doc, wsId, size));
  }

  function onOpenWorkspace(mode: (typeof OPEN_WORKSPACE_OPTIONS)[number]) {
    commit(setOpenWorkspace(doc, mode));
  }

  function selectWorkspace(id: string) {
    activeId = id;
    adding = null;
    renaming = null;
    expandedTaskId = expandedColumnId = null;
    commit(setLastWorkspaceId(doc, id));
  }

  function setView(next: "links" | "kanban") {
    view = next;
    adding = null;
  }

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(doc.settings.theme);
    commit(setTheme(doc, THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]));
  }

  // ---------- export / import ----------

  function onExport() {
    const json = exportState(doc);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stargate-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        if (!text) return;
        let imported: StargateState;
        try {
          imported = importState(text);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Could not import this file.");
          return;
        }
        confirmDialog = {
          title: "Replace all your data?",
          text: `This file has ${imported.workspaces.length} ${imported.workspaces.length === 1 ? "workspace" : "workspaces"}. They will replace everything you have now. Export a backup first if you might want it back.`,
          ok: "Replace",
          run: () => {
            sheet = null;
            activeId = resolveActiveWorkspace(imported)?.id ?? "";
            commit(imported);
            showToast("Data restored from file");
          },
        };
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function onImportBookmarks() {
    bookmarksInput?.click();
  }

  function onBookmarksFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file after a cancel
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast("Could not read this file.");
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      let tree: BookmarksTree;
      try {
        tree = parseBookmarksHtml(text);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Could not read this bookmarks file.");
        return;
      }
      if (tree.entries.length === 0) {
        showToast("No bookmarks found in this file.");
        return;
      }
      sheet = null;
      bookmarksTree = tree;
      bookmarksExcluded = [];
      bookmarksIncludeRootLinks = false;
      bookmarksIncludeUngroupedBlock = true;
    };
    reader.readAsText(file);
  }

  function closeBookmarksPicker() {
    bookmarksTree = null;
    bookmarksExcluded = [];
    bookmarksIncludeRootLinks = false;
    bookmarksIncludeUngroupedBlock = true;
  }

  function toggleBookmarksFolder(path: string[]) {
    const key = folderPathKey(path);
    bookmarksExcluded = bookmarksExcluded.includes(key)
      ? bookmarksExcluded.filter((k) => k !== key)
      : [...bookmarksExcluded, key];
  }

  /** True when an ancestor is excluded, so this folder's subtree is pruned regardless of its own box. */
  function bookmarksFolderPruned(path: string[]): boolean {
    for (let i = 1; i < path.length; i++) {
      if (bookmarksExcluded.includes(folderPathKey(path.slice(0, i)))) return true;
    }
    return false;
  }

  function bookmarksFolderChecked(path: string[]): boolean {
    return !bookmarksExcluded.includes(folderPathKey(path)) && !bookmarksFolderPruned(path);
  }

  function confirmBookmarksImport() {
    const tree = bookmarksTree;
    if (!tree) return;
    const includeRootLinks = bookmarksIncludeRootLinks && bookmarksHasRootLinks;
    if (!bookmarksCanConfirm) return;
    const known = new Set(doc.workspaces.map((w) => w.id));
    const next = importBookmarksFromTree(doc, tree, {
      excludedFolders: bookmarksExcluded,
      includeRootLinks,
      includeUngroupedBlock: bookmarksIncludeUngroupedBlock,
    });
    const created = next.workspaces.filter((w) => !known.has(w.id));
    closeBookmarksPicker();
    if (created.length === 0) {
      showToast("Nothing to import in the selected folders.");
      return;
    }
    commit(next);
    activeId = created[0].id;
    view = "links";
    showToast(`Added ${created.length} ${created.length === 1 ? "workspace" : "workspaces"} from your bookmarks`);
  }

  function bookmarksFolderSummary(row: BookmarkFolderRow): string {
    return `${row.links} ${row.links === 1 ? "link" : "links"} · ${row.subfolders} ${
      row.subfolders === 1 ? "folder" : "folders"
    }`;
  }

  // ---------- workspaces ----------

  function createWorkspace() {
    const n = doc.workspaces.length;
    const next = addWorkspace(doc, {
      name: "New workspace",
      icon: WORKSPACE_ICONS[n % WORKSPACE_ICONS.length],
      color: WORKSPACE_COLORS[n % WORKSPACE_COLORS.length],
    });
    activeId = next.workspaces[next.workspaces.length - 1].id;
    view = "links";
    commit(next);
    sheet = "workspace";
  }

  function onWorkspaceName(e: Event) {
    if (!active) return;
    const name = (e.currentTarget as HTMLInputElement).value.trim();
    if (!name || name === active.name) return;
    commit(renameWorkspace(doc, active.id, name));
  }

  function onWorkspaceAppearance(patch: { icon?: string; color?: string }) {
    if (!active) return;
    commit(updateWorkspace(doc, active.id, patch));
  }

  function onDeleteWorkspace(ws: Workspace) {
    if (doc.workspaces.length <= 1) return;
    const next = deleteWorkspace(doc, ws.id);
    if (next === doc) return;
    sheet = null;
    if (activeId === ws.id) activeId = next.workspaces[0]?.id ?? "";
    commitWithUndo(next, `Deleted workspace “${ws.name}”`);
  }

  // ---------- inline add & rename ----------

  function startAdding(kind: AddingKind, id: string) {
    renaming = null;
    adding = { kind, id };
  }

  function isAdding(kind: AddingKind, id: string): boolean {
    return adding?.kind === kind && adding.id === id;
  }

  /** Close an empty inline form when focus leaves it (but not when moving to its own submit button). */
  function onAddBlur(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const form = input.form;
    if (input.value.trim() || (e.relatedTarget && form?.contains(e.relatedTarget as Node))) return;
    const current = adding;
    setTimeout(() => {
      if (adding === current) adding = null;
    }, 0);
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      adding = null;
    }
  }

  function addColumnForm(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addColumn(doc, active.id, title));
    adding = null;
  }

  function addBlockForm(e: SubmitEvent, column: Column) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addBlock(doc, active.id, column.id, title));
    if (input) input.value = "";
  }

  function addLinkForm(e: SubmitEvent, column: Column, block: Block) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const value = input?.value.trim();
    if (!value || !active) return;
    commit(addLink(doc, active.id, column.id, block.id, value));
    if (input) input.value = "";
  }

  function startRename(kind: "column" | "kanbanColumn", id: string, title: string) {
    adding = null;
    renaming = { kind, id };
    renameDraft = title;
  }

  function commitRename() {
    const target = renaming;
    renaming = null;
    const title = renameDraft.trim();
    if (!target || !title || !active) return;
    if (target.kind === "column") commit(renameColumn(doc, active.id, target.id, title));
    else commit(renameKanbanColumn(doc, active.id, target.id, title));
  }

  function onRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      renaming = null;
    }
  }

  // ---------- columns, blocks, links ----------

  function onDeleteColumn(column: Column) {
    if (!active) return;
    commitWithUndo(deleteColumn(doc, active.id, column.id), `Deleted column “${column.title}”`);
  }

  function onDeleteBlock(column: Column, block: Block) {
    if (!active) return;
    commitWithUndo(deleteBlock(doc, active.id, column.id, block.id), `Deleted block “${block.title}”`);
  }

  function onToggleCollapse(column: Column, block: Block) {
    if (!active) return;
    const collapsed = block.collapsed ?? false;
    commit(updateBlockSettings(doc, active.id, column.id, block.id, { collapsed: !collapsed }));
  }

  function openBlockSettings(column: Column, block: Block) {
    settingsColumnId = column.id;
    settingsBlockId = block.id;
    settingsTitle = block.title;
    settingsDescription = block.description ?? "";
    settingsFaviconSize = block.faviconSize ?? "sm";
    settingsLinkStyle = linkStyleOf(block);
  }

  function closeBlockSettings() {
    settingsColumnId = null;
    settingsBlockId = null;
  }

  function saveBlockSettings() {
    if (!active || settingsColumnId === null || settingsBlockId === null) return;
    const column = active.columns.find((c) => c.id === settingsColumnId);
    const block = column?.blocks.find((b) => b.id === settingsBlockId);
    const title = settingsTitle.trim() || block?.title || "Untitled block";
    let next = renameBlock(doc, active.id, settingsColumnId, settingsBlockId, title);
    next = updateBlockSettings(next, active.id, settingsColumnId, settingsBlockId, {
      description: settingsDescription.trim(),
      faviconSize: settingsFaviconSize,
      linkStyle: settingsLinkStyle,
    });
    commit(next);
    closeBlockSettings();
  }

  function onBlockSettingsKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveBlockSettings();
    }
  }

  function openLinkSettings(column: Column, block: Block, link: Link) {
    linkSettingsColumnId = column.id;
    linkSettingsBlockId = block.id;
    linkSettingsLinkId = link.id;
    linkSettingsTitle = link.title;
    linkSettingsUrl = link.url;
  }

  function closeLinkSettings() {
    linkSettingsColumnId = null;
    linkSettingsBlockId = null;
    linkSettingsLinkId = null;
  }

  function currentLinkSettings(): Link | null {
    if (
      !active ||
      linkSettingsColumnId === null ||
      linkSettingsBlockId === null ||
      linkSettingsLinkId === null
    ) {
      return null;
    }
    const column = active.columns.find((c) => c.id === linkSettingsColumnId);
    const block = column?.blocks.find((b) => b.id === linkSettingsBlockId);
    return block?.links.find((l) => l.id === linkSettingsLinkId) ?? null;
  }

  function pickLinkFavicon() {
    if (
      !active ||
      linkSettingsColumnId === null ||
      linkSettingsBlockId === null ||
      linkSettingsLinkId === null
    ) {
      return;
    }
    onPickIcon(active.id, linkSettingsColumnId, linkSettingsBlockId, linkSettingsLinkId);
  }

  function removeLinkFavicon() {
    if (
      !active ||
      linkSettingsColumnId === null ||
      linkSettingsBlockId === null ||
      linkSettingsLinkId === null
    ) {
      return;
    }
    commit(removeFavicon(doc, active.id, linkSettingsColumnId, linkSettingsBlockId, linkSettingsLinkId));
  }

  function onLinkSettingsKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveLinkSettings();
    }
  }

  function saveLinkSettings() {
    if (
      !active ||
      linkSettingsColumnId === null ||
      linkSettingsBlockId === null ||
      linkSettingsLinkId === null
    ) {
      return;
    }
    const link = currentLinkSettings();
    if (!link) {
      closeLinkSettings();
      return;
    }
    const title = linkSettingsTitle.trim() || link.title;
    const url = linkSettingsUrl.trim() || link.url;
    let next = doc;
    if (title !== link.title) {
      next = renameLink(next, active.id, linkSettingsColumnId, linkSettingsBlockId, linkSettingsLinkId, title);
    }
    if (url !== link.url) {
      next = setLinkUrl(next, active.id, linkSettingsColumnId, linkSettingsBlockId, linkSettingsLinkId, url);
    }
    if (next !== doc) commit(next);
    closeLinkSettings();
  }

  function onDeleteLink(columnId: string, blockId: string, link: Link) {
    if (!active) return;
    if (linkSettingsLinkId === link.id) closeLinkSettings();
    commitWithUndo(deleteLink(doc, active.id, columnId, blockId, link.id), `Deleted “${link.title}”`);
  }

  // ---------- kanban ----------

  function todayISO(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function dueStatus(due: string | null): "overdue" | "today" | "upcoming" | null {
    if (!due) return null;
    const today = todayISO();
    if (due < today) return "overdue";
    if (due === today) return "today";
    return "upcoming";
  }

  function dueLabel(due: string): string {
    const status = dueStatus(due);
    const date = new Date(`${due}T00:00:00`).toLocaleDateString("en", { month: "short", day: "numeric" });
    if (status === "today") return "Today";
    if (status === "overdue") return `Overdue · ${date}`;
    return date;
  }

  function onAddKanbanColumn(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addKanbanColumn(doc, active.id, title));
    adding = null;
  }

  function onAddTask(e: SubmitEvent, column: KanbanColumn) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addTask(doc, active.id, column.id, title));
    if (input) input.value = "";
  }

  function onDeleteKanbanColumn(column: KanbanColumn) {
    if (!active) return;
    if (active.kanban.columns.length <= 1) return;
    commitWithUndo(deleteKanbanColumn(doc, active.id, column.id), `Deleted column “${column.title}”`);
  }

  function beginEditTitle(column: KanbanColumn, task: Task) {
    editingColumnId = column.id;
    editingTaskId = task.id;
    titleDraft = task.title;
  }

  function commitTitle() {
    if (!active || editingTaskId === null || editingColumnId === null) return;
    const columnId = editingColumnId;
    const taskId = editingTaskId;
    const title = titleDraft.trim();
    editingTaskId = null;
    editingColumnId = null;
    if (!title) return;
    commit(updateTask(doc, active.id, columnId, taskId, { title }));
  }

  function cancelTitle() {
    editingTaskId = null;
    editingColumnId = null;
  }

  function onTitleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      cancelTitle();
    }
  }

  function toggleEditor(column: KanbanColumn, task: Task) {
    if (expandedTaskId === task.id && expandedColumnId === column.id) {
      expandedTaskId = null;
      expandedColumnId = null;
    } else {
      expandedTaskId = task.id;
      expandedColumnId = column.id;
      notesDraft = task.notes;
      dueDraft = task.due ?? "";
    }
  }

  function currentExpandedTask(): Task | null {
    if (!active || expandedTaskId === null || expandedColumnId === null) return null;
    const column = active.kanban.columns.find((c) => c.id === expandedColumnId);
    return column?.tasks.find((t) => t.id === expandedTaskId) ?? null;
  }

  function commitNotes() {
    if (!active || expandedTaskId === null || expandedColumnId === null) return;
    const task = currentExpandedTask();
    if (!task || task.notes === notesDraft) return;
    commit(updateTask(doc, active.id, expandedColumnId, expandedTaskId, { notes: notesDraft }));
  }

  function onDueChange() {
    if (!active || expandedTaskId === null || expandedColumnId === null) return;
    const task = currentExpandedTask();
    const due = dueDraft || null;
    if (!task || task.due === due) return;
    commit(updateTask(doc, active.id, expandedColumnId, expandedTaskId, { due }));
  }

  function clearDue() {
    dueDraft = "";
    onDueChange();
  }

  function onDeleteTask(column: KanbanColumn, task: Task) {
    if (!active) return;
    if (expandedTaskId === task.id && expandedColumnId === column.id) {
      expandedTaskId = null;
      expandedColumnId = null;
    }
    if (editingTaskId === task.id && editingColumnId === column.id) {
      editingTaskId = null;
      editingColumnId = null;
    }
    commitWithUndo(deleteTask(doc, active.id, column.id, task.id), `Deleted task “${task.title}”`);
  }

  // ---------- drag & drop ----------

  function startDrag(e: DragEvent, payload: DragPayload) {
    drag = payload;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", payload.kind);
    }
  }

  function endDrag() {
    drag = null;
    dropTarget = null;
  }

  function markDrop(key: string) {
    if (dropTarget !== key) dropTarget = key;
  }

  function workspaceDragOver(e: DragEvent, wsId: string) {
    if (!drag || drag.kind !== "workspace") return;
    e.preventDefault();
    e.stopPropagation();
    markDrop(`ws:${wsId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnWorkspace(e: DragEvent, workspaceIndex: number) {
    if (!drag || drag.kind !== "workspace") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    commit(moveWorkspace(doc, payload.workspaceId, workspaceIndex));
  }

  function columnDragOver(e: DragEvent, columnId: string) {
    if (!drag) return;
    if (drag.kind !== "column" && drag.kind !== "block") return;
    e.preventDefault();
    markDrop(`col:${columnId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function blockDragOver(e: DragEvent, blockId: string) {
    if (!drag) return;
    if (drag.kind !== "block" && drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    markDrop(`blk:${blockId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function linkDragOver(e: DragEvent, linkId: string) {
    if (!drag || drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    markDrop(`lnk:${linkId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnColumn(e: DragEvent, column: Column, columnIndex: number) {
    if (!active || !drag) return;
    if (drag.kind !== "column" && drag.kind !== "block") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    if (payload.kind === "column") {
      commit(reorderColumn(doc, active.id, payload.columnId, columnIndex));
    } else {
      commit(moveBlock(doc, active.id, payload.columnId, column.id, payload.blockId, column.blocks.length));
    }
  }

  function dropOnBlock(e: DragEvent, column: Column, blockIndex: number, block: Block) {
    if (!active || !drag) return;
    if (drag.kind !== "block" && drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    if (payload.kind === "block") {
      commit(moveBlock(doc, active.id, payload.columnId, column.id, payload.blockId, blockIndex));
    } else {
      commit(moveLink(doc, active.id, payload.columnId, column.id, payload.blockId, block.id, payload.linkId, block.links.length));
    }
  }

  function dropOnLink(e: DragEvent, column: Column, block: Block, linkIndex: number) {
    if (!active || !drag || drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    commit(moveLink(doc, active.id, payload.columnId, column.id, payload.blockId, block.id, payload.linkId, linkIndex));
  }

  function kanbanColumnDragOver(e: DragEvent, columnId: string) {
    if (!drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    markDrop(`kcol:${columnId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function kanbanTaskDragOver(e: DragEvent, taskId: string) {
    if (!drag || drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    markDrop(`task:${taskId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnKanbanColumn(e: DragEvent, column: KanbanColumn, columnIndex: number) {
    if (!active || !drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    if (payload.kind === "kanbanColumn") {
      commit(reorderKanbanColumn(doc, active.id, payload.columnId, columnIndex));
    } else {
      commit(moveTask(doc, active.id, payload.columnId, column.id, payload.taskId, column.tasks.length));
    }
  }

  function dropOnKanbanTask(e: DragEvent, column: KanbanColumn, taskIndex: number) {
    if (!active || !drag || drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    commit(moveTask(doc, active.id, payload.columnId, column.id, payload.taskId, taskIndex));
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet favicon(link: Link, px: number)}
  {@const tile = letterTile(domainOf(link.url))}
  {@const stored = link.favicon?.dataUrl}
  {@const remote = remoteFaviconUrl(domainOf(link.url), doc.settings.faviconSource)}
  <span
    class="favicon"
    style:background={stored ? undefined : `hsl(${tile.hue} 40% 46%)`}
    style:--favicon-size={`${px}px`}
  >
    {#if stored}
      <img class="favicon-img" src={stored} alt="" width={px} height={px} draggable={false} />
    {:else}
      <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
      {#if remote}
        <img
          class="favicon-img"
          loading="lazy"
          src={remote}
          alt=""
          width={px}
          height={px}
          draggable={false}
          onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      {/if}
    {/if}
  </span>
{/snippet}

{#snippet resultRow(r: Result, selected: boolean, onpick: () => void)}
  <button type="button" class="result" class:sel={selected} onmousedown={(e) => e.preventDefault()} onclick={onpick}>
    {#if r.link}
      {@render favicon(r.link, 22)}
    {:else}
      <span class="result-icon">{@html icon(r.icon ?? "chevR")}</span>
    {/if}
    <span class="result-label">{r.label}</span>
    {#if r.sub}<span class="result-sub">{r.sub}</span>{/if}
    {#if r.kbd}<kbd>{r.kbd}</kbd>{/if}
  </button>
{/snippet}

{#snippet resultList(list: Result[], selected: number, onpick: (r: Result) => void)}
  {#each list as r, i (i)}
    {#if i === 0 || list[i - 1].group !== r.group}
      <div class="result-group">{r.group}</div>
    {/if}
    {@render resultRow(r, i === selected, () => onpick(r))}
  {:else}
    <div class="result-group">No matches</div>
  {/each}
{/snippet}

{#if active?.background.dataUrl}
  <div
    class="bg-layer"
    style:background-image={`url(${active.background.dataUrl})`}
    style:opacity={active.background.alpha / 100}
    aria-hidden="true"
  ></div>
{/if}

<div class="page">
  <div class="topline">
    <span class="brand"><span class="brand-mark">{@html icon("star")}</span>Stargate</span>
    <span class="today">{todayLabel}</span>
  </div>

  {#if active}
    <header class="hero">
      <h1><span class="hero-icon">{active.icon}</span>{active.name}</h1>
      <form class="search" role="search" onsubmit={onSearch}>
        {@html icon("search")}
        <input
          bind:this={searchInput}
          bind:value={searchQuery}
          oninput={() => (searchSel = 0)}
          onkeydown={onSearchKeydown}
          onfocus={() => (searchFocused = true)}
          onblur={() => (searchFocused = false)}
          placeholder="Search the web or your links"
          aria-label="Search"
          autocomplete="off"
        />
        <select
          aria-label="Search engine"
          value={doc.settings.searchEngine}
          onchange={(e) => commit(setSearchEngine(doc, (e.currentTarget as HTMLSelectElement).value as SearchEngine))}
        >
          <option value="google">Google</option>
          <option value="ddg">DuckDuckGo</option>
          <option value="bing">Bing</option>
        </select>
        {#if searchFocused && suggestions.length > 0}
          <div class="suggestions">
            {@render resultList(suggestions, searchSel, runSuggestion)}
          </div>
        {/if}
      </form>
      <div class="hero-meta">
        <span>{@html icon("link")} {linkCount(active)} links</span>
        <span>{@html icon("board")} {openTaskCount(active)} open tasks</span>
        {#if dueOrOverdueCount(active) > 0}
          <button class="due-alert" onclick={() => setView("kanban")}>
            {@html icon("cal")} {dueOrOverdueCount(active)} due or overdue
          </button>
        {/if}
        <span class="hint-keys"><kbd>/</kbd> search · <kbd>{MOD_KEY} K</kbd> quick actions</span>
      </div>
    </header>
  {/if}

  {#if storageError || recovered}
    <div class="notices">
      {#if storageError}
        <div class="notice error" role="alert">
          {@html icon("alert")}
          <span class="notice-msg">{storageError}</span>
          {#if canRecompress}
            <button class="btn sm" onclick={onRecompress} disabled={recompressing}>
              {recompressing ? "Re-compressing…" : "Re-compress backgrounds"}
            </button>
          {/if}
          <button class="btn sm" onclick={onExport}>{@html icon("download")} Export</button>
          <button class="icon-btn" aria-label="Dismiss" onclick={() => (storageError = null)}>{@html icon("x")}</button>
        </div>
      {/if}
      {#if recovered}
        <div class="notice info" role="status">
          {@html icon("undo")}
          <span class="notice-msg">Your data was recovered from a backup. Re-add any background images.</span>
          <button class="icon-btn" aria-label="Dismiss" onclick={() => (recovered = false)}>{@html icon("x")}</button>
        </div>
      {/if}
    </div>
  {/if}

  <main>
    {#if active}
      {#if view === "links"}
        <div
          class="cols"
          class:cols-exact={workspaceLayout.columnCount > 0}
          class:cols-fixed={!workspaceLayout.fluid}
          style:--cols-gap={`${workspaceLayout.columnGap}px`}
          style:--cols-count={workspaceLayout.columnCount > 0 ? String(workspaceLayout.columnCount) : undefined}
          style:--block-title-size={`${BLOCK_TITLE_SIZE_PX[blockTitleSize]}px`}
        >
          {#each active.columns as column, columnIndex (column.id)}
            <section
              class="col"
              class:drop-over={dropTarget === `col:${column.id}`}
              role="group"
              aria-label={`${column.title} column`}
              ondragover={(e) => columnDragOver(e, column.id)}
              ondrop={(e) => dropOnColumn(e, column, columnIndex)}
            >
              <header
                class="col-head"
                role="presentation"
                draggable={renaming?.id !== column.id}
                ondragstart={(e) => startDrag(e, { kind: "column", columnId: column.id })}
                ondragend={endDrag}
              >
                {#if renaming?.kind === "column" && renaming.id === column.id}
                  <input
                    class="inline-input"
                    bind:value={renameDraft}
                    onkeydown={onRenameKeydown}
                    onblur={commitRename}
                    aria-label="Column title"
                    use:autofocus={true}
                  />
                {:else}
                  <button
                    class="col-title"
                    title="Click to rename · drag to reorder"
                    onclick={() => startRename("column", column.id, column.title)}
                  >{column.title}</button>
                {/if}
                <div class="hover-tools">
                  <button class="icon-btn danger" title="Delete column" onclick={() => onDeleteColumn(column)}>{@html icon("trash")}</button>
                </div>
              </header>

              {#each column.blocks as block, blockIndex (block.id)}
                {@const linkStyle = linkStyleOf(block)}
                {@const collapsed = block.collapsed ?? false}
                <article
                  class="block"
                  class:block-collapsed={collapsed}
                  class:drop-over={dropTarget === `blk:${block.id}`}
                  ondragover={(e) => blockDragOver(e, block.id)}
                  ondrop={(e) => dropOnBlock(e, column, blockIndex, block)}
                >
                  <header
                    class="block-head"
                    role="presentation"
                    draggable={true}
                    ondragstart={(e) => startDrag(e, { kind: "block", columnId: column.id, blockId: block.id })}
                    ondragend={endDrag}
                  >
                    <button
                      class="icon-btn collapse-toggle"
                      title={collapsed ? "Expand block" : "Collapse block"}
                      aria-expanded={!collapsed}
                      onclick={() => onToggleCollapse(column, block)}
                    >
                      {@html icon(collapsed ? "chevR" : "chevD")}
                    </button>
                    <h3>{block.title}</h3>
                    {#if collapsed}<span class="count">{block.links.length}</span>{/if}
                    <div class="hover-tools">
                      <button class="icon-btn" title="Block settings" onclick={() => openBlockSettings(column, block)}>{@html icon("sliders")}</button>
                      <button class="icon-btn danger" title="Delete block" onclick={() => onDeleteBlock(column, block)}>{@html icon("x")}</button>
                    </div>
                  </header>

                  {#if !collapsed}
                    {#if block.description}
                      <p class="block-description">{block.description}</p>
                    {/if}

                    <div class="links links-{linkStyle}" role="list">
                      {#each block.links as link, linkIndex (link.id)}
                        {@const faviconPx = linkStyle === "tiles" ? TILE_FAVICON_PX : FAVICON_SIZE_PX[block.faviconSize ?? "sm"]}
                        <div
                          class="link link-{linkStyle}"
                          class:drop-over={dropTarget === `lnk:${link.id}`}
                          role="listitem"
                          draggable={true}
                          ondragstart={(e) =>
                            startDrag(e, { kind: "link", columnId: column.id, blockId: block.id, linkId: link.id })}
                          ondragend={endDrag}
                          ondragover={(e) => linkDragOver(e, link.id)}
                          ondrop={(e) => dropOnLink(e, column, block, linkIndex)}
                        >
                          <a href={link.url} target="_blank" rel="noreferrer" draggable={false} title={bareUrl(link.url)}>
                            {@render favicon(link, faviconPx)}
                            {#if linkStyle === "detail"}
                              <span class="txt">
                                <span class="title">{link.title}</span>
                                <span class="url">{bareUrl(link.url)}</span>
                              </span>
                            {:else}
                              <span class="title">{link.title}</span>
                            {/if}
                          </a>
                          <div class="hover-tools">
                            <button class="icon-btn" title="Edit link" onclick={() => openLinkSettings(column, block, link)}>{@html icon("sliders")}</button>
                            <button class="icon-btn danger" title="Delete link" onclick={() => onDeleteLink(column.id, block.id, link)}>{@html icon("x")}</button>
                          </div>
                        </div>
                      {/each}
                    </div>

                    {#if isAdding("link", block.id)}
                      <form class="add-form" onsubmit={(e) => addLinkForm(e, column, block)}>
                        <input
                          class="inline-input"
                          placeholder="Title https://… or just a domain"
                          aria-label="New link"
                          onblur={onAddBlur}
                          onkeydown={onAddKeydown}
                          use:autofocus
                        />
                        <button class="icon-btn" type="submit" title="Add link">{@html icon("plus")}</button>
                      </form>
                    {:else}
                      <button class="ghost-add" onclick={() => startAdding("link", block.id)}>{@html icon("plus")} Add link</button>
                    {/if}
                  {/if}
                </article>
              {/each}

              {#if isAdding("block", column.id)}
                <form class="add-form" onsubmit={(e) => addBlockForm(e, column)}>
                  <input
                    class="inline-input"
                    placeholder="Block title"
                    aria-label="New block"
                    onblur={onAddBlur}
                    onkeydown={onAddKeydown}
                    use:autofocus
                  />
                  <button class="icon-btn" type="submit" title="Add block">{@html icon("plus")}</button>
                </form>
              {:else}
                <button class="ghost-add col-add" onclick={() => startAdding("block", column.id)}>{@html icon("plus")} Add block</button>
              {/if}
            </section>
          {/each}

          {#if isAdding("column", active.id)}
            <div class="add-tile">
              <form class="add-form" onsubmit={addColumnForm}>
                <input
                  class="inline-input"
                  placeholder="Column title"
                  aria-label="New column"
                  onblur={onAddBlur}
                  onkeydown={onAddKeydown}
                  use:autofocus
                />
                <button class="icon-btn" type="submit" title="Add column">{@html icon("plus")}</button>
              </form>
            </div>
          {:else}
            <button class="add-tile" onclick={() => startAdding("column", active.id)}>{@html icon("plus")}<span>New column</span></button>
          {/if}
        </div>
      {:else}
        <div class="kanban-board">
          {#each active.kanban.columns as column, columnIndex (column.id)}
            <section
              class="kanban-col"
              class:drop-over={dropTarget === `kcol:${column.id}`}
              role="group"
              aria-label={`${column.title} column`}
              ondragover={(e) => kanbanColumnDragOver(e, column.id)}
              ondrop={(e) => dropOnKanbanColumn(e, column, columnIndex)}
            >
              <header
                class="kanban-col-head"
                role="presentation"
                draggable={renaming?.id !== column.id}
                ondragstart={(e) => startDrag(e, { kind: "kanbanColumn", columnId: column.id })}
                ondragend={endDrag}
              >
                {#if renaming?.kind === "kanbanColumn" && renaming.id === column.id}
                  <input
                    class="inline-input"
                    bind:value={renameDraft}
                    onkeydown={onRenameKeydown}
                    onblur={commitRename}
                    aria-label="Column title"
                    use:autofocus={true}
                  />
                {:else}
                  <button
                    type="button"
                    class="kanban-col-title"
                    title="Click to rename · drag to reorder"
                    onclick={() => startRename("kanbanColumn", column.id, column.title)}
                  >{column.title}</button>
                {/if}
                <span class="count">{column.tasks.length}</span>
                {#if active.kanban.columns.length > 1}
                  <div class="hover-tools">
                    <button class="icon-btn danger" title="Delete column" onclick={() => onDeleteKanbanColumn(column)}>{@html icon("x")}</button>
                  </div>
                {/if}
              </header>

              <div class="kanban-tasks" role="list">
                {#each column.tasks as task, taskIndex (task.id)}
                  {@const open = expandedTaskId === task.id && expandedColumnId === column.id}
                  {@const editing = editingTaskId === task.id && editingColumnId === column.id}
                  <div
                    class="kanban-task"
                    class:open
                    class:drop-over={dropTarget === `task:${task.id}`}
                    role="listitem"
                    draggable={!open && !editing}
                    ondragstart={(e) => startDrag(e, { kind: "task", columnId: column.id, taskId: task.id })}
                    ondragend={endDrag}
                    ondragover={(e) => kanbanTaskDragOver(e, task.id)}
                    ondrop={(e) => dropOnKanbanTask(e, column, taskIndex)}
                  >
                    <div class="kanban-task-row">
                      {#if editing}
                        <input
                          class="inline-input"
                          bind:value={titleDraft}
                          onkeydown={onTitleKeydown}
                          onblur={commitTitle}
                          aria-label="Task title"
                          use:autofocus
                        />
                      {:else}
                        <button class="task-title" title="Click to edit" onclick={() => beginEditTitle(column, task)}>{task.title}</button>
                      {/if}
                      <button class="icon-btn" title="Notes & due date" onclick={() => toggleEditor(column, task)}>{@html icon("pencil")}</button>
                    </div>

                    {#if !open}
                      <div class="kanban-task-meta">
                        <button class="note-preview" onclick={() => toggleEditor(column, task)}>
                          {#if task.notes.trim()}
                            {task.notes.split("\n")[0]}
                          {:else}
                            <span class="muted">+ note</span>
                          {/if}
                        </button>
                        {#if task.due}
                          {@const due = dueStatus(task.due)}
                          <span class="due-chip" class:overdue={due === "overdue"} class:today={due === "today"}>
                            {@html icon("cal")}{dueLabel(task.due)}
                          </span>
                        {/if}
                      </div>
                    {:else}
                      <div class="kanban-task-editor">
                        <textarea
                          bind:value={notesDraft}
                          onblur={commitNotes}
                          placeholder="Notes…"
                          rows={3}
                          aria-label="Notes"
                          use:autofocus
                        ></textarea>
                        <div class="editor-row">
                          <label class="due-field">
                            {@html icon("cal")}
                            <span>Due</span>
                            <input type="date" bind:value={dueDraft} onchange={onDueChange} />
                          </label>
                          {#if task.due}
                            <button class="btn sm ghost" onclick={clearDue}>Clear</button>
                          {/if}
                        </div>
                        <div class="editor-row">
                          <button class="btn sm danger" onclick={() => onDeleteTask(column, task)}>{@html icon("trash")} Delete task</button>
                          <button class="btn sm push" onclick={() => toggleEditor(column, task)}>Done</button>
                        </div>
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>

              {#if isAdding("task", column.id)}
                <form class="add-form" onsubmit={(e) => onAddTask(e, column)}>
                  <input
                    class="inline-input"
                    placeholder="Task title"
                    aria-label="New task"
                    onblur={onAddBlur}
                    onkeydown={onAddKeydown}
                    use:autofocus
                  />
                  <button class="icon-btn" type="submit" title="Add task">{@html icon("plus")}</button>
                </form>
              {:else}
                <button class="ghost-add" onclick={() => startAdding("task", column.id)}>{@html icon("plus")} Add task</button>
              {/if}
            </section>
          {/each}

          {#if isAdding("kanbanColumn", active.id)}
            <div class="add-tile kanban-add-tile">
              <form class="add-form" onsubmit={onAddKanbanColumn}>
                <input
                  class="inline-input"
                  placeholder="Column title"
                  aria-label="New column"
                  onblur={onAddBlur}
                  onkeydown={onAddKeydown}
                  use:autofocus
                />
                <button class="icon-btn" type="submit" title="Add column">{@html icon("plus")}</button>
              </form>
            </div>
          {:else}
            <button class="add-tile kanban-add-tile" onclick={() => startAdding("kanbanColumn", active.id)}>{@html icon("plus")}<span>New column</span></button>
          {/if}
        </div>
      {/if}
    {/if}
  </main>
</div>

<nav class="dock" aria-label="Workspaces and tools">
  {#each doc.workspaces as ws, wsIndex (ws.id)}
    <button
      class="dock-ws"
      class:active={ws.id === active?.id}
      class:drop-over={dropTarget === `ws:${ws.id}`}
      style:--c={ws.color}
      draggable={true}
      aria-label={ws.name}
      aria-current={ws.id === active?.id ? "page" : undefined}
      onclick={() => selectWorkspace(ws.id)}
      ondblclick={() => {
        selectWorkspace(ws.id);
        sheet = "workspace";
      }}
      ondragstart={(e) => startDrag(e, { kind: "workspace", workspaceId: ws.id })}
      ondragend={endDrag}
      ondragover={(e) => workspaceDragOver(e, ws.id)}
      ondrop={(e) => dropOnWorkspace(e, wsIndex)}
    >
      {ws.icon}
      <span class="dock-tip">{ws.name}{wsIndex < 9 ? ` · Alt ${wsIndex + 1}` : ""}</span>
    </button>
  {/each}
  <button class="dock-ws dock-add" title="New workspace" onclick={createWorkspace}>{@html icon("plus")}</button>
  <span class="dock-sep"></span>
  <button class="dock-btn" class:active={view === "links"} title="Links" aria-pressed={view === "links"} onclick={() => setView("links")}>{@html icon("grid")}</button>
  <button class="dock-btn" class:active={view === "kanban"} title="Kanban" aria-pressed={view === "kanban"} onclick={() => setView("kanban")}>
    {@html icon("board")}
    {#if active && openTaskCount(active) > 0}<span class="dock-badge">{openTaskCount(active)}</span>{/if}
  </button>
  <span class="dock-sep"></span>
  <button class="dock-btn" title="Workspace settings" onclick={() => (sheet = "workspace")}>{@html icon("pencil")}</button>
  <button class="dock-btn" title={`Quick actions (${MOD_KEY} K)`} onclick={openPalette}>{@html icon("command")}</button>
  <button class="dock-btn" title={`Theme: ${THEME_LABEL[doc.settings.theme]}`} onclick={cycleTheme}>{@html icon(THEME_ICON[doc.settings.theme])}</button>
  <button class="dock-btn" title="Settings" onclick={() => (sheet = "settings")}>{@html icon("sliders")}</button>
</nav>

<input type="file" accept=".html,.htm" bind:this={bookmarksInput} onchange={onBookmarksFile} hidden />

{#if sheet === "settings" && active}
  <div class="scrim sheet-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (sheet = null)}>
    <div class="dialog sheet" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
      <div class="dialog-head">
        <h2>Settings</h2>
        <button class="icon-btn" aria-label="Close" onclick={() => (sheet = null)}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <section class="section">
          <div class="section-title">Appearance</div>
          <div class="setting">
            <span>Theme</span>
            <div class="seg">
              {#each THEME_CYCLE as theme (theme)}
                <button type="button" class:sel={doc.settings.theme === theme} onclick={() => commit(setTheme(doc, theme))}>
                  {@html icon(THEME_ICON[theme])}{THEME_LABEL[theme]}
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span>Block titles</span>
            <div class="seg">
              {#each BLOCK_TITLE_SIZE_OPTIONS as size (size)}
                <button type="button" class:sel={blockTitleSize === size} onclick={() => onBlockTitleSize(size)}>
                  {BLOCK_TITLE_SIZE_LABEL[size]}
                </button>
              {/each}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-title">Layout · {active.icon} {active.name}</div>
          <div class="setting">
            <span>Columns</span>
            <div class="stepper">
              <button type="button" aria-label="Fewer columns" onclick={() => setColumnCount(workspaceLayout.columnCount - 1)}>−</button>
              <output>{workspaceLayout.columnCount || "Auto"}</output>
              <button type="button" aria-label="More columns" onclick={() => setColumnCount(workspaceLayout.columnCount + 1)}>+</button>
            </div>
          </div>
          <div class="setting">
            <span>Full width</span>
            <button
              type="button"
              class="switch"
              class:on={workspaceLayout.fluid}
              role="switch"
              aria-checked={workspaceLayout.fluid}
              aria-label="Full width"
              onclick={toggleFluid}
            ></button>
          </div>
          <label class="field">
            <span class="setting-label">Gap between columns</span>
            <span class="range-row">
              <input type="range" min="0" max="48" step="2" value={workspaceLayout.columnGap} oninput={onColumnGapChange} />
              <output>{workspaceLayout.columnGap}px</output>
            </span>
          </label>
        </section>

        <section class="section">
          <div class="section-title">Search</div>
          <div class="setting">
            <span>Default engine</span>
            <div class="seg">
              {#each ENGINE_OPTIONS as engine (engine)}
                <button type="button" class:sel={doc.settings.searchEngine === engine} onclick={() => commit(setSearchEngine(doc, engine))}>
                  {ENGINE_LABEL[engine]}
                </button>
              {/each}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-title">Favicons</div>
          <div class="setting">
            <span>Fetch site icons from</span>
            <div class="seg">
              {#each FAVICON_SOURCE_OPTIONS as source (source)}
                <button type="button" class:sel={doc.settings.faviconSource === source} onclick={() => commit(setFaviconSource(doc, source))}>
                  {FAVICON_SOURCE_LABEL[source]}
                </button>
              {/each}
            </div>
          </div>
          <p class="help-note">Off by default: the provider would see the list of sites you bookmark. Letter tiles always work offline.</p>
        </section>

        <section class="section">
          <div class="section-title">On startup</div>
          <div class="setting">
            <span>Open</span>
            <div class="seg">
              {#each OPEN_WORKSPACE_OPTIONS as mode (mode)}
                <button
                  type="button"
                  class:sel={(doc.settings.openWorkspace ?? DEFAULT_OPEN_WORKSPACE) === mode}
                  onclick={() => onOpenWorkspace(mode)}
                >
                  {OPEN_WORKSPACE_LABEL[mode]}
                </button>
              {/each}
            </div>
          </div>
        </section>

        {#if syncConfigured}
          <section class="section">
            <div class="section-title">Sync</div>
            {#if account}
              <div class="setting">
                <span>Signed in{account.email ? ` as ${account.email}` : ""}</span>
                <button type="button" class="btn sm" onclick={onSignOut}>Sign out</button>
              </div>
              <p class="help-note" title={syncMessage ?? undefined}>
                {SYNC_STATUS_LABEL[syncStatus]} Links, tasks and settings sync between your browsers; background images stay on this device.
              </p>
            {:else}
              <div class="setting">
                <span>Sign in with</span>
                <div class="seg">
                  <button type="button" onclick={() => onSignIn("github")}>GitHub</button>
                  <button type="button" onclick={() => onSignIn("google")}>Google</button>
                </div>
              </div>
              <p class="help-note">
                Optional. Keeps links, tasks and settings in sync between your browsers. Background images stay on this device.
              </p>
            {/if}
          </section>
        {/if}

        <section class="section">
          <div class="section-title">Your data</div>
          <div class="meter" title={`${formatBytes(usage.totalBytes)} of ~5 MB`}>
            <i class="meter-bg" style:width={`${(usage.backgroundBytes / STORAGE_CAP) * 100}%`}></i>
            <i class="meter-cfg" style:width={`${(usage.configBytes / STORAGE_CAP) * 100}%`}></i>
          </div>
          <div class="legend">
            <span><i class="meter-bg"></i>Backgrounds {formatBytes(usage.backgroundBytes)}</span>
            <span><i class="meter-cfg"></i>Links & tasks {formatBytes(usage.configBytes)}</span>
            <span>of ~5 MB browser storage</span>
          </div>
          <div class="data-actions">
            <button class="btn" onclick={onExport}>{@html icon("download")} Export backup</button>
            <button class="btn" onclick={onImport}>{@html icon("upload")} Restore from file</button>
            <button class="btn" onclick={onImportBookmarks}>{@html icon("folder")} Import browser bookmarks</button>
          </div>
          <p class="help-note">
            {#if account}
              Background images live only in this browser; everything else is also synced to your account. Export a backup now and then.
            {:else}
              Everything lives in this browser. In private/incognito windows it is temporary, and it isn't shared between browsers, so export a backup now and then.
            {/if}
          </p>
        </section>
      </div>
    </div>
  </div>
{/if}

{#if sheet === "workspace" && active}
  <div class="scrim sheet-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (sheet = null)}>
    <div class="dialog sheet" role="dialog" aria-modal="true" aria-label="Workspace" tabindex="-1">
      <div class="dialog-head">
        <h2>Workspace</h2>
        <button class="icon-btn" aria-label="Close" onclick={() => (sheet = null)}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <label class="field">
          <span class="setting-label">Name</span>
          {#key active.id}
            <input
              value={active.name}
              onchange={onWorkspaceName}
              onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
              use:autofocus={active.name === "New workspace"}
            />
          {/key}
        </label>
        <div class="field">
          <span class="setting-label">Icon</span>
          <div class="emoji-grid">
            {#each WORKSPACE_ICONS as emoji (emoji)}
              <button type="button" class:sel={active.icon === emoji} onclick={() => onWorkspaceAppearance({ icon: emoji })}>{emoji}</button>
            {/each}
          </div>
        </div>
        <div class="field">
          <span class="setting-label">Colour</span>
          <div class="swatches">
            {#each WORKSPACE_COLORS as color (color)}
              <button
                type="button"
                class="swatch"
                class:sel={active.color === color}
                style:--c={color}
                aria-label={color}
                onclick={() => onWorkspaceAppearance({ color })}
              ></button>
            {/each}
            <input
              type="color"
              value={active.color}
              aria-label="Custom colour"
              onchange={(e) => onWorkspaceAppearance({ color: (e.currentTarget as HTMLInputElement).value })}
            />
          </div>
        </div>
        <div class="field">
          <span class="setting-label">Background</span>
          <div class="bg-preview" style:background-image={active.background.dataUrl ? `url(${active.background.dataUrl})` : undefined}>
            {#if !active.background.dataUrl}No background image{/if}
          </div>
          <div class="editor-row">
            <button class="btn sm" onclick={onUploadBackground}>
              {@html icon("image")} {active.background.dataUrl ? "Replace image" : "Upload image"}
            </button>
            {#if active.background.dataUrl}
              <button class="btn sm danger" onclick={onRemoveBackground}>Remove</button>
            {/if}
          </div>
          <span class="range-row">
            <span class="help-note">Strength</span>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={active.background.alpha}
              oninput={onBackgroundAlpha}
              disabled={!active.background.dataUrl}
              aria-label="Background strength"
            />
            <output>{active.background.alpha}%</output>
          </span>
          <p class="help-note">Images are compressed in your browser to about 500 KB.</p>
        </div>
      </div>
      <div class="dialog-foot">
        {#if doc.workspaces.length > 1}
          <button class="btn danger push-right" onclick={() => onDeleteWorkspace(active)}>{@html icon("trash")} Delete workspace</button>
        {/if}
        <button class="btn primary" onclick={() => (sheet = null)}>Done</button>
      </div>
    </div>
  </div>
{/if}

{#if settingsColumnId !== null && settingsBlockId !== null}
  <div
    class="scrim"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeBlockSettings();
    }}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Block settings" tabindex="-1">
      <div class="dialog-head">
        <h2>Block settings</h2>
        <button class="icon-btn" aria-label="Close" onclick={closeBlockSettings}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <label class="field">
          <span class="setting-label">Title</span>
          <input bind:value={settingsTitle} placeholder="Block title…" onkeydown={onBlockSettingsKeydown} use:autofocus />
        </label>
        <label class="field">
          <span class="setting-label">Description</span>
          <input bind:value={settingsDescription} placeholder="Optional" onkeydown={onBlockSettingsKeydown} />
        </label>
        <fieldset class="field">
          <legend class="setting-label">Link style</legend>
          <div class="seg">
            {#each LINK_STYLE_OPTIONS as style (style)}
              <button type="button" class:sel={settingsLinkStyle === style} onclick={() => (settingsLinkStyle = style)}>
                {LINK_STYLE_LABEL[style]}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset class="field">
          <legend class="setting-label">Favicon size</legend>
          <div class="seg">
            {#each FAVICON_SIZE_OPTIONS as size (size)}
              <button type="button" class:sel={settingsFaviconSize === size} onclick={() => (settingsFaviconSize = size)}>
                {FAVICON_SIZE_LABEL[size]}
              </button>
            {/each}
          </div>
          {#if settingsLinkStyle === "tiles"}<span class="help-note">Tiles always use a large icon.</span>{/if}
        </fieldset>
        <div class="field">
          <span class="setting-label">Preview</span>
          <div class="preview">
            <div class="links links-{settingsLinkStyle}">
              {#each [{ id: "p1", title: "GitHub", url: "https://github.com" }, { id: "p2", title: "Hacker News", url: "https://news.ycombinator.com" }, { id: "p3", title: "Il Post", url: "https://www.ilpost.it" }] as sample (sample.id)}
                <div class="link link-{settingsLinkStyle}">
                  <span class="link-body">
                    {@render favicon(sample, settingsLinkStyle === "tiles" ? TILE_FAVICON_PX : FAVICON_SIZE_PX[settingsFaviconSize])}
                    {#if settingsLinkStyle === "detail"}
                      <span class="txt"><span class="title">{sample.title}</span><span class="url">{bareUrl(sample.url)}</span></span>
                    {:else}
                      <span class="title">{sample.title}</span>
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      </div>
      <div class="dialog-foot">
        <button type="button" class="btn ghost" onclick={closeBlockSettings}>Cancel</button>
        <button type="button" class="btn primary" onclick={saveBlockSettings}>Save</button>
      </div>
    </div>
  </div>
{/if}

{#if linkSettingsColumnId !== null && linkSettingsBlockId !== null && linkSettingsLinkId !== null}
  {@const link = currentLinkSettings()}
  <div
    class="scrim"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeLinkSettings();
    }}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-label="Edit link" tabindex="-1">
      <div class="dialog-head">
        <h2>Edit link</h2>
        <button class="icon-btn" aria-label="Close" onclick={closeLinkSettings}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        {#if link}
          <div class="link-icon-row">
            {@render favicon(link, 40)}
            <span class="link-icon-meta">
              <b>{link.favicon ? "Custom icon" : "Letter tile"}</b>
              <span class="help-note">{link.favicon ? "Stored with your data, works offline." : "Upload a small image to use your own icon."}</span>
            </span>
            <button type="button" class="btn sm" onclick={pickLinkFavicon}>{@html icon("upload")} {link.favicon ? "Change" : "Upload icon"}</button>
            {#if link.favicon}
              <button type="button" class="btn sm danger" onclick={removeLinkFavicon}>Remove</button>
            {/if}
          </div>
        {/if}
        <label class="field">
          <span class="setting-label">Title</span>
          <input bind:value={linkSettingsTitle} placeholder="Title…" onkeydown={onLinkSettingsKeydown} use:autofocus />
        </label>
        <label class="field">
          <span class="setting-label">URL</span>
          <input bind:value={linkSettingsUrl} placeholder="https://…" onkeydown={onLinkSettingsKeydown} />
        </label>
      </div>
      <div class="dialog-foot">
        {#if link && linkSettingsColumnId && linkSettingsBlockId}
          {@const columnId = linkSettingsColumnId}
          {@const blockId = linkSettingsBlockId}
          <button type="button" class="btn danger push-right" onclick={() => onDeleteLink(columnId, blockId, link)}>{@html icon("trash")} Delete</button>
        {/if}
        <button type="button" class="btn ghost" onclick={closeLinkSettings}>Cancel</button>
        <button type="button" class="btn primary" onclick={saveLinkSettings}>Save</button>
      </div>
    </div>
  </div>
{/if}

{#if bookmarksTree}
  <div
    class="scrim"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeBookmarksPicker();
    }}
  >
    <div class="dialog wide" role="dialog" aria-modal="true" aria-label="Import browser bookmarks" tabindex="-1">
      <div class="dialog-head">
        <h2>Import browser bookmarks</h2>
        <button class="icon-btn" aria-label="Close" onclick={closeBookmarksPicker}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <p class="help-note">
          Each top-level folder becomes a new workspace and its subfolders become blocks. Uncheck anything you want to
          leave out. Your current workspaces are not changed.
        </p>
        <div class="bookmarks-picker">
          {#each bookmarksFolders as row (folderPathKey(row.path))}
            {@const pruned = bookmarksFolderPruned(row.path)}
            <label class="bookmarks-option" class:pruned style="padding-left: {8 + row.depth * 20}px">
              <input
                type="checkbox"
                checked={bookmarksFolderChecked(row.path)}
                disabled={pruned}
                onchange={() => toggleBookmarksFolder(row.path)}
              />
              {@html icon("folder")}
              <span class="bookmarks-option-name">{row.name}</span>
              <span class="bookmarks-option-meta">{bookmarksFolderSummary(row)}</span>
            </label>
          {/each}
        </div>
        {#if bookmarksFolders.length > 0}
          <label class="check-row">
            <input type="checkbox" bind:checked={bookmarksIncludeUngroupedBlock} />
            Put a folder's loose links in a “{DEFAULT_UNGROUPED_BLOCK_TITLE}” block
          </label>
        {/if}
        {#if bookmarksHasRootLinks}
          <label class="check-row">
            <input type="checkbox" bind:checked={bookmarksIncludeRootLinks} />
            Import the {bookmarksRootLinkCount} {bookmarksRootLinkCount === 1 ? "link" : "links"} outside any folder as a
            “{DEFAULT_BOOKMARKS_WORKSPACE_TITLE}” workspace
          </label>
        {/if}
      </div>
      <div class="dialog-foot">
        <span class="help-note push-right">
          {bookmarksWorkspaceCount} {bookmarksWorkspaceCount === 1 ? "workspace" : "workspaces"} will be added
        </span>
        <button type="button" class="btn ghost" onclick={closeBookmarksPicker}>Cancel</button>
        <button type="button" class="btn primary" onclick={confirmBookmarksImport} disabled={!bookmarksCanConfirm}>
          Import
        </button>
      </div>
    </div>
  </div>
{/if}

{#if confirmDialog}
  {@const dialog = confirmDialog}
  <div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && (confirmDialog = null)}>
    <div class="dialog" role="alertdialog" aria-modal="true" aria-label={dialog.title} tabindex="-1">
      <div class="dialog-head"><h2>{dialog.title}</h2></div>
      <div class="dialog-body"><p class="dialog-text">{dialog.text}</p></div>
      <div class="dialog-foot">
        <button type="button" class="btn ghost" onclick={() => (confirmDialog = null)}>Cancel</button>
        <button
          type="button"
          class="btn primary"
          onclick={() => {
            confirmDialog = null;
            dialog.run();
          }}
        >{dialog.ok}</button>
      </div>
    </div>
  </div>
{/if}

{#if paletteOpen}
  <div class="scrim palette-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && closePalette()}>
    <div class="palette" role="dialog" aria-modal="true" aria-label="Quick actions">
      <div class="palette-input">
        {@html icon("search")}
        <input
          bind:value={paletteQuery}
          oninput={() => (paletteSel = 0)}
          onkeydown={onPaletteKeydown}
          placeholder="Search links, workspaces, actions or the web"
          aria-label="Quick actions"
          autocomplete="off"
          use:autofocus
        />
        <kbd>esc</kbd>
      </div>
      <div class="palette-list">
        {@render resultList(paletteResults, paletteSel, runPaletteResult)}
      </div>
      <div class="palette-foot">
        <span><kbd>↑</kbd> <kbd>↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
        <span><kbd>/</kbd> focus search</span>
        <span><kbd>Alt</kbd> + <kbd>1</kbd>…<kbd>9</kbd> workspaces</span>
      </div>
    </div>
  </div>
{/if}

<div class="toasts" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast" role="status">
      <span class="toast-msg">{toast.message}</span>
      {#if toast.undo}
        <button onclick={() => undoToast(toast.id)}>{@html icon("undo")} Undo</button>
      {/if}
    </div>
  {/each}
</div>
