# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Individuals who set Stargate as their browser start/new-tab page and use it as a personal daily driver: they glance at it many times a day to jump to a link or check a few tasks. Desktop browser is primary; mobile web should work.

## Product Purpose
Stargate is an open-source browser homepage: a cozy, simple start page for bookmarks and a kanban board. Success is a page people are happy to open dozens of times a day and that stays out of their way.

## Positioning
Cozy and simple, local-first and private, open source and static. Data lives in the browser (localStorage) and moves as a single JSON export/import; remote favicons can be turned off so no third party sees bookmarked domains; there is no account requirement. Optional Supabase sync exists but the app is fully usable without it. A hosted start-page service could not truthfully claim "no backend, your data stays in your browser".

## Operating Context
Set as the browser start/new-tab page, opened constantly for short glances. Edit affordances are hover-reveal and always available (no global edit mode). Users bring existing bookmarks via the Netscape bookmark HTML export from Chrome, Firefox and Edge. Reference deployment is GitHub Pages, redeployed on every push to `main`.

## Capabilities and Constraints
- Stack: Vite + Svelte 5 + TypeScript, fully static; no browser extension in v1. UI and docs are in English.
- Structure: workspaces (tabs, drag-reorderable) → columns → blocks → links; each workspace also has one kanban board (Todo / In Progress / Done by default; tasks with title, notes, due date).
- Per-block link styles: list, detail, tiles. Per-workspace icon, color and background image; global light/dark/system theme.
- Search: single default engine (Google, DuckDuckGo, Bing).
- Favicons: letter-tile base layer, uploaded icons, optional remote service tier (default Google S2).
- Optional Supabase sync (GitHub/other login); background images do not sync.
- Canonical terms are in `GLOSSARY.md` (Workspace, Column, Block, Link, Kanban board, Task); full behavior in `SPEC.md`.

## Brand Commitments
Name: Stargate. Tagline: "A simple and cozy homepage for your browser". No logo or brand assets are recorded yet.

## Evidence on Hand
Live demo at https://futura75.github.io/Stargate/. No testimonials, user counts or benchmarks exist; do not fabricate any.

## Product Principles
- Glanceable first: the page is opened constantly, so common actions are one click and nothing demands attention.
- Cozy and simple over feature-rich; new capability must not add clutter to the default view.
- The user's data is theirs: local by default, portable by export, remote services opt-out.
- No required account, no mode switches: editing is always available in place.

## Accessibility & Inclusion
Target WCAG 2.1 AA, with full keyboard operation and respect for reduced-motion preferences.
