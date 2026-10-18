<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper, which only interpolates a
     hardcoded ICONS[name] string keyed by literal icon names; there is no
     user-controlled content reaching {@html} here. */
  import {
    languageOf,
    setFaviconSource,
    setLanguage,
    setSearchEngine,
    setSkin,
    setTheme,
    DEFAULT_SKIN,
    SKINS,
    DEFAULT_BLOCK_TITLE_SIZE,
    DEFAULT_OPEN_WORKSPACE,
    DEFAULT_WORKSPACE_LAYOUT,
  } from "../store/core";
  import type { FaviconSource, SearchEngine, StargateState, Theme, Workspace } from "../store/types";
  import type { SyncStatus } from "../store/sync";
  import { syncConfigured, type OAuthProvider } from "../sync/supabase";
  import { icon } from "./icons";
  import { BLOCK_TITLE_SIZE_OPTIONS } from "./blockDisplay";
  import { formatBytes } from "./format";
  import { SKIN_LABEL } from "../skin";
  import { LANGUAGE_OPTIONS } from "../i18n";
  import { i18n } from "../i18n/state.svelte";

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

  const t = $derived(i18n.t);
  const language = $derived(languageOf(doc.settings));

  const workspaceLayout = $derived(active?.layout ?? DEFAULT_WORKSPACE_LAYOUT);
  const blockTitleSize = $derived(active?.blockTitleSize ?? DEFAULT_BLOCK_TITLE_SIZE);

  const THEME_CYCLE: Theme[] = ["light", "dark", "system"];
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

  const OPEN_WORKSPACE_OPTIONS = ["first", "last"] as const;

  const STORAGE_CAP = 5 * 1024 * 1024;
</script>

