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
    MAX_BACKGROUND_BASE64,
    moveBlock,
    moveLink,
    moveTask,
    removeBackground,
    removeFavicon,
    renameBlock,
    renameColumn,
    renameKanbanColumn,
    renameLink,
    renameWorkspace,
    reorderColumn,
    reorderKanbanColumn,
    setBackground,
    setBackgroundAlpha,
    setFavicon,
    setFaviconSource,
    setLinkUrl,
    setSearchEngine,
    setTheme,
    updateBlockSettings,
    updateBlockTitleSize,
    updateTask,
    updateWorkspace,
    updateWorkspaceLayout,
    DEFAULT_BLOCK_TITLE_SIZE,
    DEFAULT_LINK_STYLE,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "./store/core";
  import { browserCodec } from "./store/codec";
  import { loadState, saveState } from "./store/persistence";
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
  let activeId: string = $state(loaded.state.workspaces[0]?.id ?? "");

  const active = $derived(doc.workspaces.find((w) => w.id === activeId) ?? doc.workspaces[0]);

  const workspaceLayout = $derived(active?.layout ?? DEFAULT_WORKSPACE_LAYOUT);
  const blockTitleSize = $derived(active?.blockTitleSize ?? DEFAULT_BLOCK_TITLE_SIZE);

  type DragPayload =
    | { kind: "column"; columnId: string }
    | { kind: "block"; columnId: string; blockId: string }
    | { kind: "link"; columnId: string; blockId: string; linkId: string }
    | { kind: "kanbanColumn"; columnId: string }
    | { kind: "task"; columnId: string; taskId: string };

  let drag: DragPayload | null = $state(null);
  let settingsOpen: boolean = $state(false);
  let popoverWrap: HTMLDivElement | null = null;
  let view: "links" | "kanban" = $state("links");
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

  $effect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (popoverWrap && !popoverWrap.contains(e.target as Node)) {
        settingsOpen = false;
      }
    };
    const onDocKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        settingsOpen = false;
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onDocKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onDocKey);
    };
  });

  const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
  const THEME_LABEL: Record<Theme, string> = {
    light: "☀️ Light",
    dark: "🌙 Dark",
    system: "🌗 System",
  };

  const FAVICON_SOURCE_OPTIONS: FaviconSource[] = ["off", "google-s2", "duckduckgo"];
  const FAVICON_SOURCE_LABEL: Record<FaviconSource, string> = {
    off: "Off",
    "google-s2": "Google",
    duckduckgo: "DuckDuckGo",
  };

  const FAVICON_SIZE_OPTIONS: FaviconSize[] = ["sm", "md", "lg"];
  const FAVICON_SIZE_LABEL: Record<FaviconSize, string> = {
    sm: "Small · 16px",
    md: "Medium · 24px",
    lg: "Large · 32px",
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

  const BLOCK_TITLE_SIZE_OPTIONS: BlockTitleSize[] = ["sm", "md", "lg"];
  const BLOCK_TITLE_SIZE_LABEL: Record<BlockTitleSize, string> = {
    sm: "Small",
    md: "Medium",
    lg: "Large",
  };
  const BLOCK_TITLE_SIZE_PX: Record<BlockTitleSize, number> = {
    sm: 12,
    md: 13.5,
    lg: 16,
  };

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

  function commit(next: StargateState) {
    try {
      saveState(localStorage, next);
      doc = next;
      pendingSave = null;
      storageError = null;
    } catch (err) {
      pendingSave = next;
      storageError = err instanceof Error ? err.message : "Could not save your changes.";
    }
  }

  function hasBackgroundImage(state: StargateState | null): boolean {
    return state?.workspaces.some((w) => w.background.dataUrl !== null) ?? false;
  }

  const canRecompress = $derived(hasBackgroundImage(pendingSave));

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

  function remoteFaviconUrl(domain: string, source: FaviconSource): string | null {
    if (source === "google-s2") {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
    }
    if (source === "duckduckgo") {
      return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
    }
    return null;
  }

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
          window.alert("That image could not be used as a favicon (max 8 KB after scaling).");
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
          settingsOpen = false;
        } catch (err) {
          const limit = Math.round(MAX_BACKGROUND_BASE64 / 1024);
          const message =
            err instanceof Error && err.message.includes("too large")
              ? err.message
              : `That image could not be used as a background (max ${limit} KB after compression).`;
          window.alert(message);
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
    commit(removeBackground(doc, wsId));
  }

  function onColumnCountChange(e: Event) {
    const wsId = active?.id;
    if (!wsId) return;
    const raw = Number((e.currentTarget as HTMLInputElement).value);
    const columnCount = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, columnCount }));
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

  function onFluidChange(e: Event) {
    const wsId = active?.id;
    if (!wsId) return;
    const fluid = (e.currentTarget as HTMLInputElement).checked;
    commit(updateWorkspaceLayout(doc, wsId, { ...workspaceLayout, fluid }));
  }

  function onBlockTitleSize(size: BlockTitleSize) {
    const wsId = active?.id;
    if (!wsId) return;
    commit(updateBlockTitleSize(doc, wsId, size));
  }

  function onSearch(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const query = input?.value.trim();
    if (!query) return;
    window.open(engineUrl(doc.settings.searchEngine, query), "_blank");
  }

  function onEngineChange(e: Event) {
    const value = (e.currentTarget as HTMLSelectElement).value as SearchEngine;
    commit(setSearchEngine(doc, value));
  }

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(doc.settings.theme);
    commit(setTheme(doc, THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]));
  }

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
          window.alert(err instanceof Error ? err.message : "Could not import this file.");
          return;
        }
        if (!confirm("Replace your current data with this file?")) return;
        activeId = imported.workspaces[0]?.id ?? "";
        commit(imported);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function createWorkspace() {
    const name = prompt("Workspace name")?.trim();
    if (!name) return;
    const icon = (prompt("Icon (emoji)", "✨")?.trim()) || "✨";
    const color = "#5f7161";
    const next = addWorkspace(doc, { name, icon, color });
    activeId = next.workspaces[next.workspaces.length - 1].id;
    commit(next);
  }

  function addColumnForm(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addColumn(doc, active.id, title));
    if (input) input.value = "";
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

  function onRenameWorkspace(ws: Workspace) {
    const name = prompt("Workspace name", ws.name)?.trim();
    if (!name) return;
    commit(renameWorkspace(doc, ws.id, name));
  }

  function onEditWorkspace(ws: Workspace) {
    const icon = (prompt("Workspace icon (emoji)", ws.icon)?.trim()) || ws.icon;
    const color = (prompt("Workspace color (hex)", ws.color)?.trim()) || ws.color;
    commit(updateWorkspace(doc, ws.id, { icon, color }));
  }

  function onDeleteWorkspace(ws: Workspace) {
    if (doc.workspaces.length <= 1) return;
    if (!confirm(`Delete workspace “${ws.name}”?`)) return;
    const next = deleteWorkspace(doc, ws.id);
    if (next === doc) return;
    if (activeId === ws.id) activeId = next.workspaces[0]?.id ?? "";
    commit(next);
  }

  function onRenameColumn(column: Column) {
    if (!active) return;
    const title = prompt("Column name", column.title)?.trim();
    if (!title) return;
    commit(renameColumn(doc, active.id, column.id, title));
  }

  function onDeleteColumn(column: Column) {
    if (!active) return;
    if (!confirm(`Delete column “${column.title}” and all its blocks?`)) return;
    commit(deleteColumn(doc, active.id, column.id));
  }

  function onDeleteBlock(column: Column, block: Block) {
    if (!active) return;
    if (!confirm(`Delete block “${block.title}”?`)) return;
    commit(deleteBlock(doc, active.id, column.id, block.id));
  }

  function openBlockSettings(column: Column, block: Block) {
    settingsColumnId = column.id;
    settingsBlockId = block.id;
    settingsTitle = block.title;
    settingsDescription = block.description ?? "";
    settingsFaviconSize = block.faviconSize ?? "sm";
    settingsLinkStyle = block.linkStyle ?? DEFAULT_LINK_STYLE;
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
    } else if (e.key === "Escape") {
      closeLinkSettings();
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

  function onDeleteLink(column: Column, block: Block, link: Link) {
    if (!active) return;
    if (!confirm(`Delete link “${link.title}”?`)) return;
    commit(deleteLink(doc, active.id, column.id, block.id, link.id));
  }

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

  function onAddKanbanColumn(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addKanbanColumn(doc, active.id, title));
    if (input) input.value = "";
  }

  function onAddTask(e: SubmitEvent, column: KanbanColumn) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addTask(doc, active.id, column.id, title));
    if (input) input.value = "";
  }

  function onRenameKanbanColumn(column: KanbanColumn) {
    if (!active) return;
    const title = prompt("Column name", column.title)?.trim();
    if (!title) return;
    commit(renameKanbanColumn(doc, active.id, column.id, title));
  }

  function onDeleteKanbanColumn(column: KanbanColumn) {
    if (!active) return;
    if (active.kanban.columns.length <= 1) return;
    if (!confirm(`Delete column “${column.title}” and its tasks?`)) return;
    commit(deleteKanbanColumn(doc, active.id, column.id));
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

  function onDeleteTask(column: KanbanColumn, task: Task) {
    if (!active) return;
    if (!confirm(`Delete task “${task.title}”?`)) return;
    if (expandedTaskId === task.id && expandedColumnId === column.id) {
      expandedTaskId = null;
      expandedColumnId = null;
    }
    if (editingTaskId === task.id && editingColumnId === column.id) {
      editingTaskId = null;
      editingColumnId = null;
    }
    commit(deleteTask(doc, active.id, column.id, task.id));
  }

  function startDrag(e: DragEvent, payload: DragPayload) {
    drag = payload;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", payload.kind);
    }
  }

  function endDrag() {
    drag = null;
  }

  function columnDragOver(e: DragEvent) {
    if (!drag) return;
    if (drag.kind !== "column" && drag.kind !== "block") return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function blockDragOver(e: DragEvent) {
    if (!drag) return;
    if (drag.kind !== "block" && drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function linkDragOver(e: DragEvent) {
    if (!drag || drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnColumn(e: DragEvent, column: Column, columnIndex: number) {
    if (!active || !drag) return;
    if (drag.kind !== "column" && drag.kind !== "block") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    drag = null;
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
    drag = null;
    if (payload.kind === "block") {
      commit(moveBlock(doc, active.id, payload.columnId, column.id, payload.blockId, blockIndex));
    } else {
      commit(moveLink(doc, active.id, column.id, payload.blockId, block.id, payload.linkId, block.links.length));
    }
  }

  function dropOnLink(e: DragEvent, column: Column, block: Block, linkIndex: number) {
    if (!active || !drag || drag.kind !== "link") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    drag = null;
    commit(moveLink(doc, active.id, column.id, payload.blockId, block.id, payload.linkId, linkIndex));
  }

  function kanbanColumnDragOver(e: DragEvent) {
    if (!drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function kanbanTaskDragOver(e: DragEvent) {
    if (!drag || drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnKanbanColumn(e: DragEvent, column: KanbanColumn, columnIndex: number) {
    if (!active || !drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    drag = null;
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
    drag = null;
    commit(moveTask(doc, active.id, payload.columnId, column.id, payload.taskId, taskIndex));
  }
</script>

{#if active?.background.dataUrl}
  <div
    class="bg-layer"
    style:background-image={`url(${active.background.dataUrl})`}
    style:opacity={active.background.alpha / 100}
    aria-hidden="true"
  ></div>
{/if}

<div class="topbar">
  {#each doc.workspaces as ws (ws.id)}
    {#if ws.id === active?.id}
      <div class="tab-wrap">
        <button class="tab active" onclick={() => (activeId = ws.id)}>{ws.icon} {ws.name}</button>
        <div class="mini-row">
          <button class="mini" title="Rename workspace" onclick={() => onRenameWorkspace(ws)}>✎</button>
          <button class="mini" title="Workspace icon & color" onclick={() => onEditWorkspace(ws)}>🎨</button>
          {#if doc.workspaces.length > 1}
            <button class="mini" title="Delete workspace" onclick={() => onDeleteWorkspace(ws)}>✕</button>
          {/if}
        </div>
      </div>
    {:else}
      <button class="tab" onclick={() => (activeId = ws.id)}>{ws.icon} {ws.name}</button>
    {/if}
  {/each}
  <button class="tab add" onclick={createWorkspace}>＋ Add</button>
  <div class="spacer"></div>
  <div class="seg">
    <button class:sel={view === "links"} onclick={() => (view = "links")}>🔖 Links</button>
    <button class:sel={view === "kanban"} onclick={() => (view = "kanban")}>📋 Kanban</button>
  </div>
  <button class="pill" onclick={cycleTheme}>{THEME_LABEL[doc.settings.theme]}</button>
  <div class="popover-wrap" bind:this={popoverWrap}>
    <button
      class="pill"
      title="Settings"
      aria-haspopup="menu"
      onclick={() => (settingsOpen = !settingsOpen)}
    >
      ⚙ Settings
    </button>
    {#if settingsOpen}
      <div class="popover" role="menu">
        <span class="popover-title">Favicon source</span>
        {#each FAVICON_SOURCE_OPTIONS as source (source)}
          <button
            class="popover-option"
            class:sel={doc.settings.faviconSource === source}
            role="menuitemradio"
            aria-checked={doc.settings.faviconSource === source}
            onclick={() => {
              commit(setFaviconSource(doc, source));
              settingsOpen = false;
            }}
          >
            {FAVICON_SOURCE_LABEL[source]}
          </button>
        {/each}
        <div class="popover-divider"></div>
        <span class="popover-title">Background</span>
        <button class="popover-option" onclick={onUploadBackground}>🖼️ Upload background</button>
        <label class="bg-alpha">
          <span>Fade</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={active?.background.alpha ?? 70}
            oninput={onBackgroundAlpha}
            disabled={!active?.background.dataUrl}
          />
          <span class="bg-alpha-value">{active?.background.alpha ?? 70}%</span>
        </label>
        {#if active?.background.dataUrl}
          <button class="popover-option" onclick={onRemoveBackground}>🗑️ Remove background</button>
        {/if}
        <div class="popover-divider"></div>
        <span class="popover-title">Layout</span>
        <label class="setting-row">
          <span>Columns</span>
          <input
            type="number"
            min="0"
            step="1"
            placeholder="Auto"
            value={workspaceLayout.columnCount || ""}
            oninput={onColumnCountChange}
          />
        </label>
        <label class="setting-row">
          <span>Full width</span>
          <input
            type="checkbox"
            checked={workspaceLayout.fluid}
            onchange={onFluidChange}
          />
        </label>
        <label class="setting-row">
          <span>Gap (px)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={workspaceLayout.columnGap}
            oninput={onColumnGapChange}
          />
        </label>
        <div class="popover-divider"></div>
        <span class="popover-title">Block title size</span>
        <div class="seg">
          {#each BLOCK_TITLE_SIZE_OPTIONS as size (size)}
            <button
              type="button"
              class:sel={blockTitleSize === size}
              onclick={() => onBlockTitleSize(size)}
            >
              {BLOCK_TITLE_SIZE_LABEL[size]}
            </button>
          {/each}
        </div>
        <div class="popover-divider"></div>
        <p class="help-note">
          In private/incognito browsing, data is stored temporarily and is not shared between browsers.
        </p>
      </div>
    {/if}
  </div>
  <button class="pill" onclick={onExport}>⬇ Export</button>
  <button class="pill" onclick={onImport}>⬆ Import</button>
</div>

{#if storageError}
  <div class="notice error" role="alert">
    <span>{storageError}</span>
    {#if canRecompress}
      <button class="notice-action" onclick={onRecompress} disabled={recompressing}>
        {recompressing ? "Re-compressing…" : "Re-compress backgrounds"}
      </button>
    {/if}
    <button class="notice-close" aria-label="Dismiss" onclick={() => (storageError = null)}>✕</button>
  </div>
{/if}
{#if recovered}
  <div class="notice info" role="status">
    <span>Your data was recovered from a backup — re-add any background images.</span>
    <button class="notice-close" aria-label="Dismiss" onclick={() => (recovered = false)}>✕</button>
  </div>
{/if}

<div class="toolbar">
  <form class="search" onsubmit={onSearch}>
    <input placeholder="Search the web…" aria-label="Search" />
    <select aria-label="Search engine" value={doc.settings.searchEngine} onchange={onEngineChange}>
      <option value="google">Google</option>
      <option value="ddg">DuckDuckGo</option>
      <option value="bing">Bing</option>
    </select>
    <button type="submit">Search</button>
  </form>
</div>

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
          role="group"
          aria-label={`${column.title} column`}
          ondragover={columnDragOver}
          ondrop={(e) => dropOnColumn(e, column, columnIndex)}
        >
          <header class="col-head">
            <h2
              draggable={true}
              ondragstart={(e) => startDrag(e, { kind: "column", columnId: column.id })}
              ondragend={endDrag}
            >
              {column.title}
            </h2>
            <div class="mini-row">
              <button class="mini" title="Rename column" onclick={() => onRenameColumn(column)}>✎</button>
              <button class="mini" title="Delete column" onclick={() => onDeleteColumn(column)}>✕</button>
            </div>
          </header>

          {#each column.blocks as block, blockIndex (block.id)}
            <article class="block" ondragover={blockDragOver} ondrop={(e) => dropOnBlock(e, column, blockIndex, block)}>
              <header class="block-head">
                <h3
                  draggable={true}
                  ondragstart={(e) => startDrag(e, { kind: "block", columnId: column.id, blockId: block.id })}
                  ondragend={endDrag}
                >
                  {block.title}
                </h3>
                <div class="mini-row">
                  <button class="mini" title="Block settings" onclick={() => openBlockSettings(column, block)}>⚙</button>
                  <button class="mini" title="Delete block" onclick={() => onDeleteBlock(column, block)}>✕</button>
                </div>
              </header>

              {#if block.description}
                <p class="block-description">{block.description}</p>
              {/if}

              <div class="links" role="list">
                {#each block.links as link, linkIndex (link.id)}
                  {@const tile = letterTile(domainOf(link.url))}
                  {@const favicon = link.favicon?.dataUrl}
                  {@const remote = remoteFaviconUrl(domainOf(link.url), doc.settings.faviconSource)}
                  {@const faviconSize = block.faviconSize ?? "sm"}
                  {@const faviconPx = FAVICON_SIZE_PX[faviconSize]}
                  <div
                    class="link-row"
                    role="listitem"
                    draggable={true}
                    ondragstart={(e) =>
                      startDrag(e, { kind: "link", columnId: column.id, blockId: block.id, linkId: link.id })}
                    ondragend={endDrag}
                    ondragover={linkDragOver}
                    ondrop={(e) => dropOnLink(e, column, block, linkIndex)}
                  >
                    <a href={link.url} target="_blank" rel="noreferrer" draggable={false}>
                      <span
                        class="favicon"
                        style:background={favicon ? undefined : `hsl(${tile.hue} 45% 45%)`}
                        style:--favicon-size={`${faviconPx}px`}
                      >
                        {#if favicon}
                          <img class="favicon-img" src={favicon} alt="" width={faviconPx} height={faviconPx} draggable={false} />
                        {:else}
                          <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
                          {#if remote}
                            <img
                              class="favicon-img favicon-remote"
                              loading="lazy"
                              src={remote}
                              alt=""
                              width={faviconPx}
                              height={faviconPx}
                              draggable={false}
                              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                            />
                          {/if}
                        {/if}
                      </span>
                      <span class="link-title">{link.title}</span>
                    </a>
                    <div class="mini-row">
                      <button class="mini" title="Link settings" onclick={() => openLinkSettings(column, block, link)}>⚙</button>
                      <button class="mini" title="Delete link" onclick={() => onDeleteLink(column, block, link)}>✕</button>
                    </div>
                  </div>
                {/each}
              </div>

              <form class="inline" onsubmit={(e) => addLinkForm(e, column, block)}>
                <input placeholder="Title https://… (or just a domain)" />
                <button type="submit">＋</button>
              </form>
            </article>
          {/each}

          <form class="inline" onsubmit={(e) => addBlockForm(e, column)}>
            <input placeholder="New block title…" />
            <button type="submit">＋</button>
          </form>
        </section>
      {/each}

      <form class="addcol" onsubmit={addColumnForm}>
        <input placeholder="New column title…" />
        <button type="submit">＋ Column</button>
      </form>
    </div>
    {:else}
      <div class="kanban-board">
        {#each active.kanban.columns as column, columnIndex (column.id)}
          <section
            class="kanban-col"
            role="group"
            aria-label={`${column.title} column`}
            ondragover={kanbanColumnDragOver}
            ondrop={(e) => dropOnKanbanColumn(e, column, columnIndex)}
          >
            <header class="kanban-col-head">
              <button
                type="button"
                class="kanban-col-title"
                draggable={true}
                title="Drag to reorder · click to rename"
                ondragstart={(e) => startDrag(e, { kind: "kanbanColumn", columnId: column.id })}
                ondragend={endDrag}
                onclick={() => onRenameKanbanColumn(column)}
              >
                {column.title}
              </button>
              <span class="kanban-col-count">{column.tasks.length}</span>
              <div class="mini-row">
                <button class="mini" title="Delete column" onclick={() => onDeleteKanbanColumn(column)}>✕</button>
              </div>
            </header>

            <div class="kanban-tasks" role="list">
              {#each column.tasks as task, taskIndex (task.id)}
                <div
                  class="kanban-task"
                  role="listitem"
                  draggable={true}
                  ondragstart={(e) => startDrag(e, { kind: "task", columnId: column.id, taskId: task.id })}
                  ondragend={endDrag}
                  ondragover={kanbanTaskDragOver}
                  ondrop={(e) => dropOnKanbanTask(e, column, taskIndex)}
                >
                  <div class="kanban-task-row">
                    {#if editingTaskId === task.id && editingColumnId === column.id}
                      <input
                        class="task-title-input"
                        bind:value={titleDraft}
                        onkeydown={onTitleKeydown}
                        onblur={commitTitle}
                      />
                    {:else}
                      <button class="task-title" onclick={() => beginEditTitle(column, task)}>{task.title}</button>
                    {/if}
                    <button class="mini" title="Edit notes & due date" onclick={() => toggleEditor(column, task)}>✎</button>
                  </div>

                  <div class="kanban-task-meta">
                    <button class="note-preview" onclick={() => toggleEditor(column, task)}>
                      {#if task.notes.trim()}
                        {task.notes}
                      {:else}
                        <span class="muted">+ note</span>
                      {/if}
                    </button>
                    {#if task.due}
                      {@const due = dueStatus(task.due)}
                      <span class="due-chip" class:overdue={due === "overdue"} class:today={due === "today"}>
                        {task.due}
                      </span>
                    {/if}
                  </div>

                  {#if expandedTaskId === task.id && expandedColumnId === column.id}
                    <div class="kanban-task-editor">
                      <textarea
                        bind:value={notesDraft}
                        onblur={commitNotes}
                        placeholder="Notes…"
                        rows={3}
                      ></textarea>
                      <label class="due-field">
                        <span>Due</span>
                        <input type="date" bind:value={dueDraft} onchange={onDueChange} />
                      </label>
                      <button class="danger" onclick={() => onDeleteTask(column, task)}>Delete task</button>
                    </div>
                  {/if}
                </div>
              {/each}

              <form class="inline kanban-add-task" onsubmit={(e) => onAddTask(e, column)}>
                <input placeholder="Add task…" />
                <button type="submit">＋</button>
              </form>
            </div>
          </section>
        {/each}

        <form class="kanban-add-col" onsubmit={onAddKanbanColumn}>
          <input placeholder="Add column…" />
          <button type="submit">＋ Column</button>
        </form>
      </div>
    {/if}
  {/if}
</main>

{#if settingsColumnId !== null && settingsBlockId !== null}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeBlockSettings();
    }}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Block settings"
      tabindex="-1"
    >
      <h2>Block settings</h2>
      <label class="field">
        <span>Title</span>
        <input
          bind:value={settingsTitle}
          placeholder="Block title…"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveBlockSettings();
            } else if (e.key === "Escape") {
              closeBlockSettings();
            }
          }}
        />
      </label>
      <label class="field">
        <span>Description</span>
        <input
          bind:value={settingsDescription}
          placeholder="Optional description…"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveBlockSettings();
            } else if (e.key === "Escape") {
              closeBlockSettings();
            }
          }}
        />
      </label>
      <fieldset class="field">
        <legend>Favicon size</legend>
        <div class="seg">
          {#each FAVICON_SIZE_OPTIONS as size (size)}
            <button
              type="button"
              class:sel={settingsFaviconSize === size}
              onclick={() => (settingsFaviconSize = size)}
            >
              {FAVICON_SIZE_LABEL[size]}
            </button>
          {/each}
        </div>
      </fieldset>
      <fieldset class="field">
        <legend>Link style</legend>
        <div class="seg">
          {#each LINK_STYLE_OPTIONS as style (style)}
            <button
              type="button"
              class:sel={settingsLinkStyle === style}
              onclick={() => (settingsLinkStyle = style)}
            >
              {LINK_STYLE_LABEL[style]}
            </button>
          {/each}
        </div>
      </fieldset>
      <div class="modal-actions">
        <button type="button" onclick={closeBlockSettings}>Cancel</button>
        <button type="button" class="primary" onclick={saveBlockSettings}>Save</button>
      </div>
    </div>
  </div>
{/if}

{#if linkSettingsColumnId !== null && linkSettingsBlockId !== null && linkSettingsLinkId !== null}
  {@const link = currentLinkSettings()}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeLinkSettings();
    }}
  >
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Link settings"
      tabindex="-1"
    >
      <h2>Link settings</h2>
      {#if link}
        {@const tile = letterTile(domainOf(link.url))}
        {@const favicon = link.favicon?.dataUrl}
        <div class="link-settings-icon">
          <span class="favicon" style:background={favicon ? undefined : `hsl(${tile.hue} 45% 45%)`}>
            {#if favicon}
              <img class="favicon-img" src={favicon} alt="" width={32} height={32} draggable={false} />
            {:else}
              <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
            {/if}
          </span>
          <span class="link-settings-icon-label">{favicon ? "Custom icon" : "Letter tile"}</span>
        </div>
        <div class="link-settings-favicon-actions">
          <button type="button" onclick={pickLinkFavicon}>{favicon ? "Change favicon" : "Set favicon"}</button>
          {#if favicon}
            <button type="button" class="danger" onclick={removeLinkFavicon}>Remove favicon</button>
          {/if}
        </div>
      {/if}
      <label class="field">
        <span>Title</span>
        <input bind:value={linkSettingsTitle} placeholder="Title…" onkeydown={onLinkSettingsKeydown} />
      </label>
      <label class="field">
        <span>URL</span>
        <input bind:value={linkSettingsUrl} placeholder="https://…" onkeydown={onLinkSettingsKeydown} />
      </label>
      <div class="modal-actions">
        <button type="button" onclick={closeLinkSettings}>Cancel</button>
        <button type="button" class="primary" onclick={saveLinkSettings}>Save</button>
      </div>
    </div>
  </div>
{/if}
