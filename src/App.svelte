<script lang="ts">
  /* eslint-disable max-lines -- this file is 2000+ lines of legacy shell
     code; decomposing it into subcomponents is tracked separately in #48,
     rather than attempted as part of this lint-tooling issue (#51). */
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper below, which only interpolates
     a hardcoded ICONS[name] string keyed by literal icon names; there is
     no user-controlled content reaching {@html} here. */
  import {
    addWorkspace,
    deleteWorkspace,
    exportState,
    importState,
    moveWorkspace,
    removeBackground,
    renameWorkspace,
    resolveActiveWorkspace,
    setBackground,
    setBackgroundAlpha,
    setLastWorkspaceId,
    setOpenWorkspace,
    setSearchEngine,
    setTheme,
    updateBlockTitleSize,
    updateWorkspace,
    updateWorkspaceLayout,
    MAX_BACKGROUND_BASE64,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "./store/core";
  import { browserCodec } from "./store/codec";
  import { loadState, meterState, saveState } from "./store/persistence";
  import { SyncEngine, type SyncStatus } from "./store/sync";
  import { signIn, signOut, supabaseRemote, syncConfigured, watchSession, type OAuthProvider } from "./sync/supabase";
  import type {
    BlockTitleSize,
    Link,
    SearchEngine,
    StargateState,
    Theme,
    Workspace,
  } from "./store/types";
  import { autofocus } from "./components/actions";
  import { icon } from "./components/icons";
  import { formatBytes, todayISO } from "./components/format";
  import Favicon from "./components/Favicon.svelte";
  import LinksBoard from "./components/LinksBoard.svelte";
  import KanbanBoard from "./components/KanbanBoard.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import BookmarksImportFlow from "./components/BookmarksImportFlow.svelte";
  import ToastHost from "./components/ToastHost.svelte";
  import type { AddingKind, DragPayload } from "./components/dragTypes";
  import { applySkin, previewSkin } from "./skin";

  const loaded = loadState(localStorage);
  let doc: StargateState = $state(loaded.state);
  let recovered: boolean = $state(loaded.recovered);
  let activeId: string = $state(resolveActiveWorkspace(loaded.state)?.id ?? "");

  const active = $derived(doc.workspaces.find((w) => w.id === activeId) ?? doc.workspaces[0]);

  let drag: DragPayload | null = $state(null);
  let dropTarget: string | null = $state(null);
  let view: "links" | "kanban" = $state("links");
  let sheet: "settings" | "workspace" | null = $state(null);
  let storageError: string | null = $state(null);
  let pendingSave: StargateState | null = $state(null);
  let recompressing: boolean = $state(false);
  let adding: { kind: AddingKind; id: string } | null = $state(null);
  let renaming: { kind: "column" | "kanbanColumn"; id: string } | null = $state(null);
  let renameDraft: string = $state("");
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

  let linksBoardRef: LinksBoard | undefined = $state();
  let kanbanBoardRef: KanbanBoard | undefined = $state();
  let bookmarksImportFlowRef: BookmarksImportFlow | undefined = $state();

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

  const WORKSPACE_ICONS = ["🏠", "💼", "✈️", "📚", "🎵", "🧪", "🛒", "🎮", "🌿", "⭐", "🧭", "🛠️", "🎨", "📰", "💡", "✨"];
  const WORKSPACE_COLORS = ["#5f7161", "#3f6d8c", "#b0683f", "#8a5a9c", "#a8873a", "#4f7f7a", "#9b4b5a", "#59606b"];

  const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || "");
  const MOD_KEY = IS_MAC ? "⌘" : "Ctrl";

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
    applySkin(previewSkin() ?? doc.settings.skin);
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

  /** The server copy replaced local state (another browser changed it, or first sign-in). */
  function applyRemoteState(next: StargateState, previous: StargateState, firstLink: boolean) {
    try {
      saveState(localStorage, next);
    } catch (err) {
      console.error(err);
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
      e.preventDefault();
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
      else if (bookmarksImportFlowRef?.closeOnEscape()) {
        // handled
      } else if (linksBoardRef?.closeOnEscape()) {
        // handled
      } else if (sheet) sheet = null;
      else if (adding) adding = null;
      else if (kanbanBoardRef?.closeOnEscape()) {
        // handled
      }
      return;
    }
    const target = e.target as HTMLElement | null;
    const typing = target?.closest("input, textarea, select, [contenteditable]");
    const modalOpen =
      paletteOpen ||
      sheet ||
      confirmDialog ||
      bookmarksImportFlowRef?.isOpen() ||
      linksBoardRef?.isSettingsOpen();
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

  // ---------- backgrounds ----------

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
    const workspaceLayout = active?.layout ?? DEFAULT_WORKSPACE_LAYOUT;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, columnCount: Math.max(0, Math.min(8, columnCount)) }));
  }

  function onColumnGapChange(e: Event) {
    const wsId = active?.id;
    if (!wsId) return;
    const workspaceLayout = active?.layout ?? DEFAULT_WORKSPACE_LAYOUT;
    const raw = Number((e.currentTarget as HTMLInputElement).value);
    const columnGap = Number.isFinite(raw)
      ? Math.max(0, Math.round(raw))
      : DEFAULT_WORKSPACE_LAYOUT.columnGap;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, columnGap }));
  }

  function toggleFluid() {
    const wsId = active?.id;
    if (!wsId) return;
    const workspaceLayout = active?.layout ?? DEFAULT_WORKSPACE_LAYOUT;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, fluid: !workspaceLayout.fluid }));
  }

  function onBlockTitleSize(size: BlockTitleSize) {
    const wsId = active?.id;
    if (!wsId) return;
    commit(updateBlockTitleSize(doc, wsId, size));
  }

  function onOpenWorkspace(mode: "first" | "last") {
    commit(setOpenWorkspace(doc, mode));
  }

  function selectWorkspace(id: string) {
    activeId = id;
    adding = null;
    renaming = null;
    kanbanBoardRef?.resetEphemeral();
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
    bookmarksImportFlowRef?.open();
  }

  function onBookmarksImported(firstWorkspaceId: string) {
    activeId = firstWorkspaceId;
    view = "links";
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

  // ---------- workspace drag & drop (dock) ----------

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
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet resultRow(r: Result, selected: boolean, onpick: () => void)}
  <button type="button" class="result" class:sel={selected} onmousedown={(e) => e.preventDefault()} onclick={onpick}>
    {#if r.link}
      <Favicon link={r.link} px={22} faviconSource={doc.settings.faviconSource} />
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
          type="search"
          inputmode="search"
          enterkeyhint="search"
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
      <LinksBoard
        bind:this={linksBoardRef}
        {doc}
        {active}
        visible={view === "links"}
        {commit}
        {commitWithUndo}
        {showToast}
        bind:drag
        bind:dropTarget
        bind:adding
        bind:renaming
        bind:renameDraft
      />
      <KanbanBoard
        bind:this={kanbanBoardRef}
        {doc}
        {active}
        visible={view === "kanban"}
        {commit}
        {commitWithUndo}
        bind:drag
        bind:dropTarget
        bind:adding
        bind:renaming
        bind:renameDraft
      />
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

<SettingsPanel
  open={sheet === "settings"}
  onclose={() => (sheet = null)}
  {doc}
  {active}
  {account}
  {syncStatus}
  {syncMessage}
  {usage}
  {commit}
  {onBlockTitleSize}
  {setColumnCount}
  {onColumnGapChange}
  {toggleFluid}
  {onOpenWorkspace}
  {onSignIn}
  {onSignOut}
  {onExport}
  {onImport}
  {onImportBookmarks}
/>

<BookmarksImportFlow
  bind:this={bookmarksImportFlowRef}
  {doc}
  {commit}
  {showToast}
  onImported={onBookmarksImported}
  closeSettings={() => (sheet = null)}
/>

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
          type="search"
          inputmode="search"
          enterkeyhint="go"
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

<ToastHost {toasts} onundo={undoToast} />