{#if open && active}
  <div class="scrim sheet-scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
    <div class="dialog sheet" role="dialog" aria-modal="true" aria-label={t.settings.title} tabindex="-1">
      <div class="dialog-head">
        <h2>{t.settings.title}</h2>
        <button class="icon-btn" aria-label={t.common.close} onclick={onclose}>{@html icon("x")}</button>
      </div>
      <div class="dialog-body">
        <section class="section">
          <div class="section-title">{t.settings.appearance}</div>
          <div class="setting">
            <span>{t.settings.language}</span>
            <div class="seg">
              {#each LANGUAGE_OPTIONS as option (option.value)}
                <button type="button" class:sel={language === option.value} onclick={() => commit(setLanguage(doc, option.value))}>
                  {option.label}
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span>{t.settings.theme}</span>
            <div class="seg">
              {#each THEME_CYCLE as theme (theme)}
                <button type="button" class:sel={doc.settings.theme === theme} onclick={() => commit(setTheme(doc, theme))}>
                  {@html icon(THEME_ICON[theme])}{t.theme[theme]}
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span>{t.settings.look}</span>
            <div class="seg">
              {#each SKINS as s (s)}
                <button type="button" class:sel={(doc.settings.skin ?? DEFAULT_SKIN) === s} title={t.skinNote[s]} onclick={() => commit(setSkin(doc, s))}>
                  {SKIN_LABEL[s]}
                </button>
              {/each}
            </div>
          </div>
          <div class="setting">
            <span>{t.settings.blockTitles}</span>
            <div class="seg">
              {#each BLOCK_TITLE_SIZE_OPTIONS as size (size)}
                <button type="button" class:sel={blockTitleSize === size} onclick={() => onBlockTitleSize(size)}>
                  {t.titleSize[size]}
                </button>
              {/each}
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-title">{t.settings.layout(`${active.icon} ${active.name}`)}</div>
          <div class="setting">
            <span>{t.settings.columns}</span>
            <div class="stepper">
              <button type="button" aria-label={t.settings.fewerColumns} onclick={() => setColumnCount(workspaceLayout.columnCount - 1)}>−</button>
              <output>{workspaceLayout.columnCount || t.settings.auto}</output>
              <button type="button" aria-label={t.settings.moreColumns} onclick={() => setColumnCount(workspaceLayout.columnCount + 1)}>+</button>
            </div>
          </div>
          <div class="setting">
            <span>{t.settings.fullWidth}</span>
            <button
              type="button"
              class="switch"
              class:on={workspaceLayout.fluid}
              role="switch"
              aria-checked={workspaceLayout.fluid}
              aria-label={t.settings.fullWidth}
              onclick={toggleFluid}
            ></button>
          </div>
          <label class="field">
            <span class="setting-label">{t.settings.columnGap}</span>
            <span class="range-row">
              <input type="range" min="0" max="48" step="2" value={workspaceLayout.columnGap} oninput={onColumnGapChange} />
              <output>{workspaceLayout.columnGap}px</output>
            </span>
          </label>
        </section>

        <section class="section">
          <div class="section-title">{t.settings.search}</div>
          <div class="setting">
            <span>{t.settings.defaultEngine}</span>
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
          <div class="section-title">{t.settings.favicons}</div>
          <div class="setting">
            <span>{t.settings.fetchIconsFrom}</span>
            <div class="seg">
              {#each FAVICON_SOURCE_OPTIONS as source (source)}
                <button type="button" class:sel={doc.settings.faviconSource === source} onclick={() => commit(setFaviconSource(doc, source))}>
                  {t.faviconSource[source]}
                </button>
              {/each}
            </div>
          </div>
          <p class="help-note">{t.settings.faviconsNote}</p>
        </section>

        <section class="section">
          <div class="section-title">{t.settings.onStartup}</div>
          <div class="setting">
            <span>{t.settings.open}</span>
            <div class="seg">
              {#each OPEN_WORKSPACE_OPTIONS as mode (mode)}
                <button
                  type="button"
                  class:sel={(doc.settings.openWorkspace ?? DEFAULT_OPEN_WORKSPACE) === mode}
                  onclick={() => onOpenWorkspace(mode)}
                >
                  {t.openWorkspace[mode]}
                </button>
              {/each}
            </div>
          </div>
        </section>

        {#if syncConfigured}
          <section class="section">
            <div class="section-title">{t.settings.sync}</div>
            {#if account}
              <div class="setting">
                <span>{t.settings.signedIn(account.email)}</span>
                <button type="button" class="btn sm" onclick={onSignOut}>{t.settings.signOut}</button>
              </div>
              <p class="help-note" title={syncMessage ?? undefined}>
                {t.syncStatus[syncStatus]} {t.settings.syncedNote}
              </p>
            {:else}
              <div class="setting">
                <span>{t.settings.signInWith}</span>
                <div class="seg">
                  <button type="button" onclick={() => onSignIn("github")}>GitHub</button>
                  <button type="button" onclick={() => onSignIn("google")}>Google</button>
                </div>
              </div>
              <p class="help-note">
                {t.settings.syncOptionalNote}
              </p>
            {/if}
          </section>
        {/if}

        <section class="section">
          <div class="section-title">{t.settings.yourData}</div>
          <div class="meter" title={t.settings.usageOf(formatBytes(usage.totalBytes))}>
            <i class="meter-bg" style:width={`${(usage.backgroundBytes / STORAGE_CAP) * 100}%`}></i>
            <i class="meter-cfg" style:width={`${(usage.configBytes / STORAGE_CAP) * 100}%`}></i>
          </div>
          <div class="legend">
            <span><i class="meter-bg"></i>{t.settings.backgrounds} {formatBytes(usage.backgroundBytes)}</span>
            <span><i class="meter-cfg"></i>{t.settings.linksAndTasks} {formatBytes(usage.configBytes)}</span>
            <span>{t.settings.ofBrowserStorage}</span>
          </div>
          <div class="data-actions">
            <button class="btn" onclick={onExport}>{@html icon("download")} {t.settings.exportBackup}</button>
            <button class="btn" onclick={onImport}>{@html icon("upload")} {t.settings.restoreFromFile}</button>
            <button class="btn" onclick={onImportBookmarks}>{@html icon("folder")} {t.settings.importBookmarks}</button>
          </div>
          <p class="help-note">
            {#if account}
              {t.settings.dataNoteSynced}
            {:else}
              {t.settings.dataNoteLocal}
            {/if}
          </p>
        </section>
      </div>
    </div>
  </div>
{/if}
