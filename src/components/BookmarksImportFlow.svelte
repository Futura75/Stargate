<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper, which only interpolates a
     hardcoded ICONS[name] string keyed by literal icon names; there is no
     user-controlled content reaching {@html} here. */
  import {
    bookmarksImportTitles,
    folderPathKey,
    importBookmarksFromTree,
    listBookmarkFolders,
    parseBookmarksHtml,
    type BookmarkFolderRow,
    type BookmarksTree,
  } from "../store/bookmarks";
  import type { StargateState } from "../store/types";
  import { icon } from "./icons";
  import { languageOf } from "../store/core";
  import { errorText, i18n } from "../i18n/state.svelte";

  let {
    doc,
    commit,
    showToast,
    onImported,
    closeSettings,
  }: {
    doc: StargateState;
    commit: (next: StargateState) => boolean;
    showToast: (message: string, undo?: StargateState | null) => void;
    onImported: (activeId: string) => void;
    closeSettings: () => void;
  } = $props();

  const t = $derived(i18n.t);
  const importTitles = $derived(bookmarksImportTitles(languageOf(doc.settings)));

  let bookmarksInput: HTMLInputElement | null = null;
  let bookmarksTree = $state<BookmarksTree | null>(null);
  let bookmarksExcluded: string[] = $state([]);
  let bookmarksIncludeRootLinks: boolean = $state(false);
  let bookmarksIncludeUngroupedBlock: boolean = $state(true);

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

  export function isOpen(): boolean {
    return bookmarksTree !== null;
  }

  export function open() {
    bookmarksInput?.click();
  }

  export function closeOnEscape(): boolean {
    if (bookmarksTree) {
      closeBookmarksPicker();
      return true;
    }
    return false;
  }

  function onBookmarksFile(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file after a cancel
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => showToast(t.errors.fileUnreadable);
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      let tree: BookmarksTree;
      try {
        tree = parseBookmarksHtml(text);
      } catch (err) {
        showToast(errorText(err, t.errors.bookmarksUnreadable));
        return;
      }
      if (tree.entries.length === 0) {
        showToast(t.toast.noBookmarks);
        return;
      }
      closeSettings();
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
      showToast(t.toast.nothingToImport);
      return;
    }
    commit(next);
    onImported(created[0].id);
    showToast(t.toast.bookmarksAdded(created.length));
  }

  function bookmarksFolderSummary(row: BookmarkFolderRow): string {
    return t.bookmarks.folderSummary(row.links, row.subfolders);
  }

</script>

<input type="file" accept=".html,.htm" bind:this={bookmarksInput} onchange={onBookmarksFile} hidden />

{#if bookmarksTree}
  <div
    class="scrim"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) closeBookmarksPicker();
    }}
  >
    <div class="dialog wide" role="dialog" aria-modal="true" aria-label={t.bookmarks.title} tabindex="-1">
      <div class="dialog-head">
        <h2>{t.bookmarks.title}</h2>
        <button class="icon-btn" aria-label={t.common.close} onclick={closeBookmarksPicker}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <p class="help-note">{t.bookmarks.intro}</p>
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
            {t.bookmarks.ungroupedBlock(importTitles.ungroupedBlock)}
          </label>
        {/if}
        {#if bookmarksHasRootLinks}
          <label class="check-row">
            <input type="checkbox" bind:checked={bookmarksIncludeRootLinks} />
            {t.bookmarks.rootLinks(bookmarksRootLinkCount, importTitles.workspace)}
          </label>
        {/if}
      </div>
      <div class="dialog-foot">
        <span class="help-note push-right">
          {t.bookmarks.willBeAdded(bookmarksWorkspaceCount)}
        </span>
        <button type="button" class="btn ghost" onclick={closeBookmarksPicker}>{t.common.cancel}</button>
        <button type="button" class="btn primary" onclick={confirmBookmarksImport} disabled={!bookmarksCanConfirm}>
          {t.common.import}
        </button>
      </div>
    </div>
  </div>
{/if}
