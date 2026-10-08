# Stargate — Deploy

How to deploy (and re-deploy) Stargate to GitHub Pages. Repo: `Futura75/Stargate` (public).

## TL;DR

- Static Vite + Svelte 5 + TypeScript app. Deploy is **fully automated** via GitHub Actions.
- Live site: https://futura75.github.io/Stargate/
- **Any push to `main` redeploys.** Nothing else is needed.

## How to deploy

1. Make the change, commit on `main`, push:

   ```bash
   git push origin main
   ```

   (Manual alternative: `gh workflow run deploy.yml`, or the repo's Actions tab → "Deploy to GitHub Pages" → Run workflow.)

2. Monitor (optional):

   ```bash
   ci_find workflow=deploy expected_sha=<full-40-char-sha>
   ci_watch workflow=deploy run_id=<id>
   ```

3. The site updates ~30–60 s after the run goes green.

## The workflow

`.github/workflows/deploy.yml`: on push to `main` → `npm ci` → `npm run check` → `npm test` → `npm run build` → upload `dist/` → `deploy-pages`.

Typecheck and tests run in CI and **block the deploy** if they fail.

## Critical gotchas (do NOT regress)

- `base: "./"` in `vite.config.ts` is required: the site is served at `/Stargate/`, so assets must be **relative**. Removing it breaks asset loading on Pages (but not local `vite preview`).
- The repo must stay **public**: GitHub Pages on a private repo returns 422 on the free plan ("Your current plan does not support GitHub Pages for this repository").
- Pages source is "GitHub Actions" (`build_type=workflow`). Already enabled; if ever disabled, re-enable with:

  ```bash
  gh api -X POST repos/Futura75/Stargate/pages -f build_type=workflow
  ```

- Visibility changes require an extra flag:

  ```bash
  gh repo edit Futura75/Stargate --visibility public --accept-visibility-change-consequences
  ```

## Local commands (pre-push verification)

```bash
npm run dev     # http://localhost:5173
npm run check   # svelte-check typecheck (0 errors expected)
npm test        # Vitest
npm run build   # dist/
```

Run `check` + `test` + `build` before pushing — CI runs the same steps.

## Where things live

- Decision-locked spec: `SPEC.md` (repo root).
- Domain vocabulary: `GLOSSARY.md`.
- Testable seam: `src/store/` (pure `core.ts` mutations + `persistence.ts`; tests in `src/store/*.test.ts`).
- Issues: https://github.com/Futura75/Stargate/issues (parent spec #9; implementation tickets #10–#24, all closed).
