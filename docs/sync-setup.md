# Stargate — Remote sync setup (Supabase)

Sync is optional: without the two `VITE_SUPABASE_*` settings the app builds and runs exactly as before (local-only, no Sync section in Settings). Design: `SPEC.md` §9.

## What syncs

- One row per user in `stargate_state`: links, blocks, columns, kanban, workspace settings, app settings (favicons included).
- **Background images do not sync yet**: they stay in the browser that added them (they are the bulk of the data and the free plan's limits).
- Conflicts: optimistic writes on a `revision` number. If two browsers edit at the same time, the one whose last edit is newer wins for the whole document.
- First sign-in in a browser whose account already has data: the account's data replaces the local data, with an **Undo** toast to keep the local copy instead (Undo uploads it).
- Signed out or offline, the app keeps working on localStorage; pending edits sync on the next sign-in/reconnect/tab focus.

## 1. Database (once)

Supabase → **SQL Editor** → New query → paste `supabase/schema.sql` → **Run**. It creates the `stargate_state` table, its Row Level Security policies, the `save_stargate_state()` function and enables Realtime on the table. Safe to re-run.

## 2. Login providers

Supabase callback URL for both providers: `https://<project-ref>.supabase.co/auth/v1/callback` (shown in Supabase → Authentication → Providers).

**GitHub**
1. GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App.
2. Homepage URL: `https://futura75.github.io/Stargate/`; Authorization callback URL: the Supabase callback above.
3. Generate a client secret; paste Client ID + Secret in Supabase → Authentication → Providers → **GitHub** → Enable.

**Google**
1. Google Cloud Console → APIs & Services → **OAuth consent screen**: External, app name "Stargate", your email; publish it (only basic scopes are used, no verification needed).
2. Credentials → Create credentials → **OAuth client ID** → Web application. Authorized JavaScript origins: `https://futura75.github.io`, `http://localhost:5173`. Authorized redirect URI: the Supabase callback above.
3. Paste Client ID + Secret in Supabase → Authentication → Providers → **Google** → Enable.

## 3. Redirect URLs

Supabase → Authentication → **URL Configuration**:
- Site URL: `https://futura75.github.io/Stargate/`
- Redirect URLs: `https://futura75.github.io/Stargate/`, `http://localhost:5173/`

## 4. App settings

Values from Supabase → Project Settings → **API**: Project URL and the **anon / publishable** key. Both are public by design (RLS protects the data). **Never** use the `service_role` / secret key.

- Local dev: copy `.env.example` to `.env.local` and fill it in (`.env.local` must stay out of git; Vite's `*.local` ignore covers it — check `.gitignore`).
- GitHub Pages build: repo → Settings → Secrets and variables → Actions → **Variables** → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Then in `.github/workflows/deploy.yml` give the build step the env:

  ```yaml
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
  ```

## 5. Keep the free project awake

Free Supabase projects pause after 7 days without activity. Daily use prevents it; otherwise add a scheduled workflow (e.g. `.github/workflows/keepalive.yml`):

```yaml
name: Supabase keep-alive
on:
  schedule: [{ cron: "17 6 * * *" }]
  workflow_dispatch:
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS "${{ vars.VITE_SUPABASE_URL }}/rest/v1/stargate_state?select=user_id&limit=1" -H "apikey: ${{ vars.VITE_SUPABASE_ANON_KEY }}" -o /dev/null
```

## 6. Try it

`npm run dev` → Settings → **Sync** → sign in with GitHub or Google. Open a second browser, sign in with the same account, change something in one and watch it appear in the other.
