# Research: Identity for Stargate v2 sync — what "log users in with public OIDC/OAuth at zero cost, with (almost) no backend" actually requires

**Lane:** IDENTITY. **Question:** what does public-provider login for a fully static SPA (today: GitHub Pages, no backend, no cookies) require once a sync service is added?

**Method note:** primary sources only. Every claim below carries the vendor's own page as the citation. Pages were checked during this research run (session environment date ~October 2026; several pages carry explicit stamps: Google OAuth app-state overview "Last updated 2026-05-22", Cloudflare Workers "Limits" stamp 2026-10-08, Cloudflare D1/KV pricing stamp 2026-04-21, RFC 10017 dated August 2026, Apple docs copyright 2026). Quoted numbers were read on the vendor's current page, not from memory.

---

## 1. Provider inventory

### 1.1 Google (OIDC: yes, OpenID Certified; free; no verification needed for basic scopes — but read the consent/token rules)

- Google's OAuth 2.0 authentication conforms to OpenID Connect and is OpenID Certified, with a discovery document and ID tokens. (https://developers.google.com/identity/openid-connect/openid-connect — checked this run)
- What you register: a Google Cloud project → OAuth client ID (web/SPA or installed-app type) with redirect URI(s) and/or JS origins, plus an OAuth consent screen (app name, support email, home page, privacy policy). No paid plan or billing is required for OAuth sign-in.
- Verification: only if you request **sensitive or restricted** scopes. `openid`, `email`, `profile` are non-sensitive ("basic identity scopes"); the Google Cloud Console pre-fills them as non-sensitive. (https://developers.google.com/identity/protocols/oauth2/scopes; https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification — checked this run)
- **State-machine facts that matter (https://developers.google.com/identity/protocols/oauth2/production-readiness/overview — checked this run):**
  - External app in `Testing`: normally limited to up to 100 explicitly added test users (https://support.google.com/cloud/answer/15549945). **Exception, documented explicitly: "If the app only requests basic identity scopes (`openid`, `email`, `profile`), any user can access without being on the allowlist."** Users see a "this app is in testing" warning UI.
  - `In production`: any Google Account user can sign in. The "unverified app" warning screen and the **100-user hard cap apply only to apps requesting sensitive or restricted scopes** (https://support.google.com/cloud/answer/7454865 — checked this run).
- Refresh-token trap: a Google Cloud project with user type External + publishing status `Testing` gets refresh tokens that **expire after 7 days — unless the only scopes are `openid`/email/profile (userinfo.email/profile) or their OIDC equivalents**. (https://developers.google.com/identity/protocols/oauth2 — checked this run)
- Stable id + email: `sub` = "An identifier for the user, unique among all Google Accounts and never reused"; Google explicitly says "Use `sub` within your application as the unique-identifier key for the user." `email`: "The value of this claim may not be unique to this account and could change over time, therefore you shouldn't use this value as the primary identifier" (with `email_verified` claim). (https://developers.google.com/identity/openid-connect/openid-connect — checked this run)
- Token exchange: for "web server" apps the token endpoint expects `client_secret`; for installed-app clients the secret is optional and PKCE is supported (https://developers.google.com/identity/protocols/oauth2/native-app — checked this run). For SPAs, Google's current documentation (Google Identity Services "code model") is explicit that the code exchange happens on **your backend** and refresh tokens are stored server-side (https://developers.google.com/identity/oauth2/web/guides/use-code-model — checked this run). Google's client-side web-apps doc states the OAuth 2.0 authorization endpoint "does not support Cross-Origin Resource Sharing (CORS)" (form-post pattern) (https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow — checked this run).
- Embedded-webview ban: "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent under the developer's control." (https://developers.google.com/identity/protocols/oauth2/policies — checked this run) The error `disallowed_useragent` is returned when the flow runs inside e.g. WKWebView; Google directs developers to use external browsers/AppAuth instead. (https://developers.google.com/identity/protocols/oauth2/native-app; https://support.google.com/faqs/answer/12284343 — checked this run)
- Google deprecated the OAuth Out-of-band (OOB) flow (blocked for new clients Feb 28 2022) and the loopback-IP authorization flow for iOS/Android/Chrome clients (blocked Mar 14 2022) — don't build either. (https://developers.googleblog.com/making-google-oauth-interactions-safer-by-using-more-secure-oauth-flows/ — checked this run)

### 1.2 GitHub (OAuth2 only — **no OIDC, no ID tokens**; free; client secret is required even with PKCE)

- GitHub OAuth Apps issue access tokens, not ID tokens. Identity comes from the REST APIs (`GET /user` → `id`, `login`; `GET /user/emails` with `user:email` scope → all emails with `primary`/`verified` flags). The authorized-OAuth-apps flow documentation contains no id_token at all. (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps — checked this run)
- GitHub's only OIDC implementation is **workload identity for Actions → cloud providers** (subject is a workflow/job, not a user login): "OpenID Connect allows your workflows to exchange short-lived tokens directly from your cloud provider." (https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect — checked this run)
- **Email trap (verified in the API schema):** `GET /user` returns `email: string or null`. "If you do not set a public email address for email, then it will have a value of null." The full email list (with `primary` and `verified` booleans) requires the `user:email` scope via `GET /user/emails`. (https://docs.github.com/en/rest/users/users; https://docs.github.com/en/rest/users/emails — checked this run)
- PKCE: `code_challenge`/`code_challenge_method=S256` are documented as "Strongly recommended" — yet **`client_secret` is still "Required" at the token exchange and "Required unless the token was generated using the device flow" at refresh** (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps — checked this run). Device flow needs no secret but is a headless UX, not an SPA pattern. Net: browser-only GitHub login is not possible; the exchange must run somewhere that holds the secret.
- Callback URLs: GitHub OAuth Apps take a single callback URL per app (optional wildcard matching); the `redirect_uri` parameter is optional and defaults to the first configured callback URL. (same doc — checked this run)
- No verification/approval process; free. Stable id = numeric `id` in `GET /user`, or `sub`-style claim if routed via a broker.

### 1.3 GitLab (OIDC: yes; free; PKCE **without** client secret documented; token endpoint has CORS — the only fully browser-native OIDC provider in this set)

- GitLab's OAuth 2.0 identity-provider API documents: **Authorization Code + PKCE** ("makes it possible to securely perform the OAuth exchange … on public clients without requiring access to the Client Secret at all. This makes the PKCE flow advantageous for single page JavaScript applications"), the `/oauth/userinfo` endpoint, and — critically — **CORS support on `/oauth/token`, `/oauth/revoke`, `/oauth/userinfo`** including preflight. (https://docs.gitlab.com/api/oauth2/ — checked this run)
- App registration is free under the maintainer's GitLab.com user account (`/user_settings/applications`); scopes include identity/openid-style scopes; no approval process. (https://docs.gitlab.com/api/oauth2/ — checked this run)
- 2024–2026 changes: Resource Owner Password grant (ROPC) deprecated and being disabled on GitLab.com; PKCE slated to become mandatory (GitLab deprecations/breaking-change tracker). (https://docs.gitlab.com/update/deprecations/; https://gitlab.com/gitlab-org/gitlab/-/work_items/457352 — checked this run). The 2023 "OAuth connections" deprecation was about GitLab's *own inbound* integrations, not about GitLab acting as an IdP.
- Caveat: the refresh-token example in the same doc sends `client_secret`; whether refresh without the secret is accepted under a PKCE-issued grant is **not documented** (flag).

### 1.4 Microsoft Entra ID (OIDC: yes; free; SPA PKCE flow is first-class, CORS enabled, public client must NOT use secrets)

- Microsoft identity platform supports "authorization code flow paired with PKCE and OpenID Connect … in Single-page web application (SPA)". Redirect URIs for SPAs must be typed `spa`; with that type, **cross-origin token exchange is allowed** (the token endpoint returns CORS for the registered SPA redirect origin) and **public clients "must not use secrets or certificates"**; client credentials are rejected in flows that present an `Origin` header. PKCE is **required** for SPAs. (https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow — checked this run)
- **Session trap (verified):** "For refresh tokens sent to a redirect URI registered as `spa`, the refresh token expires after 24 hours … apps must be prepared to re-run the authorization code flow using an interactive authentication … This is due to privacy features in browsers that block third party cookies." (same doc — checked this run)
- Free: app registration is free; personal Microsoft accounts are supported via the `/common` or `/consumers` tenants. Entra External ID (the CIAM product) is "free for the first 50,000 MAUs". (https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/ — checked this run)
- Stable id: `sub` (with `iss`, `tid`, `oid` claims); email is changeable.

### 1.5 Apple / Sign in with Apple (OIDC: yes; **not free** — USD 99/year membership; client secret required, rotates ≤6 months; heavy setup)

- Membership: "The Apple Developer Program is 99 USD per membership year" (https://developer.apple.com/programs/whats-included/ — checked and found verbatim in page HTML this run; also https://developer.apple.com/programs/enroll/).
- Web setup requires: an existing app in the App Store with Sign in with Apple enabled; a Services ID with **registered and verified domains/return URLs** (return URL must be absolute https, no IP/localhost); a Sign in with Apple private key; Private Email Relay requires SPF/DKIM-registered outbound sources. (https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple — checked this run via Apple's docs data endpoint)
- Token validation requires a **`client_secret` JWT** at `POST https://appleid.apple.com/auth/token`: `alg` ES256, `kid`, `iss` = Team ID, `iat`, **`exp` max 15777000 seconds (six months)**, `aud` = https://appleid.apple.com, `sub` = App ID/Services ID. "It's an error to request an expiration time more than 15777000 seconds (six months) in the future." (https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens and https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret — checked this run via Apple's docs data endpoints)
- Email privacy: users can opt into anonymous relay email ("users who opt to use an anonymous email address with Sign in with Apple") — relay addresses are per-app and must not be used as account keys (same "Configuring your environment" doc — checked this run).

### 1.6 Discord (OAuth2 only — no OIDC; free; client secret required; no documented PKCE)

- Discord documents OAuth2 grants (authorization code, implicit, client credentials); the code-grant access-token exchange examples use HTTP Basic with **client_secret**, and there is **no PKCE in the docs**. Identity comes from `GET /users/@me` with `identify` (+ `email`) scopes; stable id = snowflake `id`. (https://docs.discord.com/developers/topics/oauth2 — checked this run)
- The token/authorization endpoints' CORS behavior for browsers is **not documented** by Discord (community reports of CORS failures exist; flagged as unverified, not cited).
- Free app registration in the Developer Portal; not OIDC; treat like GitHub (server-side exchange, API-based identity).

### 1.7 Others (brief)

- Facebook: OAuth2, not OIDC; historically requires app review/verification for public use — not deep-dived, mark as unverified before adopting.
- Provider shortlist conclusion (above): **OIDC-native with free self-service and zero paid prerequisite: Google, Microsoft Entra ID, GitLab.** OAuth2-only but free: **GitHub, Discord** (both require a secret → server side). **Apple works but costs USD 99/year and has the heaviest setup**; only sensible if the maintainer already has an Apple Developer account.

---

## 2. The protocol shape a browser-only app can use (Authorization Code + PKCE as a public client)

- Standard basis: RFC 7636 (PKCE exists precisely because "OAuth 2.0 public clients utilizing the Authorization Code Grant are susceptible to the authorization code interception attack"; code_challenge binds the code) — https://www.rfc-editor.org/rfc/rfc7636 (checked this run). RFC 9700 (OAuth 2.0 Security BCP, January 2025): **"Public clients MUST use PKCE"** for the authorization code grant — https://www.rfc-editor.org/rfc/rfc9700 (checked this run).
- Browser-specific companion BCP is now **RFC 10017, "OAuth 2.0 for Browser-Based Applications" (BCP 212, August 2026)** — https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/ resolves to RFC 10017 (checked this run). It documents three architecture patterns (Backend-for-Frontend, Token-Mediating Backend, Browser-Based OAuth Client), token-storage options (cookies / service worker / in-memory / persistent storage), and the XSS theft model. Its §4 states current best practice is auth-code + PKCE (CORS now makes the cross-origin token POST possible).
- **Provider-by-provider browser-only feasibility (can the SPA exchange the code itself?):**
  - **GitLab — yes (documented):** PKCE exchange without client secret + CORS on `/oauth/token`. (https://docs.gitlab.com/api/oauth2/ — checked this run)
  - **Microsoft Entra ID — yes (documented):** SPA redirect type enables CORS-enabled token exchange; public client, no secret allowed. (https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow — checked this run)
  - **Google — PKCE supported for installed-app clients (secret optional), but the current SPA guidance says the exchange happens on your backend; token-endpoint CORS for arbitrary origins is not documented.** Treat as "needs mediation or empirical verification". (https://developers.google.com/identity/protocols/oauth2/native-app; https://developers.google.com/identity/oauth2/web/guides/use-code-model — checked this run)
  - **GitHub — no:** `client_secret` required at exchange and refresh. (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps — checked this run)
  - **Apple — no:** `client_secret` required at `appleid.apple.com/auth/token`. (checked this run, §1.5)
  - **Discord — no:** client_secret required; PKCE undocumented. (checked this run, §1.6)
- **What the serverless function must do at minimum** (this is the whole "backend"): (a) receive the authorization code (either as the redirect target, or the SPA forwards the code it obtained); (b) exchange code (+PKCE verifier) at the provider token endpoint, presenting the client secret where the provider requires one; (c) validate the ID token (see below); (d) mint an opaque session (random 256-bit value) stored server-side; (e) set the session cookie; (f) optionally hold the provider refresh token server-side to get new access/id tokens in the background.
- **Is ID-token validation still needed when *your server* does the code exchange? Yes.** OIDC Core §3.1.3.7 (ID Token Validation) mandates the client validate the ID token (signature via the provider's JWKS, `iss`, `aud`, `exp`, and `nonce` for replay binding) — validation is a client obligation regardless of who performed the exchange. (https://openid.net/specs/openid-connect-core-1_0.html — checked this run) A second, practical reason: GitHub/Discord issue no ID token, so identity must be fetched from their APIs and the same care (TLS + provider-bound call) applies. Note: a common shortcut — trusting an id_token received over a mutually-authenticated TLS channel from the AS with your own client secret — is exactly the reasoning Google's docs give for its server flow ("since you are communicating directly with Google over an intermediary-free HTTPS channel and using your client secret … you can be confident that the token you receive really comes from Google"); rely on it only if the token never leaves the trusted server path.

---

## 3. Sessions and expiry

- Provider token lifetimes (all read on vendor docs this run): Google access ~1 h with refresh, refresh expires after 6 months of no use, cap ~100 refresh tokens per user/client, plus the 7-day rule for Testing apps with non-basic scopes (https://developers.google.com/identity/protocols/oauth2); GitHub access 8 h with refresh (6-month idle expiry) when "expiring tokens" enabled (https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps); Entra SPA refresh tokens die after **24 h** (https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow); Apple 1 h access + refresh valid when used with a valid client_secret (https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens).
- **Minimum viable session design** for a sync service: do **not** put provider tokens in `localStorage`. OWASP: "Do not store session identifiers in local storage as the data is always accessible by JavaScript. Cookies can mitigate this risk using the `httpOnly` flag." (https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html — checked this run). RFC 10017 §5.1.2 documents "persistent token theft" by malicious JS as a real, undefeatable-by-rotation scenario; §8 covers token storage in the browser.
- Recommended shape: a **single server-issued opaque session** in an `httpOnly; Secure; SameSite=Lax` cookie (+ short CSRF protection where state changes matter), SPA and API on the **same site** so the cookie is first-party; the edge function keeps the provider refresh token server-side and refreshes in the background. Session lifetime ~30 days sliding; require fresh interactive auth only when the provider forces it (Entra's 24 h SPA refresh rule means Entra users get a silent, top-level-frame re-login roughly daily — that's Microsoft-documented behavior to plan for, not a bug in the design).
- Trade-offs (why a cookie session beats bearer-in-localStorage): XSS-resistant bearer theft (OWASP quote above; RFC 10017 §5); no provider secret ever shipped to the client; revocation-by-server possible. Costs: server-side session table (D1/KV), CSRF care, and SameSite semantics. If you accept a browser wallet instead (Google-GIS-style access tokens in memory): shorter, but every token is XSS-stealable and refresh rotation in a pure SPA is exactly the attack surface RFC 10017 §5.1.2 documents. RFC 9700 §4.14.2 mandates that public clients' refresh tokens be **sender-constrained or rotated** — which is only enforceable when tokens never reach the browser. (https://www.rfc-editor.org/rfc/rfc9700 — checked this run)

---

## 4. Identity keys: (iss, sub) is the correct account key; email is not

- OIDC Core §5.7, "Claim Stability and Uniqueness": "The sub (subject) and iss (issuer) Claims from the ID Token, used together, are the only Claims that an RP can rely upon as a stable identifier for the End-User, since the sub Claim MUST be locally unique and never reassigned within the Issuer …. All other Claims carry no such guarantees across different issuers in terms of stability over time or uniqueness across users." (https://openid.net/specs/openid-connect-core-1_0.html — checked this run)
- Google's own docs say the same thing about email (§1.1); GitHub `email` can be `null` (§1.2); Apple emails can be per-app relay addresses (§1.5). Email is a contact/UX attribute, never the key.
- For non-OIDC providers (GitHub `id`, Discord `id`), treat `(provider-identifier, user-id)` as the same (iss, sub) tuple — normalize by prefixing, don't collide IDs across providers.
- **Account linking:** there is **no OIDC-standard protocol for linking two social identities to one account** — nothing in OIDC Core or RFC 9700 defines it (checked this run; both documents are silent on linking; vendors implement linking as a product feature — e.g., Auth0's own feature, which is **not available on Auth0's free tier**, https://auth0.com/pricing feature table, checked this run). Practical standard: store one row per (iss, sub); provide opt-in linking after verifying the emails match and the incoming session is authentic; never auto-link on email alone (account-takeover risk). Also note per-provider `sub` semantics: Google's `sub` is public (same across apps) unless pairwise is configured; Apple's `sub` is per Team+app; either is stable as long as you keep one app registration per environment.

---

## 5. Mobile / browser traps

- **Google + embedded webviews / in-app browsers:** explicitly banned by policy ("must not direct … an authorization request to an embedded user-agent"); the failure is the `disallowed_useragent` error, seen with WKWebView/CEF and other embedded UAs (§1.1). For a web/PWA app this means: always let the OS browser do the authorization (top-level navigation), never an iframe or an in-app webview shell. RFC 8252 §8.12 states flatly that native apps MUST NOT use embedded user-agents and the AS MAY block them — same principle applies browser-side. (https://www.rfc-editor.org/rfc/rfc8252 — checked this run)
- **Third-party cookies:**
  - Safari blocks **all** third-party cookies by default since 2020 (WebKit ITP "Full Third-Party Cookie Blocking"), and its developer guidance for the OAuth case is explicit: receive an authorization token via redirect, then "establish a first-party login session with a server-set Secure and HttpOnly cookie." (https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ — checked this run)
  - Chrome: as of April 22, 2025, Google decided **not to deprecate third-party cookies** and not to ship a standalone prompt; 3PC get blocked only in Incognito. (https://privacysandbox.google.com/blog/privacy-sandbox-next-steps — checked this run)
  - Consequence for session design: a **cookie-based session works if SPA and sync API are same-site** (first-party cookie). If the SPA stays on `futura75.github.io` and the sync API lives on a different domain, the session cookie is third-party → broken in Safari iframes and fragile elsewhere; the WebKit-documented workaround (top-level redirect + first-party session) only works when you own a domain serving both. **Architectural implication: move the SPA to a custom domain alongside the API (e.g., Cloudflare Pages/Workers on one site), or accept token-in-memory with periodic re-auth.**
- **PWA/standalone mode:** WebKit's ITP 7-day cap on script-writable storage ("Indexed DB, LocalStorage, … deleted after seven days of Safari use without user interaction") explicitly does not apply to web apps added to the Home Screen, which track their own usage (https://webkit.org/blog/10218/... — checked this run). Since the recommended session is a cookie (not script storage) plus a server refresh, PWA persistence of the app's local DB is fine for installed users; uninstalled/Safari users hit the 7-day ITP eviction for `localStorage`-only state (relevant to Stargate's current local-only model, unaffected once sync exists).
- **RFC 8252 native-app modeling:** Stargate is a web app, so native-app loopback/custom-scheme redirects don't apply; the reusable parts are the external-user-agent rule and PKCE (§2). RFC 10017 is the web counterpart of §5. (checked this run)

---

## 6. Build vs buy at zero cost

All free-tier figures below were read on the vendor's own page during this run (dates in header note).

| Option | Free tier (vendor page) | Credit card? | Social login in free tier? | Residency / lock-in |
|---|---|---|---|---|
| **Roll-your-own** (one edge function + key/value or SQL storage on a free JS/edge platform) | Cloudflare Workers Free: 100,000 requests/day, 10 ms CPU (https://developers.cloudflare.com/workers/platform/limits/); D1 Free: 5,000,000 rows read/day, 100,000 rows written/day, 5 GB total storage (https://developers.cloudflare.com/d1/platform/pricing/); KV Free: 100,000 reads/day, 1,000 writes/day, 1 GB (https://developers.cloudflare.com/kv/platform/pricing/) — all checked this run | No | n/a (you wire providers directly) | You choose region binding; zero vendor lock-in |
| **Supabase Auth + Postgres** | Free $0: 50,000 MAU/month (incl. third-party social logins), 500 MB database, 5 GB egress, 500k edge-function invocations; **free projects are paused after 1 week of inactivity**; 2 active projects (https://supabase.com/pricing; https://supabase.com/docs/guides/platform/free-project-pausing — checked this run) | Not stated on fetched page (could not verify) | Yes — all standard social providers on the free plan (https://supabase.com/docs/guides/auth/social-login — checked this run) | EU region (Frankfurt) selectable at project creation; Postgres export → low lock-in |
| **Auth0** | Free $0: up to 25,000 MAU; "No credit card needed to sign up"; Unlimited social connections; **Account Linking not available on Free** (needs Essentials+); 1 custom domain requires credit-card verification (https://auth0.com/pricing — checked this run) | No (for signup; yes for custom domain) | Yes, unlimited | Data residency is a paid feature (not verified on fetched page — flag); user export exists |
| **Clerk** | Hobby free: 50,000 MRU per app (retained users, "first day free"), no card, **social connections up to 3**, fixed 7-day session lifetime on free, 1-month grace period, user/data export documented ("Can I export my data? Absolutely!") (https://clerk.com/pricing — checked this run) | No | Yes, but capped at 3 connections | US-centric default (not verified — flag) |
| **Logto** | Free $0: up to 50,000 MAU, 50K tokens, no credit card; **pricing changed Sept 2025**: tokens cut 100k→50k, refresh tokens no longer counted (https://logto.io/pricing; https://blog.logto.io/pricing-sep-2025 — checked this run) | No | Yes | Logto OSS self-hostable (license not verified — flag) |
| **Zitadel Cloud** | Free: **100 Daily Active Users**; Pro from ~$100/mo for 25k DAU (https://zitadel.com/pricing — checked this run) | — | Yes (3 social IdPs per pricing detail table) | 100 DAU is too small for any real service — not viable for free-forever |
| **WorkOS AuthKit** | "First 1 million monthly active users free"; then $2,500 per additional 1M MAU (https://workos.com/pricing — checked this run) | Not stated on fetched page | Yes | US-centric (not verified — flag) |
| **Microsoft Entra External ID** | CIAM, free first 50,000 MAU (https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/ — checked this run) | Azure corporate account | Yes (it is a broker) | EU tenants available |
| **Self-hosted OSS** (Keycloak Apache-2.0 https://raw.githubusercontent.com/keycloak/keycloak/main/LICENSE.txt; Authentik core MIT https://raw.githubusercontent.com/goauthentik/authentik/main/LICENSE; Better Auth MIT https://raw.githubusercontent.com/better-auth/better-auth/main/LICENSE.md — all checked this run) | Unlimited users, no vendor fee | n/a | Yes | You run it — on a hobbyist budget that means a free edge platform + DB, which is exactly the roll-your-own path; Heavy Keycloak/Authentik are DB-backed apps, better suited to a VPS than edge functions |

**Verdict on 6:** buy tiers are all genuinely free at hobby scale (best ceilings: Supabase 50k MAU, Clerk 50k MRU, WorkOS 1M MAU), but each has a sharp edge for this use case (Supabase 1-week inactivity pause, Clerk 3-connection social cap + 7-day sessions on free, Auth0 free has no account linking, Zitadel's 100 DAU is disqualifying). Stargate needs only: login with 3–4 providers, a session, and identity claims — none of which justifies a vendor's whole user-management platform. **Build wins for control, GDPR data-minimization, and zero MAU ceiling: one edge function + a K/V or SQL store.** A reasonable buy fallback is Supabase (Auth + Postgres + object storage in one free project, EU region) if the cloud-wrangling is unwanted — the "paused after 1 week of inactivity" clause being the operational caveat.

---

## Verdict

**Yes — feasible at zero cost forever at hobby scale, with a single edge function.**

1. **Provider set a solo EU OSS maintainer can support for free on day one:** Google (OIDC, `openid email profile` only — no verification, no test-user ceiling for basic scopes, no "unverified app" screen because those scopes are non-sensitive), Microsoft Entra ID personal accounts (OIDC SPA, CORS-supported token endpoint), GitLab (OIDC, PKCE without secret), GitHub (OAuth2, `user:email`; needs the secret it forbids exposing → server side, which you have anyway). **Apple: only if the maintainer already pays the USD 99/year membership and has an App Store app + verified domain** — otherwise it violates the zero-cost constraint. Discord is optional (OAuth2-only, server-side).
2. **Smallest backend surface:** one Cloudflare Worker (~a few hundred LOC) with routes for `/auth/{provider}/start`, `/auth/{provider}/callback`, `/logout`, and the sync endpoints; session + sync records in D1 (or KV); ID-token/JWKS validation with a maintained library (e.g., `jose`). SPA and API on **one custom domain** (move off `futura75.github.io` or put a custom domain in front) so the session cookie is first-party and survives Safari's total third-party cookie blocking.
3. **Session:** opaque httpOnly+Secure+SameSite=Lax cookie; provider refresh token held server-side; refresh rotation per RFC 9700 §4.14.2; provider re-auth handled silently on top-level redirects (Entra's 24 h SPA refresh rule is the documented worst case).
4. **Account key:** `(iss, sub)` (+ provider `id` for GitHub/Discord); email is never the key. No email-based auto-linking.
5. **What forces paid infrastructure (measured on vendor pages this run):** passing ~100,000 edge-function requests/day; D1 exceeding 5 GB total storage, 5M rows read/day, or 100k rows written/day; KV exceeding 1,000 writes/day; or a hosted-auth vendor's MAU ceiling (Zitadel's 100 DAU is effectively never viable; Google's 100-user cap applies only to unverified sensitive-scope apps, which you will not have). **The specific scale breaker for Stargate is storage:** full-document sync snapshots embedding base64 background images (~up to ~4 MB/user) fill D1's free 5 GB around roughly ~1,000+ heavy users — mitigate by shipping backgrounds as content-addressed blobs (R2 free tier / decoupled from the config document) rather than inside every snapshot.
6. **GDPR note:** all signing data stays in your chosen EU region (Cloudflare D1 region binding / Supabase Frankfurt); no third-party cookies are ever set; the session cookie is first-party; provide export/deletion (already core to the product: .json export).

---

## Sources

All URLs used (primary sources; checked during this research run, ~October 2026; page stamps noted where the vendor exposes them):

- https://developers.google.com/identity/openid-connect/openid-connect — Google OIDC/ID-token claims (sub, email)
- https://developers.google.com/identity/protocols/oauth2 (Google OAuth2 overview incl. refresh-token expiry rules)
- https://developers.google.com/identity/protocols/oauth2/scopes — scope sensitivity classes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/overview — publishing/verification state table (stamp 2026-05-22)
- https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification — verification trigger for sensitive scopes
- https://support.google.com/cloud/answer/7454865 — unverified-app screen & 100-user cap
- https://support.google.com/cloud/answer/15549945 — publishing status / test users
- https://developers.google.com/identity/protocols/oauth2/native-app — PKCE, optional client_secret, disallowed_useragent
- https://developers.google.com/identity/oauth2/web/guides/use-code-model — SPA code flow, backend exchange
- https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow — CORS statement for the authorization endpoint
- https://developers.google.com/identity/protocols/oauth2/policies — no embedded user-agents
- https://support.google.com/faqs/answer/12284343 — OAuth-via-WebView remediation
- https://developers.googleblog.com/making-google-oauth-interactions-safer-by-using-more-secure-oauth-flows/ — OOB/loopback deprecations
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps — GitHub OAuth flows, PKCE + required client_secret, callback URL
- https://docs.github.com/en/rest/users/users — GET /user schema (email null)
- https://docs.github.com/en/rest/users/emails — GET /user/emails (user:email scope, primary/verified)
- https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect — GitHub OIDC = Actions workload identity only
- https://docs.gitlab.com/api/oauth2/ — PKCE without secret, CORS on /oauth/token & /oauth/userinfo
- https://docs.gitlab.com/update/deprecations/ — ROPC deprecation, PKCE mandatory
- https://gitlab.com/gitlab-org/gitlab/-/work_items/457352 — ROPC disablement on GitLab.com
- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow — SPA PKCE, CORS, secret prohibition, 24 h SPA refresh token
- https://azure.microsoft.com/en-us/pricing/details/microsoft-entra-external-id/ — first 50,000 MAU free
- https://developer.apple.com/programs/whats-included/ — "99 USD per membership year"
- https://developer.apple.com/programs/enroll/ — enrollment requirements
- https://developer.apple.com/documentation/signinwithapplerestapi/generate-and-validate-tokens — token endpoint, client_secret required
- https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret — client_secret JWT, exp ≤ 15777000 s
- https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple — Services ID, domain/return-URL verification, private relay
- https://docs.discord.com/developers/topics/oauth2 — grants, client_secret, scopes
- https://www.rfc-editor.org/rfc/rfc7636 — PKCE
- https://www.rfc-editor.org/rfc/rfc8252 — OAuth 2.0 for Native Apps (§8.12 embedded user-agents)
- https://www.rfc-editor.org/rfc/rfc9700 — OAuth 2.0 Security BCP (§2.1.1 public clients MUST use PKCE; §2.2.2/§4.14 refresh-token protection & rotation)
- https://www.rfc-editor.org/info/rfc10017 (rendered via https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/) — OAuth 2.0 for Browser-Based Applications, BCP 212 (Aug 2026)
- https://openid.net/specs/openid-connect-core-1_0.html — OIDC Core §2/§5.7 (sub/iss), §3.1.3.7 (ID token validation)
- https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ — Safari full 3PC blocking; home-screen exemption from 7-day cap
- https://privacysandbox.google.com/blog/privacy-sandbox-next-steps — Chrome 3PC decision (2025-04-22)
- https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html — don't store session ids in localStorage; httpOnly
- https://supabase.com/pricing — Free plan 50k MAU, 500 MB, egress, pausing
- https://supabase.com/docs/guides/platform/free-project-pausing — 1-week inactivity pause
- https://supabase.com/docs/guides/auth/social-login — free-tier social providers
- https://auth0.com/pricing — Free 25k MAU, no card, unlimited social connections, Account Linking only paid
- https://clerk.com/pricing — Hobby 50k MRU, no card, ≤3 social connections, 7-day sessions, export
- https://logto.io/pricing and https://blog.logto.io/pricing-sep-2025 — Free 50k MAU, no card, Sept-2025 token change
- https://zitadel.com/pricing — Free 100 DAU; Pro from ~$100/mo
- https://workos.com/pricing — AuthKit first 1M MAU free
- https://developers.cloudflare.com/workers/platform/limits/ — Workers Free 100k req/day (stamp 2026-10-08)
- https://developers.cloudflare.com/d1/platform/pricing/ — D1 Free limits (stamp 2026-04-21)
- https://developers.cloudflare.com/kv/platform/pricing/ — KV Free limits (stamp 2026-04-21)
- https://raw.githubusercontent.com/keycloak/keycloak/main/LICENSE.txt — Apache-2.0
- https://raw.githubusercontent.com/goauthentik/authentik/main/LICENSE — MIT core (+ enterprise dir)
- https://raw.githubusercontent.com/better-auth/better-auth/main/LICENSE.md — MIT

---

## Contradictions

- **Google verification messaging:** support.cloud answers (7454865, 9110914-series) say "You need to go through verification before you launch a user-facing app", while the production-readiness overview (2026-05-22) shows Testing-mode apps requesting only `openid/email/profile` usable by any user with a warning UI, and Published/External/Unverified apps usable by anyone (the unverified screen and 100-user cap applying only to sensitive/restricted-scope apps). Resolution consistent with both: verification is mandatory only for sensitive/restricted scopes; a basic-scope app can run in Testing (or be published) without verification, with degraded branding. Recorded, not silently resolved.
- **GitLab refresh tokens:** PKCE exchange works without the secret (documented), but the refresh-flow example sends `client_secret` — undocumented whether refresh without secret is accepted. Unresolved.
- **"GitLab.com dropped OAuth" (community lore) vs reality:** the 2023 deprecation was inbound "OAuth connections" for GitLab's integrations; GitLab.com remains an OAuth/OIDC provider for third-party apps (ROPC only is being removed). The deprecations tracker confirms ROPC and PKCE-mandatory changes.

## Missing evidence

- Google token endpoint CORS behavior for cross-origin SPA exchanges — not documented by Google; requires an empirical test.
- GitLab refresh-without-client-secret under PKCE — undocumented.
- Supabase free-plan credit-card requirement — not stated on the pages fetched.
- Auth0 free-tier data residency; WorkOS data residency; Logto OSS license — not verified.
- Facebook/LinkedIn provider verification burden — not deep-dived.
- GitHub REST rate-limit figures for OAuth user tokens (this run's doc fetch did not surface the current numbers).
- Apple privacy "Hide My Email": only the relay/SPF/DKIM requirements verified; per-app relay address stability claim not verified against Apple's own page.

## Next steps

1. Empirical CORS matrix: run a browser test exchanging codes at each provider's token endpoint from a test origin (GitLab, Entra expected to pass; Google to be confirmed). This decides whether the edge function is a pure "secret holder + validator" or also a proxy for the exchange.
2. Storage-shape decision for sync (delta snapshots vs blob-per-background vs R2) — this, not identity, is what determines when the free tier is exhausted (see Verdict #5).
3. Domain/architecture decision: move SPA to a custom domain on one Cloudflare site (enables first-party session cookie) vs staying on `futura75.github.io` (forces token-in-memory or a cross-site cookie workaround).
4. Maintainer input: does he already hold an Apple Developer Program membership? If no, drop Apple from the day-one provider set (cost + setup requirements).
5. Prototype the Worker + D1 session/identity store and confirm EU region binding availability on the free plan before committing the architecture.