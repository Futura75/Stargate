# Stargate

Stargate is an open-source browser homepage (a static web app): bookmarks and a kanban, stored entirely in the browser's localStorage and exported/imported as a single JSON file.

## Language

### Bookmarks structure

**Workspace**:
A named group of bookmark columns and a kanban board, with its own icon, color, and background.
_Avoid_: Profile, space, page

**Column**:
A vertical grouping of blocks in a workspace's Links view.
_Avoid_: Category, group, section

**Block**:
A card inside a column that groups related links.
_Avoid_: Card, folder, group

**Link**:
A single bookmark: a title and a URL, optionally with a stored favicon.
_Avoid_: Bookmark, tile, shortcut, entry

**Favicon**:
A small icon for a link, stored as a normalized 32×32 PNG data URL. When absent, a letter tile is shown.
_Avoid_: Icon (reserved for the workspace's own icon)

**Letter tile**:
A generated fallback: the first letter of a link's domain on a background hue derived from that domain. Always present as the base layer.
_Avoid_: Monogram, avatar, placeholder

**Link style**:
A per-block rendering mode for a block's links: `list` (favicon + title in rows), `detail` (favicon + title + URL second line), or `tiles` (large favicon + centered label). Defaults to `list`.
_Avoid_: View mode, layout, display

**Collapsed block**:
A block reduced to its header/title alone — its description, links, and inline add form are hidden until it is expanded. The collapsed/expanded state is persisted per block.
_Avoid_: Folded card, minimized group

### Kanban

**Kanban board**:
The per-workspace task board shown in the Kanban view; one board per workspace.
_Avoid_: Todo list, project board

**Kanban column**:
A vertical lane of tasks on a board, with an editable title and an order. Defaults to Todo / In Progress / Done.
_Avoid_: Lane, stage, status, list

**Task**:
A single item on a board: a title, optional notes, and an optional due date.
_Avoid_: Card, ticket, item, to-do

**Due date**:
A task's optional deadline, stored as a date-only string (`YYYY-MM-DD`), with no time component.
_Avoid_: Deadline (as a field name), date

### Appearance and global state

**Background**:
A workspace's optional background image (a compressed data URL) faded over the theme's surface color by an alpha value.
_Avoid_: Wallpaper, theme image

**Theme**:
The global light/dark/system appearance setting.
_Avoid_: Mode, appearance

**Settings**:
The global configuration: theme, search engine, favicon source, and startup behavior.
_Avoid_: Preferences, options, config

**Startup behavior**:
The setting that decides which workspace opens on load: the first workspace (`first`, default) or the last active one (`last`, remembered from `lastWorkspaceId`).
_Avoid_: Landing page, default workspace, session restore

### Export

**Export file**:
A single JSON file containing everything: an envelope with `schemaVersion`, app metadata, an export timestamp, settings, and all workspaces. Backgrounds and favicons are embedded as base64 data URLs.
_Avoid_: Backup, snapshot, dump

**schemaVersion**:
A version string (currently `"4"`) in the export envelope identifying the data format; used to migrate or refuse imports.
_Avoid_: Version (alone), format version

### Import

**Bookmarks import**:
The one-way, append-only import of a browser's Netscape bookmark HTML export: the user picks which top-level folders to convert, each into a new workspace (subfolders → blocks, links → links, ungrouped links → a "Generali" block). Existing workspaces are never modified and the schema is unchanged.
_Avoid_: Sync, merge, restore, migration
