<script lang="ts">
  import { addBlock, addColumn, addLink, addWorkspace } from "./store/core";
  import { loadState, saveState } from "./store/persistence";
  import type { Block, Column, StargateState } from "./store/types";

  const loaded = loadState(localStorage);
  let doc: StargateState = $state(loaded);
  let activeId: string = $state(loaded.workspaces[0]?.id ?? "");

  const active = $derived(doc.workspaces.find((w) => w.id === activeId) ?? doc.workspaces[0]);

  function commit(next: StargateState) {
    doc = next;
    saveState(localStorage, next);
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
</script>

<div class="topbar">
  {#each doc.workspaces as ws (ws.id)}
    <button class="tab" class:active={ws.id === active?.id} onclick={() => (activeId = ws.id)}>
      {ws.icon} {ws.name}
    </button>
  {/each}
  <button class="tab add" onclick={createWorkspace}>＋ Add</button>
  <div class="spacer"></div>
  <div class="seg">
    <button class="sel">🔖 Links</button>
    <button disabled title="Coming in ticket #15">📋 Kanban</button>
  </div>
  <button class="pill">🌗 System</button>
  <button class="pill">{"{ } State"}</button>
</div>

<div class="toolbar">
  <form class="search" onsubmit={(e) => e.preventDefault()}>
    <input placeholder="Search the web…" aria-label="Search" />
    <select aria-label="Search engine">
      <option>Google</option>
      <option>DuckDuckGo</option>
      <option>Bing</option>
    </select>
    <button type="submit">Search</button>
  </form>
</div>

<main>
  {#if active}
    <div class="cols">
      {#each active.columns as column (column.id)}
        <section class="col">
          <h2>{column.title}</h2>
          {#each column.blocks as block (block.id)}
            <article class="block">
              <h3>{block.title}</h3>
              <div class="links">
                {#each block.links as link (link.id)}
                  <a href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
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
  {/if}
</main>
