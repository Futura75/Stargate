# Stargate — Specification

> **Status:** decision-locked — assembled from the wayfinder maps [#1](https://github.com/Futura75/Stargate/issues/1) (v1, tickets #2–#7) and [#25](https://github.com/Futura75/Stargate/issues/25) (link styles, tickets #26–#29). Ready to hand off to implementation sessions.
> **Source of truth:** [Wayfinder map #1](https://github.com/Futura75/Stargate/issues/1) + resolutions #2–#7; [Wayfinder map #25](https://github.com/Futura75/Stargate/issues/25) + resolutions #26–#29; canonical terms in [`GLOSSARY.md`](./GLOSSARY.md).

## 1. Positioning

Stargate is an open-source **browser homepage**: a cozy, simple start page for bookmarks and a kanban board. It is a **static web app with no backend in v1**, set as the browser's start/new-tab page. GitHub Pages is the reference demo. There is **no browser extension in v1**. UI and docs are in English.

## 2. Stack

**Vite + Svelte + TypeScript.** Fully static; no server; all data lives in the browser.

## 3. Features & UX

### 3.1 Shell & layout — variant D "Synthesis" (#4)

- Cozy card-based dashboard at **full width** (no max-width gutter).
- **Workspace switcher: tabs on top**, reorderable by drag-and-drop, with an add-workspace tab at the end; every per-workspace control (Rename, Icon & color, Delete) lives in the ⚙ Settings popover, not on the tab.
- **Search docked in a toolbar** (no "gate" ring), with an inline engine selector.
- **Edit affordances are hover-reveal, always available — no global edit mode.**
- **Theme is global** (light / dark / system cycle pill).
- **Background is per-workspace**: image opacity (alpha) over the base colour — one control in v1.

### 3.2 Bookmarks — the Links view

- Structure: **workspaces → columns → blocks (cards) → links**; drag & drop reorders and moves.
- A **link** is a title + URL, with an optional favicon.
- Links render in one of three per-block **link styles** — `list` / `detail` / `tiles` (see §3.7).
- Add via inline form; delete via hover-reveal ✕; rename inline.

### 3.3 Kanban — the Kanban view (#5, verdict K1 "Inline")

- A **dedicated per-workspace view tab** (segment `Links | Kanban` in the top bar); **one board per workspace**.
- Customizable columns, default **Todo / In Progress / Done**.
- **Task** = title + optional notes + optional due date.
- **Interaction model "Inline" (K1)**: the board *is* the editor.
  - Task title is click-to-edit in place (Enter/blur commits, Esc cancels).
  - Notes + due date edit via an inline expand (the ✎ or clicking the note line): notes textarea, due-date field, delete.
  - Notes show as a one-line preview on the card (muted "+ note" hint when empty); due date shows as a chip (tinted when overdue).
  - Columns: header title click-to-rename; reorder by dragging the header; add via a "+" tile; delete via hover ✕ (keep-at-least-one guard).
  - Density: compact homepage glance — one title line + note preview + due chip per card.

### 3.4 Search

- Minimal: a single configurable default engine (**Google / DuckDuckGo / Bing**). Custom search shortcuts are deferred to fog.

### 3.5 Favicons (#2)

Three-tier resolution, letter tile as the base layer:

1. **Stored data URL** (per-link, highest priority): renders directly, offline, self-contained in the export.
2. **Letter tile** (always-present base layer): first letter of the domain on a hue hashed from the domain; pure CSS, zero storage/network.
3. **Remote service tier** (opt-in, lazy-loaded): `https://icons.duckduckgo.com/ip3/{domain}.ico` **or** `https://www.google.com/s2/favicons?domain={domain}&sz=32`, behind a settings toggle that **defaults to off** (privacy: the provider learns the user's bookmark set).

Hard findings that constrain storage:
- Google s2 / DDG ip3 send **no CORS headers** → service icons **cannot be hoarded** via fetch/canvas (taint). Only **user-uploaded** icons or **CORS-enabled** site icons can be stored as bytes.
- Canonical stored form: **32×32 PNG**, ~1.2 KB base64/icon; **8 KB** per-icon cap; ~1 MB total warn.

### 3.6 Backgrounds (#3)

- User uploads an image; it is auto-compressed client-side and stored as a data URL.
- Pipeline: `createImageBitmap(file, {imageOrientation:'from-image'})` → downscale to **≤ 1920 px** (single `drawImage` with `imageSmoothingQuality:'high'`; iterative halving only if source > 4× target) → `canvas.toBlob(type, quality)`.
- Encoder chosen **at runtime**: **WebP q0.80** if a canvas-**encode** feature-detect passes (Chrome/Edge/Opera, Firefox 96+), else **JPEG q0.80** (Safari cannot encode WebP — WebKit bug 226950 WONTFIX). Never request `image/webp` blindly (Safari's silent PNG fallback is larger than the problem).
- Iterative fit: quality 0.80 → 0.72 → 0.64, then dimensions 1920 → 1600 → 1280; reject the upload only if it still exceeds the cap.
- Per-background cap: **≤ ~500 KB target / ~700 KB absolute** (base64). Alpha 0–100 over the theme's base colour.

### 3.7 Link styles (#26, #27, #28)

Every block renders its links in one of three **link styles**, chosen per block. The style is purely visual — the same links, the same interactions, no data difference.

- **`list`** (default): the classic row — favicon + title, one link per line.
- **`detail`**: a bordered card row per link — favicon (follows the block's `faviconSize`, sm/md/lg), bold title, and a second line with the **URL** (no protocol, truncated, muted). Title and URL truncate with an ellipsis and never overlap adjacent rows.
- **`tiles`**: a wrapping grid — a **fixed 48px** favicon with the title (truncated, centered) beneath; no URL. Tiles wrap in an auto-fill grid (min ~72px per tile).

Uniform across all three styles (#27):
- Drag & drop reorders within a block and moves links across blocks/columns, as today.
- Hover reveals the same ⚙/✕ controls; in `tiles` they are a badge at the tile's top-right corner, raised above the link so they stay clickable.
- The inline "+" add form stays at the bottom of the block.

The style is set with a segmented **Link style** control (List / Detail / Tiles) in the **Block settings** modal, alongside Title, Description, and Favicon size. Existing blocks default to `list` — no visual change after upgrade.

**Deferred (not yet specified):** a per-link description field for `detail`'s second line; a workspace-level default style; alphabetical/manual sort within a style.

### 3.8 Workspace UX — settings, ordering, startup, collapse (#34)

- **Workspace settings consolidation**: the active tab carries no `✎ 🎨 ✕` mini-buttons; **Rename workspace**, **Workspace icon & color**, and **Delete workspace** (hidden while only one workspace remains) are options in the ⚙ Settings popover, reusing the prompt/confirm flows.
- **Workspace ordering**: workspace tabs are drag-and-drop reorderable; order is positional (the `workspaces` array) and therefore survives reloads and export/import.
- **Startup behavior**: a global setting — **Open first** (default) or **Remember last** — chooses whether the app opens the **first workspace** or the **last active workspace**; the last one is remembered across reloads, with a missing remembered workspace falling back to the first.
- **Collapsed blocks**: a block can collapse to its title alone — hiding its description, links, and inline add form — while the header controls and drag-and-drop keep working; the collapsed/expanded state is per block, persisted, and carried by export/import.

## 4. Data model & JSON schema (#6)

Single JSON document; ordering is **positional** (array order is the order); all ids are **opaque random strings**, unique document-wide, never displayed.

```jsonc
{
  "schemaVersion": "4",
  "app": { "name": "Stargate", "version": "0.1.0" },
  "exportedAt": "2026-10-08T12:00:00Z",            // ISO 8601
  "settings": {
    "theme": "system",             // "light" | "dark" | "system"
    "searchEngine": "google",      // "google" | "ddg" | "bing"
    "faviconSource": "off",        // "off" | "google-s2" | "duckduckgo"  (default "off")
    "openWorkspace": "first",      // optional: "first" | "last"; absent = "first"
    "lastWorkspaceId": "opaque-random-string"  // optional; restored when openWorkspace = "last"
  },
  "workspaces": [
    {
      "id": "opaque-random-string",
      "name": "Personal",
      "icon": "🏠",                  // emoji
      "color": "#5f7161",           // hex
      "background": { "dataUrl": "data:image/webp;base64,…", "alpha": 80 },
      // dataUrl = null when none; compressed ≤ ~500KB target / 700KB abs. No presets in v1.
      "layout": { "columnCount": 0, "fluid": true, "columnGap": 18 },  // optional; columnCount 0 = auto-wrap
      "blockTitleSize": "md",        // optional: "sm" | "md" | "lg"
      "columns": [                  // Links view — positional order
        { "id": "c1", "title": "Daily", "blocks": [
          { "id": "b1", "title": "News",
            "description": "optional block description",   // optional
            "faviconSize": "md",                            // optional: "sm" | "md" | "lg"
            "linkStyle": "list",                            // optional: "list" | "detail" | "tiles"; absent = "list"
            "collapsed": false,                             // optional: true hides description/links/add form; absent = false
            "links": [
            { "id": "l1", "title": "Hacker News", "url": "https://news.ycombinator.com",
              "favicon": { "dataUrl": "data:image/png;base64,…", "source": "custom", "fetchedAt": "2026-10-08T08:00:00Z" } }
            // favicon optional; absent = letter tile. source ∈ "custom" | "direct" | "google-s2" | "duckduckgo".
            // dataUrl = normalized 32×32 PNG, ≤ 8KB base64; NEVER a remote URL.
          ]}
        ]}
      ],
      "kanban": { "columns": [       // Kanban view — one board per workspace — positional order
        { "id": "k1", "title": "Todo", "tasks": [
          { "id": "t1", "title": "Write the v1 spec", "notes": "", "due": null }
          // due: "YYYY-MM-DD" | null (date-only, no time)
        ]}
      ]}
    }
  ]
}
```

**Conventions:** ids opaque-random; order positional (no sort fields); due date-only `YYYY-MM-DD`; favicon 32×32 PNG ≤ 8 KB, never a remote URL; backgrounds embedded base64; `linkStyle` ∈ `list|detail|tiles` (absent = `list`, unknown values dropped on import); `openWorkspace` ∈ `first|last` (absent = `first`); `collapsed` boolean (absent = `false`). Schema history: v1 (initial) → v2 (workspace appearance + per-block settings) → v3 (link styles) → v4 (startup behavior + block collapse).

## 5. Storage & resilience (#3, #7)

- **localStorage only**; the whole state is one JSON under one key.
- **Quota (~5 MB/origin), self-metered**: usage ≈ Σ(key.length + value.length), budgeted 2 bytes/char (conservative UTF-16). Sub-budgets **≤ 3 MB backgrounds, ≤ 1 MB config**; write-guard at **4 MB**. **Never** use `navigator.storage.estimate()` for this.
- **Quota exceeded on save**: proactive pre-check before large writes; write to a temp key and **swap only on success**. On `QuotaExceededError` (name + legacy `code` 22/1014, `NS_ERROR_DOM_QUOTA_REACHED`) the prior state is kept intact; the user sees an actionable message ("storage full — remove a background or export a backup") and is offered re-compression at lower quality.
- **Corruption on boot**: a **last-good shadow copy** (second key, written atomically after each successful save, with bulky image payloads stripped — `background.dataUrl → null`, `favicon` omitted). If the main key is unparsable, restore the shadow and show a non-blocking notice ("your data was recovered from a backup — re-add any background images"). Backgrounds fall back to none, favicons to letter tiles.
- **Auto-backup nudges: out for v1.** Manual Export only (prominent).
- **Private browsing / cross-browser: no runtime detection.** A help note + prominent Export, documenting that private/incognito storage is ephemeral and data is not shared between browsers. (Safari ITP can also evict script-writable storage after 7 days without user interaction.)

## 6. Export / import & migration (#6)

- Export = **single `.json`** with `schemaVersion`; backgrounds embedded as base64; favicons never remote URLs.
- Import = **full replace** with explicit confirmation (no merge in v1); invalid/oversized favicons are dropped field-wise (the link survives).
- Migration: `schemaVersion` **newer** than supported → **refuse** (current data untouched); **older** → run sequential migrations (`1→2` fills workspace appearance and per-block settings; `2→3` fills `linkStyle: "list"`; `3→4` fills `openWorkspace: "first"` and `collapsed: false`); **equal** → accept.

## 7. Non-goals for v1 (fog carried forward)

Not in v1 (revisit as later versions / fresh efforts):

- **Remote sync** (v2 direction): backend choice, conflict resolution, relation to the export schema.
- **Browser-extension packaging** (new-tab override) as a future distribution form.
- Multiple kanban boards per workspace.
- Custom search shortcuts (`g …`, `yt …`).
- IndexedDB fallback if localStorage quota proves too tight for backgrounds.
- Partial / merge import semantics.
- Automatic backup prompts (periodic export nudges).
- i18n beyond English.
- Additional homepage widgets (clock, weather, notes).

## 8. Out of scope (by the map's destination)

- **Implementation of Stargate itself** — this spec is the handoff; the build happens in implementation sessions.
- **Remote sync infrastructure in v1** (ruled a v2 direction).
