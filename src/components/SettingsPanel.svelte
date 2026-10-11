<script lang="ts">
  import {
    setFaviconSource,
    setSearchEngine,
    setTheme,
    DEFAULT_BLOCK_TITLE_SIZE,
    DEFAULT_OPEN_WORKSPACE,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "../store/core";
  import type { FaviconSource, SearchEngine, StargateState, Theme, Workspace } from "../store/types";
  import type { SyncStatus } from "../store/sync";
  import { syncConfigured, type OAuthProvider } from "../sync/supabase";
  import { icon } from "./icons";
  import { BLOCK_TITLE_SIZE_LABEL, BLOCK_TITLE_SIZE_OPTIONS } from "./blockDisplay";
  import { formatBytes } from "./format";

  let {
    open,
    onclose,
    doc,
    active,
    account,
    syncStatus,
    syncMessage,
    usage,
    commit,
    onBlockTitleSize,
    setColumnCount,
    onColumnGapChange,
    toggleFluid,
    onOpenWorkspace,
    onSignIn,
    onSignOut,
    onExport,
    onImport,
    onImportBookmarks,
  }: {
    open: boolean;
    onclose: () => void;
    doc: StargateState;
    active: Workspace | undefined;
    account: { id: string; email: string } | null;
    syncStatus: SyncStatus;
    syncMessage: string | null;
    usage: { totalBytes: number; backgroundBytes: number; configBytes: number };
    commit: (next: StargateState) => boolean;
    onBlockTitleSize: (size: (typeof BLOCK_TITLE_SIZE_OPTIONS)[number]) => void;
    setColumnCount: (columnCount: number) => void;
    onColumnGapChange: (e: Event) => void;
    toggleFluid: () => void;
    onOpenWorkspace: (mode: (typeof OPEN_WORKSPACE_OPTIONS)[number]) => void;
    onSignIn: (provider: OAuthProvider) => void;
    onSignOut: () => void;
    onExport: () => void;
    onImport: () => void;
    onImportBookmarks: () => void;
  } = $props();

  const workspaceLayout = $derived(active?.layout ?? DEFAULT_WORKSPACE_LAYOUT);
  const blockTitleSize = $derived(active?.blockTitleSize ?? DEFAULT_BLOCK_TITLE_SIZE);

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

  const OPEN_WORKSPACE_OPTIONS = ["first", "last"] as const;
  const OPEN_WORKSPACE_LABEL: Record<(typeof OPEN_WORKSPACE_OPTIONS)[number], string> = {
    first: "First workspace",
    last: "Last used",
  };

  const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
    off: "Not signed in.",
    syncing: "Syncing…",
    synced: "Up to date.",
    offline: "Offline — changes will sync when you reconnect.",
    error: "Sync problem — will retry.",
  };

  const STORAGE_CAP = 5 * 1024 * 1024;
</script>

{#if open && active}
  <div class="scrim sheet-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="dialog sheet" role="dialog" aria-modal="true" aria-label="Settings" tabindex="-1">
      <div class="dialog-head">
        <h2>Settings</h2>
        <button class="icon-btn" aria-label="Close" onclick={onclose}>{@html icon("x")}</button>
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
