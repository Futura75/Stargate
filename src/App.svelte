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
    letterTile,
    MAX_BACKGROUND_BASE64,
    moveBlock,
    moveLink,
    moveTask,
    removeBackground,
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
    setSearchEngine,
    setTheme,
    updateTask,
    updateWorkspace,
  } from "./store/core";
  import { browserCodec } from "./store/codec";
  import { loadState, saveState } from "./store/persistence";
  import type {
    Block,
    Column,
    FaviconSource,
    KanbanColumn,
    Link,
    SearchEngine,
    StargateState,
    Task,
    Theme,
    Workspace,
  } from "./store/types";

  const loaded = loadState(localStorage);
  let doc: StargateState = $state(loaded);
  let activeId: string = $state(loaded.workspaces[0]?.id ?? "");

  const active = $derived(doc.workspaces.find((w) => w.id === activeId) ?? doc.workspaces[0]);

  type DragPayload =
    | { kind: "column"; columnId: string }
    | { kind: "block"; columnId: string; blockId: string }
    | { kind: "link"; columnId: string; blockId: string; linkId: string }
    | { kind: "kanbanColumn"; columnId: string }
    | { kind: "task"; columnId: string; taskId: string };

  let drag: DragPayload | null = $state(null);
  let settingsOpen: boolean = $state(false);
  let view: "links" | "kanban" = $state("links");
  let expandedTaskId: string | null = $state(null);
  let expandedColumnId: string | null = $state(null);
  let notesDraft: string = $state("");
  let dueDraft: string = $state("");
  let editingTaskId: string | null = $state(null);
  let editingColumnId: string | null = $state(null);
  let titleDraft: string = $state("");

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
    doc = next;
    saveState(localStorage, next);
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

  function onPickIcon(column: Column, block: Block, link: Link) {
    const wsId = active?.id;
    if (!wsId) return;
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
          commit(setFavicon(doc, wsId, column.id, block.id, link.id, favicon));
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

  function onRenameBlock(column: Column, block: Block) {
    if (!active) return;
    const title = prompt("Block name", block.title)?.trim();
    if (!title) return;
    commit(renameBlock(doc, active.id, column.id, block.id, title));
  }

  function onDeleteBlock(column: Column, block: Block) {
    if (!active) return;
    if (!confirm(`Delete block “${block.title}”?`)) return;
    commit(deleteBlock(doc, active.id, column.id, block.id));
  }

  function onEditLink(column: Column, block: Block, link: Link) {
    if (!active) return;
    const title = prompt("Link title", link.title)?.trim();
    if (title == null) return;
    const url = prompt("Link URL", link.url)?.trim();
    if (url == null) return;
    commit(renameLink(doc, active.id, column.id, block.id, link.id, title || link.title, url || link.url));
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
  <div class="popover-wrap">
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
      </div>
    {/if}
  </div>
  <button class="pill">{"{ } State"}</button>
</div>

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
    <div class="cols">
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
                  <button class="mini" title="Rename block" onclick={() => onRenameBlock(column, block)}>✎</button>
                  <button class="mini" title="Delete block" onclick={() => onDeleteBlock(column, block)}>✕</button>
                </div>
              </header>

              <div class="links" role="list">
                {#each block.links as link, linkIndex (link.id)}
                  {@const tile = letterTile(domainOf(link.url))}
                  {@const favicon = link.favicon?.dataUrl}
                  {@const remote = remoteFaviconUrl(domainOf(link.url), doc.settings.faviconSource)}
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
                      <span class="favicon" style:background={favicon ? undefined : `hsl(${tile.hue} 45% 45%)`}>
                        {#if favicon}
                          <img class="favicon-img" src={favicon} alt="" width="16" height="16" draggable={false} />
                        {:else}
                          <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
                          {#if remote}
                            <img
                              class="favicon-img favicon-remote"
                              loading="lazy"
                              src={remote}
                              alt=""
                              width="16"
                              height="16"
                              draggable={false}
                              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                            />
                          {/if}
                        {/if}
                      </span>
                      <span class="link-title">{link.title}</span>
                    </a>
                    <div class="mini-row">
                      <button class="mini" title="Set favicon" onclick={() => onPickIcon(column, block, link)}>📷</button>
                      <button class="mini" title="Edit link" onclick={() => onEditLink(column, block, link)}>✎</button>
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
