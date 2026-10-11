<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper, which only interpolates a
     hardcoded ICONS[name] string keyed by literal icon names; there is no
     user-controlled content reaching {@html} here. */
  import {
    addBlock,
    addColumn,
    addLink,
    deleteBlock,
    deleteColumn,
    deleteLink,
    linkStyleOf,
    moveBlock,
    moveLink,
    removeFavicon,
    renameBlock,
    renameColumn,
    renameLink,
    reorderColumn,
    setFavicon,
    setLinkUrl,
    updateBlockSettings,
    DEFAULT_BLOCK_TITLE_SIZE,
    DEFAULT_LINK_STYLE,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "../store/core";
  import { browserCodec } from "../store/codec";
  import type { Block, Column, FaviconSize, Link, LinkStyle, StargateState, Workspace } from "../store/types";
  import { autofocus } from "./actions";
  import { bareUrl, FAVICON_SIZE_LABEL, FAVICON_SIZE_OPTIONS, FAVICON_SIZE_PX, LINK_STYLE_LABEL, LINK_STYLE_OPTIONS, TILE_FAVICON_PX } from "./linkDisplay";
  import { BLOCK_TITLE_SIZE_PX } from "./blockDisplay";
  import Favicon from "./Favicon.svelte";
  import { icon } from "./icons";
  import type { AddingKind, DragPayload } from "./dragTypes";

  let {
    doc,
    active,
    visible,
    commit,
    commitWithUndo,
    showToast,
    drag = $bindable(),
    dropTarget = $bindable(),
    adding = $bindable(),
    renaming = $bindable(),
    renameDraft = $bindable(),
  }: {
    doc: StargateState;
    active: Workspace | undefined;
    visible: boolean;
    commit: (next: StargateState) => boolean;
    commitWithUndo: (next: StargateState, message: string) => void;
    showToast: (message: string, undo?: StargateState | null) => void;
    drag: DragPayload | null;
    dropTarget: string | null;
    adding: { kind: AddingKind; id: string } | null;
    renaming: { kind: "column" | "kanbanColumn"; id: string } | null;
    renameDraft: string;
  } = $props();

  const workspaceLayout = $derived(active?.layout ?? DEFAULT_WORKSPACE_LAYOUT);
  const blockTitleSize = $derived(active?.blockTitleSize ?? DEFAULT_BLOCK_TITLE_SIZE);

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

  export function isSettingsOpen(): boolean {
    return settingsBlockId !== null || linkSettingsLinkId !== null;
  }

  export function closeOnEscape(): boolean {
    if (linkSettingsLinkId !== null) {
      closeLinkSettings();
      return true;
    }
    if (settingsBlockId !== null) {
      closeBlockSettings();
      return true;
    }
    return false;
  }

  // ---------- favicons ----------

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
</script>

{#if visible && active}
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
                      <Favicon {link} px={faviconPx} faviconSource={doc.settings.faviconSource} />
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
                    <Favicon
                      link={sample}
                      px={settingsLinkStyle === "tiles" ? TILE_FAVICON_PX : FAVICON_SIZE_PX[settingsFaviconSize]}
                      faviconSource={doc.settings.faviconSource}
                    />
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
            <Favicon {link} px={40} faviconSource={doc.settings.faviconSource} />
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
