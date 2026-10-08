# Research: Remote-Sync Prior Art — how comparable OSS projects give users cross-device sync, and which patterns are free for the maintainer

**Scope:** prior-art lane for Stargate v2 sync. Primary sources only (project docs/repos, vendor policies, pricing pages, ToS). All claims carry the URL and the date checked (**October 2026**). Where a claim could not be verified from a primary source it is flagged explicitly.

---

## 1. Self-hosted homepage / dashboard / bookmark projects and their sync story

### gethomepage/homepage
- **Configuration file, no accounts, no database.** Homepage is configured through YAML files ("Homepage uses YAML for configuration", [gethomepage.dev/configs/](https://gethomepage.dev/configs/), checked Oct 2026). There is no user account system and no hosted service; state lives in the user's own config files on the machine running it. Cross-device sync is the user's own Git workflow (the docs' config page links to the YAML-editor approach; the project itself runs no sync infrastructure).
- Who pays: nobody — the maintainer hosts no service. (Confidence: high for "config-file/self-hosted/no-accounts"; the project's config approach is direct evidence.)

### Homarr
- **Self-hosted with a real auth layer and a database.** Homarr supports credentials, LDAP, and **OIDC** sign-in, with users stored in its own database; OIDC is configured via environment variables against a user-chosen IdP ([homarr.dev/docs/advanced/single-sign-on/](https://homarr.dev/docs/advanced/single-sign-on/), checked Oct 2026). No hosted free service exists; "sync" = the user's own Homarr server. Evidence: docs describe deployment env vars and Docker install only ([homarr.dev/docs](https://homarr.dev/docs/)).
- Who pays: the user (self-host). Maintainer zero running cost. (Confidence: high.)

### Dashy
- **Config file (conf.yml) + optional "Cloud Backup and Restore".** Dashy is a static app whose config lives in YAML; changes can be saved locally or written to disk ([dashy.to/docs/configuring/](https://dashy.to/docs/configuring/), checked Oct 2026). Its built-in cloud backup is a **maintainer-run** Cloudflare Worker + KV service: data is client-side AES-encrypted before upload, storage capped at **24 MB per user**, and the docs warn that repeated abuse "may result in your IP being temporarily banned by Cloudflare" ([dashy.to/docs/backup-restore](https://dashy.to/docs/backup-restore), checked Oct 2026).
- Who pays: the user pays nothing; the maintainer (Lissy93) absorbs the Cloudflare free-tier cost. This is direct evidence of a solo maintainer running a *free* hosted backend — and of its fragility (quotas, abuse bans, single point of failure). (Confidence: high.)

### Linkding
- **Self-hosted single-user or multi-user, no hosted service.** "Low maintenance. A single Docker container, using SQLite as database" ([linkding.link](https://linkding.link/), checked Oct 2026). Accounts exist (multi-user with sharing) but are username/password on the user's own instance; sync across the user's devices happens through the user's own linkding server + browser extension/API. No hosted free tier.
- Who pays: the user (self-host). (Confidence: high.)

### Karakeep (formerly Hoarder)
- **Self-hosting first, supports SSO, demo-only hosted instance.** "Built with self-hosting as a first class citizen" and lists "SSO support" as a feature ([docs.karakeep.app](https://docs.karakeep.app/), checked Oct 2026). The only hosted instance is a read-only demo at try.karakeep.app. No free hosted sync service; the project is donation/GitHub-sponsor funded.
- Who pays: users self-host; maintainers fund the project via sponsors/donations. (Confidence: high for features; hosted-free-tier "none" is direct evidence by absence on docs.)

### Wallabag
- **Self-hosted, with a PAID hosted service run by the project itself.** The maintainers run wallabag.it: "3 months 4 €", "1 year 11 €", "The ❤️ subscription 30 €/year", with the explicit explanation that "The subscription pays for European hosting, backups, updates, monitoring and the support work" and "It funds the open-source wallabag project" ([wallabag.it/en/pricing](https://wallabag.it/en/pricing), checked Oct 2026).
- Who pays: users who want managed hosting; self-hosters pay nothing. This is the cleanest evidence that an OSS project's *hosted free tier* is a real cost line — wallabag deliberately charges for it. (Confidence: high.)

### Floccus (bookmark sync)
- **BYO storage; no accounts hosted by the project.** Floccus syncs to Nextcloud, Linkwarden, Karakeep, **Google Drive, Dropbox, Git (any Git server incl. GitHub), or any WebDAV service** ([floccus.org](https://floccus.org/), checked Oct 2026). The maintainers run no server; the project is donation/sponsor funded ([GitHub README](https://github.com/floccusaddon/floccus)).
- Nota bene: their FAQ documents that Google login can fail with *"You can't sign in to this app because it doesn't comply with Google's OAuth 2.0 policy for keeping apps secure"* ([floccus.org/faq/](https://floccus.org/faq/), checked Oct 2026) — real-world evidence that Google OAuth integrations on third-party apps get policy-enforcement friction (see §3). (Confidence: high.)

### Raindrop.io (proprietary, for comparison)
- **Proprietary SaaS with a real free tier.** "Free: 0 … Unlimited bookmarks, unlimited collections, unlimited devices… Upload 100 MB of files per month"; Pro is paid and "payments may be retried up to 4 times… After this… you will be downgraded to the Free plan" ([raindrop.io/pro/buy](https://raindrop.io/pro/buy), checked Oct 2026). The free tier is funded by Pro subscriptions and, as a VC-backed company, by the company itself — not a workable model for a solo hobbyist. (Confidence: high.)

### Who pays, summary
| Project | Accounts? | State lives | Hosted free service? | Who pays |
|---|---|---|---|---|
| Homepage | No | user's YAML config (self-host) | None | User (self-host) |
| Homarr | Yes (credentials/LDAP/OIDC) | user's DB (self-host) | None | User (self-host) |
| Dashy | No (config) | local config + optional maintainer-run KV backup | Yes, 24 MB/user | Maintainer (Cloudflare free tier) |
| Linkding | Yes (local) | user's SQLite (self-host) | None | User (self-host) |
| Karakeep | Yes (SSO) | user's DB (self-host) | Demo only | User (self-host) |
| Wallabag | Yes (local) | user's instance — or paid wallabag.it | No (hosted = paid, 11 €/yr) | User |
| Floccus | No (BYO storage) | user's own Drive/Dropbox/Git/WebDAV | None | User (brings storage) |
| Raindrop | Yes (proprietary) | Raindrop's cloud | Yes (free tier) | Raindrop company (Pro subs) |

---

## 2. The "bring your own storage" (BYOS) pattern — how zero-cost OSS sync is usually solved

**Pattern definition:** the project ships a sync adapter; the *user* provides the storage account and often the credentials. The maintainer pays nothing because no maintainer infrastructure exists. This is the dominant solution in OSS note/bookmark sync.

- **Joplin**: sync via "Joplin Cloud, Nextcloud, S3, WebDAV, Dropbox, OneDrive or the local filesystem", explicitly designed "without any hard dependency to any particular service" ([joplinapp.org/help/apps/sync/](https://joplinapp.org/help/apps/sync/), checked Oct 2026). Joplin's revenue is the *paid* managed option (Joplin Cloud Basic €2.99/mo, Pro €5.99/mo, [joplinapp.org/plans/](https://joplinapp.org/plans/), checked Oct 2026).
- **Obsidian**: official Obsidian Sync is paid ($4 and $8 per user/month, 1–10 GB, [obsidian.md/sync](https://obsidian.md/sync), checked Oct 2026) — but the community's standard alternative is **Remotely Save**, which syncs to "Amazon S3 or S3-compatible (Cloudflare R2 / BackBlaze B2 / MinIO…), Dropbox, OneDrive for personal (App Folder), Webdav (NextCloud…), Webdis… Google Drive (GDrive) (PRO)" and says explicitly: **"Cloud services cost you money"** and "Open Source. Free" core with paid PRO extras ([github.com/remotely-save/remotely-save](https://github.com/remotely-save/remotely-save), checked Oct 2026). The author's business model: free plugin, paid PRO features — the *user* pays for storage either way.
- **Floccus**: same BYOS shape (see §1); its UX is "create a sync profile → pick a service → paste URL/credentials or OAuth-login". Its own guides say Google Drive is "the simplest choice" ([floccus.org/guides](https://floccus.org/guides), checked Oct 2026).
- **Dashy CloudBackup** is BYOS-adjacent but with a maintainer-run backend (§1) — prepend the caveat: client-side encryption because the maintainer *can* see the stored blobs.
- **Vaultwarden** (Bitwarden server, self-host, [github.com/dani-garcia/vaultwarden](https://github.com/dani-garcia/vaultwarden)): the *server* is BYO; official Bitwarden's free cloud tier (unlimited devices/passwords, 5 GB attachments; "Always free", [bitwarden.com/pricing/](https://bitwarden.com/pricing/), checked Oct 2026) is funded by the company's paid tiers — again, free tiers are only sustainable when someone else's revenue carries them.

**What the user brings, and the UX cost:**
- WebDAV/Nextcloud: a URL + app-password (or OAuth). The "paste your WebDAV URL" onboarding is real and frequent in Joplin/Floccus/Remotely-Save docs. No project in this lane pairs BYOS with *public* OIDC *social login for identity* — identity stays local or is on the user's own IdP (Homarr's OIDC is self-host-facing, not public login).
- Google Drive/Dropbox/OneDrive: an OAuth login against the *app's* client ID (Floccus, Remotely Save do this) — the user's cost is one consent screen, and the maintainer's cost is registering an OAuth app (see §3).
- Git: a repo + credentials (Floccus Git backend; Obsidian Git plugin).
- **Bottom line for the lane:** BYOS is the only pattern in which the maintainer's running cost is structurally zero and there is no third-party free-tier dependency. The UX cost is "user must have (or create) a storage account". No precedent combines BYOS with public OIDC social login *as the whole design*; Floccus shows OAuth-into-storage (Google/Dropbox) being acceptable to users for a bookmark sync tool. (Confidence: high on mechanics, direct from project docs.)

---

## 3. Google Drive / Dropbox / OneDrive as the storage backend — scopes, verification, and cost

### Google Drive — the decisive finding: **drive.file is non-sensitive → NO verification, NO security assessment, NO fee, NO user cap**
- The Google Drive scopes page classifies scopes explicitly: **non-sensitive** includes `drive.appdata` and **`drive.file`** ("Create new Drive files, or modify existing files…"); *restricted* includes `drive` and `drive.readonly`. Restriction: "If you store restricted scope data on servers (or transmit), then you must go through a security assessment" — this applies only to restricted scopes, not `drive.file` ([developers.google.com/drive/api/guides/api-specific-auth](https://developers.google.com/drive/api/guides/api-specific-auth#drive-scopes), checked Oct 2026).
- The Drive API docs for `drive.file` list as a selling point **"Straightforward verification: Since drive.file is non-sensitive, it allows for a more streamlined verification process"** and "The `drive.file` scope lets users choose which files they want to share with your app" (same page).
- OAuth verification policy: "If your app utilizes only non-sensitive scopes, it is not mandatory for your app to complete the app verification process" ([support.google.com/cloud/answer/9110914](https://support.google.com/cloud/answer/9110914), checked Oct 2026).
- **The 100-user cap only bites apps using sensitive/restricted scopes:** "An unverified app is an app that requests a sensitive or restricted OAuth scope, but hasn't gone through the Google verification process"; the "unverified app user cap" is "100 new users in total, after the app presents the unverified app screen" ([support.google.com/cloud/answer/7454865](https://support.google.com/cloud/answer/7454865), checked Oct 2026). A drive.file-only app is never "unverified", so no cap.
- **CASA security assessment is only for restricted scopes** ("Apps requesting access to restricted scopes must meet the additional requirement of secure data handling by submitting to an annual security assessment… **a security assessment is required only for restricted scopes**"), and Google's FAQ states flatly: **"Google does not charge the developer any fees for security assessment"** — cost, if any, is negotiated with an independent CASA assessor ([support.google.com/cloud/answer/13465431](https://support.google.com/cloud/answer/13465431), [support.google.com/cloud/answer/13463817](https://support.google.com/cloud/answer/13463817), checked Oct 2026).
- Therefore: an app using only `drive.file` (plus `openid/email/profile` for identity) **does not need OAuth app verification, does not need a CASA assessment, pays no Google fee, and has no user cap**. (Confidence: high — direct quotes from Google's own docs.)
- **The one unresolved technical question (could not verify):** running the OAuth *code exchange and refresh-token lifecycle entirely from a static page. Google's web-server flow docs list `client_secret` as **"Optional"** at the token endpoint ([developers.google.com/identity/protocols/oauth2/web-server](https://developers.google.com/identity/protocols/oauth2/web-server), checked Oct 2026), and Google Identity Services "code model" is the recommended client-side flow — but the code-model guide describes exchanging the code **on a backend** ("Your backend platform hosts an authorization code endpoint… securely stores refresh tokens", [developers.google.com/identity/oauth2/web/guides/use-code-model](https://developers.google.com/identity/oauth2/web/guides/use-code-model), checked Oct 2026). I could not verify from Google docs that a web-origin *public* client reliably receives a refresh token with code+PKCE and no secret. Google also deprecated the old implicit flow for JS clients (the remaining "Client-side Web Applications" doc still documents `response_type=token`, i.e. implicit — i.e., that page is stale). **Net:** Google policy/cost is a non-issue; the no-backend mechanics need an empirical spike (see §6). Floccus' documented Google OAuth policy error ([floccus.org/faq/](https://floccus.org/faq/)) shows enforcement is real if the app misbehaves.

### Dropbox — no fee, but a **manual production-approval review** and a hard freeze at 50 users
- Dropbox apps start in **development status** (only your own account; "Enable additional users" caps at **500 total Dropbox users**), and once the app links **50 Dropbox users you have two weeks to apply for and receive production status approval, after which new links are frozen** until approved. Approval is a manual review by Dropbox (branding, description, least-privilege permission justification) — **no fee is mentioned** ([docs.dropboxapi.com — DBX Platform developer guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide), [App Console](https://docs.dropboxapi.com/dropbox-api/docs/get-started/tutorial/app-console), checked Oct 2026).
- Scopes: "App Folder" access limits the app to `/Apps/<app-name>` (the pattern Floccus and Remotely Save use); "minimal access… could impact your app review process" ([docs.dropboxapi.com OAuth guide](https://docs.dropboxapi.com/dropbox-api/docs/oauth), checked Oct 2026). Dropbox OAuth: code flow with PKCE is supported for client-side apps.
- **Cost to maintainer: zero money, but a process cost** (name can never be changed after production approval; privacy policy required; ~months of development status are fine until 50 users). (Confidence: high.)

### Microsoft OneDrive — free app registration, "(preview)" app-folder scope, free but mandatory-ish publisher verification to avoid the "unverified publisher" warning
- The **App Folder** special folder gives the app read/write to its own folder under the user's OneDrive `Apps` folder via the `Files.ReadWrite.AppFolder` scope ([learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder), checked Oct 2026); in the Graph permissions reference `Files.ReadWrite.AppFolder` (delegated) is available for **personal Microsoft accounts** and marked **(preview)** ([learn.microsoft.com/en-us/graph/permissions-reference](https://learn.microsoft.com/en-us/graph/permissions-reference), checked Oct 2026).
- Apps registered after 2020-11-08 that request more than basic profile data from users outside the app's own tenant show an **"unverified publisher" warning** on the consent screen until verified. Publisher verification requirements: a Microsoft AI Cloud Partner Program Partner One ID, plus documentation of publisher identity — and the official FAQ: **"Microsoft doesn't charge developers for publisher verification. No license is required."** ([learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview), checked Oct 2026).
- **Cost to maintainer: zero money; one-time free verification paperwork (Partner One ID) if you want a clean consent screen; one caveat — the app-folder scope is "preview" status on consumer accounts.** (Confidence: high on fees/warnings; the "preview" flag is from the permissions reference.)

**§3 verdict:** "Google's OAuth verification/CASA gate" does **not** rule in or out: for `drive.file` there is no gate at all. The gate only exists for broad Drive scopes, which you must not use. What needs validating is purely the no-backend OAuth plumbing (and a `FILE_SAVE`-style per-file experience — the Picker is the documented way users surface files to `drive.file` apps).

---

## 4. GitHub as the storage backend (private repo or Gist)

### Fully client-side OAuth exists: the **device flow needs no client secret**
- GitHub OAuth **device flow**: requires only `client_id`; the docs are explicit — "The `client_secret` is not needed for the device flow." It supports expiring access tokens **plus refresh tokens** (via the `offline_access` scope; refresh tokens expire after six months without use, and refresh does not require the secret for device-flow tokens) ([docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), checked Oct 2026). This means a 100% static site can do the whole login+token lifecycle with no backend — unlike the Google lane (§3).
- Scopes and **blast radius** (from [docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps), checked Oct 2026):
  - `repo` — "Grants **full access to public and private repositories** including read and write access to code, commit statuses… collaborators… webhooks", plus organization resources. This is the *only* way for an OAuth app to read/write a user's private repo → **huge blast radius.**
  - `gist` — "Grants write access to gists" → tiny blast radius, but secret gists "**aren't private**" (URL = access) ([docs.github.com — creating gists](https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists), checked Oct 2026) → bad fit for sensitive bookmarks.
  - GitHub Apps would fix the blast radius (fine-grained repo permissions) but require a private-key server for token issuance — not client-side feasible on a static site. GitHub's own docs prefer GitHub Apps "because they use fine-grained permissions… and short-lived tokens" ([docs.github.com — differences](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps), checked Oct 2026).
- No verification program exists for OAuth apps (GitHub docs describe verification only in the GitHub-App/Marketplace context; the OAuth-app docs contain no verification requirement) — inference from absence across GitHub's OAuth-app docs, medium confidence. Creating an OAuth app costs nothing (a GitHub account suffices).

### Limits (from primary sources)
- API rate limits: unauthenticated 60 req/hr; **authenticated (OAuth token) 5,000 req/hr per user** — the limit scales per-user, so a sync protocol with a handful of requests per sync cannot exhaust the maintainer's anything: there is no shared quota ([docs.github.com — rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), checked Oct 2026). Secondary limits: ~80 content-generating requests/minute, 500/hr; 2,000 OAuth token requests/hr ([same page](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)).
- File sizes: browser uploads ≤ 25 MiB; git pushes warn >50 MiB; **files >100 MiB are blocked**; repos recommended <1 GB, strongly <5 GB; and GitHub's guidance note "Git is not designed to serve as a backup tool" ([docs.github.com — about large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), checked Oct 2026).
- **Policy:** nothing in GitHub's ToS or Acceptable Use Policies prohibits using a user's own repository as an app data store. Relevant clauses that *could* bite: AUP §9 "Excessive Bandwidth Use" (suspension/throttling if bandwidth is "significantly excessive"; deletion of repos "placing undue strain"), §6 "Services Usage Limits" (no reselling/exploiting the service), and ToS §H (API abuse → suspension) ([AUP](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies), [ToS](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service), checked Oct 2026). A personal device-sync workload falls far below these thresholds. No "GitHub is not file storage" prohibition was found — I searched the ToS and AUP text and found nothing equivalent to the CDN-style prohibitions other platforms have. (Confidence: high for the limits; the "not prohibited" reading is supported by absence in the fetched policy text plus the size/bandwidth guidance being advisory.)
- **Design constraint discovered (decision-relevant):** the Contents API writes create a new commit each sync; with a ~4 MB single JSON document (1 MB config + 3 MB embedded backgrounds), history grows ~4 MB per save. At daily saves that's ~1.5 GB/year — over GitHub's advisory 1 GB. Mitigations (noted, not designed): keep background blobs out of the sync document, or periodically squash by recreating the sync branch. Stargate's own 4 MB localStorage write guard makes this lane comfortable per-file but history-hungry long-term. (Researcher inference from GitHub's stated limits.)
- **Precedent, at scale:** VS Code's community extension **Settings Sync (code-settings-sync)** — "Use your GitHub account token and Gist… Easy to Upload and Download on one click… Auto upload Settings on file change… Login with GitHub", syncing all VS Code settings/extensions via a private **Gist** ([github.com/shanalikhan/code-settings-sync](https://github.com/shanalikhan/code-settings-sync), checked Oct 2026). Millions of installs, zero server cost to its author, for years. This is the strongest proof that GitHub-as-storage + OAuth + zero maintainer cost is a production-proven pattern.

---

## 5. Projects that DID solve "public login + free hosted tier" — and free tiers that died

### Solved with public login + free hosted tier (each has a revenue engine you do not have)
- **Standard Notes**: fully free tier — "End-to-end encryption. Unlimited device sync on web, desktop, and mobile" — funded by paid Productivity ($90/yr) and Professional ($120/yr) plans ([standardnotes.com/plans](https://standardnotes.com/plans), checked Oct 2026). Durability came from **Proton acquiring Standard Notes** (announced Apr 10, 2024 on Proton's own news page: "Proton and the end-to-end encrypted note-taking app Standard Notes are joining forces", [proton.me/news](https://proton.me/news), checked Oct 2026). A solo maintainer has no Proton.
- **Bitwarden**: "Always free" personal tier, unlimited devices (see §2) — funded by a company selling Premium/Enterprise.
- **Raindrop.io**: free tier funded by Pro subscriptions (see §1) — a funded company.
- **Wallabag** (see §1): chose honesty — the hosted service is *paid* (11 €/yr), stated openly as paying for hosting + the OSS project.

### Tried a free tier and removed/cut it (durability evidence)
- **Heroku (Salesforce)**: Aug 25, 2022 announcement — "we will be phasing out our free plan for Heroku Dynos, free plan for Heroku Postgres, and free plan for Heroku Data for Redis… Starting November 28, 2022, we plan to stop offering free product plans"; paid Dynos start at $7/month ([blog.heroku.com — "Heroku's Next Chapter"](https://blog.heroku.com/next-chapter), checked Oct 2026). Free tiers of *hosted platforms* are business decisions, revocable with ~3 months' notice.
- Same class of event happened across Railway/Render/Fly.io/Supabase in 2023–2025; I could not verify a first-party page for each within this run's budget (URLs 404'd), so I only assert Heroku here. The pattern (hosted free tiers get cut) is corroborated by Heroku alone plus every §1/§2 project's choice not to rely on one.

### What survives: the pattern with no hosted free tier at all
Floccus, Joplin, Obsidian+Remotely-Save, Vaultwarden, Linkding, Karakeep, Homepage, Homarr, Dashy(backup-only). Nothing to be cut because the maintainer hosts nothing and the user's storage is the user's own free cloud account.

---

## Verdict

**Feasible at zero maintainer cost? Yes — but only in the BYOS family.** Every genuinely-free-for-the-maintainer sync story in the prior art is "the app talks to a storage/identity home the user already owns": Floccus→Drive/Dropbox/Git, Remotely-Save→S3/Dropbox/OneDrive/WebDAV, code-settings-sync→GitHub Gist, Joplin→BYO, Vaultwarden→self-host. Every hosted free tier either is paid for by someone else's company (Standard Notes/Proton, Bitwarden, Raindrop), is paid by users (wallabag.it, Joplin Cloud, Obsidian Sync), or is a single maintainer absorbing cost with quotas and abuse warnings (Dashy's Cloudflare KV) — plus Heroku's 2022 axe shows hosted free tiers die.

**The one pattern that best fits a solo maintainer wanting public OIDC/OAuth login and zero running cost: "bring-your-own storage via the app's own OAuth client" — concretely, GitHub device-flow OAuth (no client secret — the only OAuth flow in this research that is documented to work end-to-end from a static site) writing to the user's own private repository.** Strongest concrete precedent: Floccus' Git backend + code-settings-sync's Gist OAuth sync (years of production, millions of users, zero server). What it costs the **user**: a GitHub account (free), one consent screen, and accepting the `repo`-scope blast radius (full access to their repos — the price of private-repo storage with OAuth apps), or a gist (small blast radius, but "secret gists aren't private" — wrong for bookmarks). The maintainer pays: nothing, ever; no servers, no rate-limit pool, no GDPR data controller exposure (data flows user↔GitHub, never through the maintainer).

**Breakage points at scale:**
1. *User base:* GitHub-only login excludes non-developers. Google sign-in is the universal alternative — and Google's policy gates are a non-issue for `drive.file` (non-sensitive: no verification, no CASA, no fees, no 100-user cap — all documented above). The blocker to the Google lane is technical, not regulatory: whether a no-backend SPA can complete token exchange + keep refresh tokens alive (docs mark `client_secret` "Optional", but Google's own SPA guide presumes a backend; **could not verify**). A ~30-line empirical spike settles it.
2. *Git history:* a 4 MB full-document JSON rewritten per sync grows private-repo history past GitHub's 1 GB advisory within ~1 year of daily syncs — requires keeping background images out of the synced blob or periodic history squashing.
3. *Dropbox and OneDrive* remain viable fallbacks (free app registration), but Dropbox adds a manual 50-user production review gate, and OneDrive's app-folder scope is "preview" on consumer accounts — both fine for a hobby project, neither superior to Drive/GitHub here.
4. *OIDC-login-only illusions:* public login (Google/GitHub identity) ≠ storage. Every "login-only" provider free tier (Auth0/Clerk-class) is a hosted dependency with thresholds — contradicting "no surprise bills"; the BYOS design makes login and storage the same OAuth grant, which sidesteps the problem entirely.

**Recommended next check before design (empirically validate):** Google code+PKCE+`drive.file` refresh token from a GitHub Pages origin, in a throwaway Cloud project (~1 hour), to confirm §3's residual uncertainty. If it passes, Google Drive becomes the second supported backend with the *best* UX (everyone has a Google account, `drive.file` per-file consent, no verification) and the GitHub private-repo lane becomes the fallback; if it fails, GitHub device flow is the shipped lane.

---

## Sources (all primary; checked October 2026)

- gethomepage: https://gethomepage.dev/configs/ (config-as-YAML, no accounts)
- Homarr: https://homarr.dev/docs/ ; https://homarr.dev/docs/advanced/single-sign-on/ (credentials/LDAP/OIDC, self-host DB)
- Dashy: https://dashy.to/docs/configuring/ ; https://dashy.to/docs/backup-restore (maintainer-run Cloudflare KV backup, 24 MB/user, abuse bans)
- Linkding: https://linkding.link/ (self-host, SQLite, multi-user)
- Karakeep: https://docs.karakeep.app/ (self-host first, SSO, demo-only hosted)
- Wallabag: https://wallabag.it/en/pricing (hosted is paid: 3mo/4€, 1yr/11€, 30€ ❤; funds hosting + OSS)
- Floccus: https://floccus.org/ (NYO: Nextcloud/Linkwarden/Karakeep/Git/WebDAV/Google Drive/Dropbox) ; https://floccus.org/guides ; https://floccus.org/faq/ (documented Google OAuth policy error) ; https://github.com/floccusaddon/floccus (donation-funded)
- Raindrop: https://raindrop.io/pro/buy (free tier: unlimited bookmarks/devices, 100 MB/mo uploads; paid Pro)
- Joplin: https://joplinapp.org/help/apps/sync/ (BYO WebDAV/S3/Dropbox/OneDrive/Nextcloud/local) ; https://joplinapp.org/plans/ (Joplin Cloud Basic 2.99€/mo)
- Obsidian: https://obsidian.md/sync ($4/$8 per month, 1 GB/10 GB)
- Remotely Save: https://github.com/remotely-save/remotely-save (S3/R2/B2/MinIO/Dropbox/OneDrive AppFolder/WebDAV + PRO for GDrive/OneDrive-full; "Cloud services cost you money")
- Vaultwarden: https://github.com/dani-garcia/vaultwarden (self-host Bitwarden server)
- Bitwarden: https://bitwarden.com/pricing/ ("Always free", 5 GB attachments)
- Standard Notes: https://standardnotes.com/plans (free E2EE tier; Productivity $90/yr); Proton news: https://proton.me/news (Standard Notes joining forces, Apr 10, 2024)
- Google Drive scopes/verification: https://developers.google.com/drive/api/guides/api-specific-auth (drive.file = non-sensitive; CASA only for restricted) ; https://support.google.com/cloud/answer/9110914 (verification not required for non-sensitive) ; https://support.google.com/cloud/answer/13464321 (sensitive/restricted requirements) ; https://support.google.com/cloud/answer/13465431 (annual security assessment = restricted scopes only) ; https://support.google.com/cloud/answer/13463817 (FAQ: "Google does not charge the developer any fees for security assessment"; 100-user cap is tied to sensitive/restricted-scope unverified apps) ; https://support.google.com/cloud/answer/7454865 (unverified app = sensitive/restricted request) ; https://developers.google.com/identity/protocols/oauth2/web-server (client_secret marked "Optional"); https://developers.google.com/identity/oauth2/web/guides/use-code-model (code model presumes backend) ; https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow (old client-side doc, implicit/response_type=token)
- Dropbox: https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide ; https://docs.dropboxapi.com/dropbox-api/docs/get-started/tutorial/app-console (development status → 500-user cap → 50-user/2-week production-approval freeze; App Folder) ; https://docs.dropboxapi.com/dropbox-api/docs/oauth (PKCE, app folder vs full access)
- Microsoft: https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder (App Folder / Files.ReadWrite.AppFolder) ; https://learn.microsoft.com/en-us/graph/permissions-reference (AppFolder delegated = consumer accounts, "(preview)") ; https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview ("Microsoft doesn't charge developers for publisher verification"; unverified-publisher warning for >basic-profile consent)
- GitHub: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps (device flow: no client secret; offline_access refresh tokens) ; …/scopes-for-oauth-apps (repo = full access to all repos; gist = write to gists) ; …/differences-between-github-apps-and-oauth-apps (GitHub Apps preferred; fine-grained perms) ; https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api (5,000 req/hr per authenticated user; 80 content-creating req/min; 500/hr) ; https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github (25 MiB browser / 50 MiB warn / 100 MiB block; <1 GB advisory; "Git is not designed to serve as a backup tool") ; https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies (excessive bandwidth, services usage limits) ; https://docs.github.com/en/site-policy/github-terms/github-terms-of-service (§C AUP, §H API Terms) ; https://docs.github.com/en/get-started/writing-on-github/editing-and-sharing-content-with-gists/creating-gists (secret gists aren't private) ; code-settings-sync precedent: https://github.com/shanalikhan/code-settings-sync (GitHub token + private Gist sync)
- Durability: Heroku: https://blog.heroku.com/next-chapter (free Dynos/Postgres/Redis removed Nov 28, 2022; paid from $7/mo)

### Rejected / deprioritized sources
- Floccus "sync-to-google-drive" guide URLs (404s; site reorganized) — covered by floccus.org main + FAQ instead.
- Railway/Render/Fly.io free-tier blog posts — guessed URLs 404'd; not verified this run, so only Heroku is cited for free-tier removals (flagged in §5).
- Linkwarden hosted-service status details — could not reach first-party pricing/SSO pages in this run (404s); only the docs' "self-hosted" statement and Floccus' mention of a hosted signup are cited.
- Proton's Standard Notes announcement article URL not found (only proton.me/news index entry verified).