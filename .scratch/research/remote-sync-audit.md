## Audit preamble

The four briefs were not at the paths given in my task (`.scratch/research/*.md` → ENOENT; `.scratch/research/` exists but is empty). I raised this as a blocker; the supervisor supplied the real artifact paths, and I audited those four files (`identity.md`, `hosting.md`, `sync-model.md`, `prior-art.md`). I did not modify any file and wrote nothing to disk.

Good-faith signal worth stating up front: every vendor page-stamp I could cross-check matched what the briefs cite (Workers Limits "Last updated Oct 8, 2026"; D1/KV pricing "Apr 21, 2026"; R2 pricing "Oct 1, 2026"). These briefs read the real pages. The problems I found are not fabrication — they are a stale price, one misattributed quote, and cross-lane inconsistency.

---

## 1. Verified claims (decision-critical)

Format: CLAIM | VERDICT | source I actually loaded

**One-time verification costs / gates**
1. Apple Developer Program is 99 USD per membership year | **CONFIRMED** | https://developer.apple.com/programs/enroll/ — "The Apple Developer Program is 99 USD per membership year." ⚠️ `identity.md` attributes this verbatim quote to `developer.apple.com/programs/whats-included/`; that page contains no price string. The claim is right, the cited page is wrong.
2. Sign in with Apple client secret JWT `exp` ≤ 15777000 s (6 months) | **CONFIRMED** (with source-quality caveat) | https://apple-docs.everest.mt/docs/accountorganizationaldatasharing/creating-a-client-secret/ (Apple-docs mirror) + https://docs.azure.cn/en-us/app-service/configure-authentication-provider-apple ("Apple doesn't accept client secret JWTs with an expiration date more than six months after the creation, or nbf, date") + better-auth docs. The genuine `developer.apple.com` page is JS-rendered and unfetchable; two independent parties quoting Apple agree on 15,777,000 s, so I accept the number but flag that no direct vendor fetch succeeded.
3. Google: non-sensitive scopes → verification not mandatory | **CONFIRMED** | https://support.google.com/cloud/answer/9110914 — "If your app utilizes only non-sensitive scopes, it is not mandatory for your app to complete the app verification process." (Brand verification still needed to show name/logo.)
4. Google 100-new-user cap applies only to sensitive/restricted unverified apps | **CONFIRMED** | https://support.google.com/cloud/answer/13463817 — "unverified apps that are accessing restricted or sensitive scopes have a 100 new-user cap."
5. `drive.file` is non-sensitive; security assessment only for restricted scopes | **CONFIRMED** | https://developers.google.com/drive/api/guides/api-specific-auth — `drive.file` listed under "Non-sensitive scopes"; "If you store restricted scope data on servers (or transmit), then you must go through a security assessment."
6. CASA: "Google does not charge the developer any fees for security assessment" | **CONFIRMED verbatim** | https://support.google.com/cloud/answer/13463817
7. Dropbox: 50 linked users → two weeks to obtain production approval or linking is frozen; 500-user development cap; no fee stated | **CONFIRMED verbatim** | https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide

**Non-OIDC quirks**
8. GitHub web flow: `client_secret` is **Required** at token exchange even with PKCE (PKCE merely "Strongly recommended") | **CONFIRMED** | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
9. GitHub device flow needs no secret; refresh also needs no secret for device-flow tokens; access token 8 h; refresh expires after 6 months without use | **CONFIRMED** | same page — "The `client_secret` is not needed for the device flow"; "Required unless the token was generated using the device flow"; "access token expires after eight hours, and the refresh token expires after six months without use."
10. GitHub `GET /user` returns `email: null` when no public email set; `user:email` scope needed for the full list | **CONFIRMED** | https://docs.github.com/en/rest/users/users — "If you do not set a public email address for email, then it will have a value of null."
11. Entra SPA refresh tokens die after 24 h | **CONFIRMED verbatim** | https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow — "For refresh tokens sent to a redirect URI registered as `spa`, the refresh token expires after 24 hours."
12. Google Testing-mode refresh tokens expire after 7 days unless only name/email/profile scopes | **CONFIRMED** | https://developers.google.com/identity/protocols/oauth2 (quoted: "…a refresh token expiring in 7 days, unless the only OAuth scopes requested are a subset of name, email address, and user profile") and https://developers.google.com/google-ads/api/docs/get-started/common-errors. Minor wording note: the docs' exemption is name/email/profile; the brief's mapping to "OIDC equivalents" is its own interpretation.

**Free-tier limits and exact numbers**
13. Workers Free: 100,000 requests/day (resets 00:00 UTC, error 1027), 10 ms CPU/request, 128 MB, no RPS cap, 50 subrequests | **CONFIRMED** | https://developers.cloudflare.com/workers/platform/limits/
14. D1 Free: 5 GB/account, 500 MB/database, 10 databases, 5M rows read/day, 100,000 rows written/day, 2,000,000-byte max row/BLOB, 100 KB max SQL statement | **CONFIRMED** | https://developers.cloudflare.com/d1/platform/limits/ + /d1/platform/pricing/
15. D1 over-limit behaviour is hard error, not throttle or bill; no egress charges | **CONFIRMED** | https://developers.cloudflare.com/d1/platform/pricing/ — "you will not be able to run queries against D1"; "There are no data transfer (egress) or throughput (bandwidth) charges."
16. KV Free: 100,000 reads/day, 1,000 writes/day, 1 GB, 25 MiB value, 512-byte key, 1 write/s to same key; eventually consistent, "not ideal for … atomic operations" | **CONFIRMED** | https://developers.cloudflare.com/kv/platform/limits/ + /kv/concepts/how-kv-works/ (the "60 seconds or more" and atomic-operations quotes are accurate)
17. R2 Free: 10 GB-month (Standard only), 1M Class A/mo, 10M Class B/mo, free egress, `DeleteObject` free | **CONFIRMED** | https://developers.cloudflare.com/r2/pricing/
18. D1 `eu` jurisdiction exists and can only be set at creation | **CONFIRMED** | https://developers.cloudflare.com/d1/configuration/data-location/ — "Jurisdictions can only be set on database creation and cannot be added or updated after the database exists."
19. Supabase Free: 500 MB DB, 50,000 MAU, 1 GB file storage, 5 GB egress, 2 active projects, **paused after 1 week of inactivity** | **CONFIRMED** | https://supabase.com/pricing — "Free projects are paused after 1 week of inactivity"; paid projects never paused.
20. Neon Free: permanent (not a trial), no card; 100 CU-hours/project; 1 GB/project + 20 GB account; 5-min scale-to-zero; CU/egress exhaustion suspends compute, storage-full blocks writes; now "Lakebase Postgres … from Databricks" | **CONFIRMED** | https://neon.com/pricing
21. Turso Free: 100 DBs, 5 GB, 500M rows read/mo, 10M rows written/mo, no card | **CONFIRMED** | https://turso.tech/pricing
22. Firebase Spark: exceeding a product's monthly free quota **shuts that product off for the rest of the calendar month**; no payment method required; Firestore free 1 GiB / 50k reads / 20k writes / 10 GiB egress; **max document 1 MiB** | **CONFIRMED** | https://firebase.google.com/docs/projects/billing/firebase-pricing-plans + https://firebase.google.com/docs/firestore/quotas
23. Render Free: spins down after 15 min idle, ~1 min spin-up, "Do not use them for production applications", Free Postgres expires 30 days after creation | **CONFIRMED verbatim** | https://render.com/docs/free
24. Fly.io has no free plan | **CONFIRMED** (the specific "≈$2.19/30 days" figure is NOT verified) | https://fly.io/pricing/ — page lists only per-second metered pricing and paid Postgres plans.
25. GitHub secondary limits: 80 content-generating req/min, 500/hr, 2,000 OAuth token requests/hr; primary 5,000 req/hr per authenticated user | **CONFIRMED** | https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
26. Heroku: free Dynos/Postgres/Redis phased out, "Starting November 28, 2022"; dynos from $7/mo | **CONFIRMED verbatim** | https://blog.heroku.com/next-chapter
27. Safari blocks all third-party cookies by default; ITP deletes script-writable storage after 7 days without interaction; home-screen web apps are exempt | **CONFIRMED verbatim** | https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/
28. Cloudflare SSA: no non-commercial clause; Free Services terminable "in our sole discretion" with no liability; §2.2.1(h) credit-card clause | **CONFIRMED** | https://www.cloudflare.com/terms/ — I searched the fetched SSA text for "non-commercial": **no matches**.
29. Vercel Hobby restricted to non-commercial personal use | **CONFIRMED** | https://vercel.com/docs/limits/fair-use-guidelines

Net: **no decision-critical number that the four recommendations rest on is materially wrong.** Every "free forever" arithmetic floor (Workers/D1/KV/R2, Supabase pause, Apple $99, Google gate, Dropbox gate, Entra 24 h, GitHub secret/email traps, D1 2 MB row, Firestore 1 MiB) checks out against the vendor's own page.

---

## 2. Contradicted claims

30. Turso Developer plan price = **$5.99/month** (`hosting.md` §5 paid-tier table and §2.3 DPA row) | **STALE** | https://turso.tech/pricing → current value is **$4.99/month** ("Save $1/month"), 9 GB, 2.5 Billion reads, 25 Million writes. The page is also now titled "Turso Database Pricing" with a Free/Developer/Scaler/Pro/Enterprise ladder, so the plan structure the brief read has been re-priced. Immaterial to the recommendation (fallback paid-tier cost only), but it is the one demonstrably out-of-date number.

No other claim I checked was contradicted by its own primary source.

---

## 3. Weak / unclear / unsupported claims

31. "R2 checkout requires a payment method / a small card pre-authorization hold" (`hosting.md` §1.4) | **UNSUPPORTED by primary; correctly flagged as community-sourced** | https://developers.cloudflare.com/r2/get-started/ says only: "Complete the checkout flow to add an R2 subscription to your account… You are billed for your usage on a monthly basis." No mention of a card or a hold anywhere on that page. The brief does label the card claim as secondary/community — but note this claim carries the entire weight of the "cardless stack, therefore choose D1-only" argument, so it deserves an empirical answer, not a forum thread.
32. "Auth0 Free does not include Account Linking (needs Essentials+)" (`identity.md` §6) | **UNSUPPORTED** | https://auth0.com/pricing confirms Free = up to 25,000 MAU (also corroborated by Auth0's own blog and an Okta press release), but the account-linking exclusion appears only in a community forum thread; the pricing table extraction does not state it, and Auth0's docs say only "Availability varies by Auth0 plan." **One line of this table is trustworthy; the sharp edge that justifies rejecting Auth0 is not.**
33. "Turso Free: DPA: No" (`hosting.md` §2.3, §6) | **UNCLEAR** | https://turso.tech/pricing — DPA is a row in the plan matrix, and the Free column shows **no value** for it. Plausible, not confirmed verbatim. Since this is cited as the reason the fallback has "a GDPR paper gap", it should be confirmed by asking Turso or reading the DPA page itself.
34. `sync-model.md`: "Favicons (32×32 PNG ≤ 8 KB, **hundreds of them**): inline is cheap; keep them in the document… keeps the document well under the 2 MB D1 row" | **UNSUPPORTED by its own arithmetic** (labelled inference in-brief) | D1 row cap is confirmed at 2,000,000 B | 300 favicons × 8 KB = 2.4 MB → **over** the D1 row cap; even 150 × 8 KB = 1.2 MB leaves almost no headroom for the rest of the document. The claim and the numbers in the same paragraph don't reconcile.
35. Fly.io "smallest always-on machine ≈ $2.19/30 days" (`hosting.md` §4.5/§5); Koyeb Starter removal date 2026-03-10; "Koyeb joined Mistral (Feb 2026)" | **UNVERIFIED** | I confirmed only that fly.io/pricing shows no free plan and is fully metered; the Koyeb claims rest on a secondary price-history site (the brief flags this). Not conclusion-changing.
36. Not audited within budget (explicitly out of scope, flagged rather than skipped silently): Zitadel "100 DAU", WorkOS "1M MAU free", Clerk "50k MRU / ≤3 social connections / 7-day sessions", Logto "50k MAU / 50k tokens", Entra External ID "50k MAU", Auth0 "1 custom domain needs card verification", Firebase Auth "3,000 Tier-1 DAU/day" and "50 MAU for generic OIDC", Workers Paid "$5/mo, 10M requests", "Pages Functions billed as Workers", Deno Deploy free-tier figures and Deno KV 64 KiB value cap, GitHub 25/50/100 MiB file limits and the 1 GB repo advisory, MDN localStorage 5 MiB, `SyncManager` compat (Firefox/Safari false), Safari 17 60%/80% quotas, Dashy 24 MB/user, and the prior-art price points (Wallabag, Obsidian Sync, Joplin Cloud, Bitwarden, Standard Notes) plus the code-settings-sync "millions of installs" precedent. The prior-art lane's *recommendation* rests on the Google/GitHub/Dropbox/Heroku claims, which I did verify.

---

## 4. Material source-quality concerns

- **Apple's own page is unreachable to this toolchain.** The 6-month secret cap is only confirmable via a third-party mirror of Apple's docs plus Microsoft's own quoting docs. For a claim that dictates "the maintainer must rotate a secret at least every 6 months or logins break", I'd want a direct vendor fetch (Jina/Firecrawl fallback, or a browser) before shipping.
- **Page misattribution** (claim #1): the $99 quote is credited to `/programs/whats-included/`; it lives on `/programs/enroll/`. Claim true, citation wrong.
- **Secondary-only citations** (all flagged as such in-brief, which is to the briefs' credit):
  - `hosting.md`: Cloudflare commercial-use allowance (community thread — though I verified the *primary* basis: no "non-commercial" string in the SSA); R2 card requirement (community threads); Fly.io $5/mo minimum (Fly forum); Koyeb plan removal (SaasTrack); Neon Databricks acquisition/EU-DPF (OpenDPP, when neon.com/pricing itself now says "from Databricks" — a primary source exists).
  - `prior-art.md`: Netlify commercial-use permissiveness (staff post; the SSA merely allows no-cause termination); Xata free-tier numbers (secondary by design); PlanetScale free-tier retirement (still "could not verify", and it doesn't affect the verdict).
  - `identity.md` and `sync-model.md` are essentially primary-only and their in-brief "could not verify" flags are honest and accurate.
- **Not circular, not stale-by-default:** none of the four briefs cites itself or another brief as evidence, and the in-brief "Missing evidence / could not verify / Contradictions" sections are unusually candid. The CASA fee, the Supabase pause, and the D1 hard-fail behaviour — the three claims most likely to have been softened by a lazy researcher — are all verbatim-accurate.

---

## 5. Missing evidence (numbers that may have changed recently)

- **Turso Developer $4.99 vs brief's $5.99** (#30) — re-priced; the only stale number found.
- **Turso plan ladder renamed/re-tiered** (Free/Developer/Scaler/Pro/Enterprise; page retitled "Turso Database Pricing").
- **Neon rebranding to "Lakebase Postgres … from Databricks"** with a changed free-plan structure (1 GB/project) — the brief flagged the acquisition but not the plan-page restructure.
- **Cloudflare numbers have NOT drifted**: the briefs' quoted stamps (Workers Limits Oct 8 2026, D1/KV Apr 21 2026, R2 Oct 1 2026) match the live pages exactly, including KV's 30-second minimum `cacheTtl`.
- **Supabase free tier unchanged** (500 MB, 1-week pause, 50k MAU).
- **Fastest-moving, weakest-sourced lane is the startups tier** (Fly/Railway/Koyeb/Render/Railway): every claim there is either secondary or pending, and these are the tiers most likely to change again before build starts. The recommendation doesn't depend on them, so this is a "don't quote this table in a year" warning rather than a defect.

---

## 6. Material contradictions

1. **The lanes recommend incompatible architectures and never reconcile.** `hosting.md`, `sync-model.md` and `identity.md` all assume a **maintainer-run backend** (Workers + D1 [+R2], public OIDC login, maintainer holds the data). `prior-art.md` argues the opposite in its own verdict: every durable zero-maintainer-cost story is BYOS, and a maintainer-run free tier is "the pattern that gets cut". No brief compares the two, and no shared decision criteria (cost, effort, UX, legal exposure) are applied across them. **This is the actual architecture decision and it is left unresolved by the research.**
2. **R2: card-gated (hosting) vs load-bearing at "true zero cost" (sync-model).** `hosting.md` explicitly recommends the cardless stack *excluding* R2 and says "If 'no card ever' is a hard requirement, do not enable R2." `sync-model.md` makes content-addressed R2 blobs mandatory (because a 4 MB doc cannot fit D1's 2,000,000-byte row) and asserts "Feasible: yes, at **true zero cost**, on Cloudflare's free tier (Workers + D1 + R2)" — while **never mentioning** the subscription/card requirement. The two recommendations cannot both be adopted under the "no card" constraint.
3. **GitHub login: impossible vs the recommended path.** `identity.md` §1.2/§2 concludes "browser-only GitHub login is not possible; the exchange must run somewhere that holds the secret", dismissing device flow as "a headless UX, not an SPA pattern" — an opinion, not a citation. `prior-art.md` builds its entire recommendation on that same device flow being "the only OAuth flow documented to work end-to-end from a static site". Both statements are individually true about *different flows*, but the conclusions point in opposite directions (build a secret-holding Worker vs ship a backendless static site) and neither brief cross-references the other.
4. **Scale ceilings disagree** because the assumed document size differs unstated: `identity.md` says ~1,000+ heavy users exhaust the free 5 GB; `hosting.md` says ≈2,500–5,000 users at ~1 MB/cardless path. Both are labelled estimates, but the decision-relevant input is the actual document size, which no lane measured.
5. **Minor internal wrinkle, correctly flagged in-brief:** Google's support answers imply blanket verifier obligations while the production-readiness pages show basic-scope apps need none. `identity.md` records this rather than silently resolving it — good practice, and my checking supports the production-readiness reading (#3, #4).

---

## 7. Implications for the original conclusion

- **The premises survive.** All four lanes'"free forever" floors are verified against vendor pages: Cloudflare's cardless Workers+D1(+KV) stack really is hard-fail and pause-free with zero egress, Supabase really does pause after one week idle, Apple really does cost $99/yr, Google's `drive.file` really has no verification/CASA/fee/cap gate, GitHub really does gate web-flow tokens behind a secret (`repo` scope, 5,000 req/hr per user), and Dropbox really does freeze linking at 50 users. I found **no decision-critical number that changes a recommendation.** The single stale figure (Turso Developer $4.99) touches only the fallback's paid tier.
- **What does not survive unexamined is the choice between lanes.** The four briefs quietly describe two different products. Before any of them is treated as the answer, the parent must resolve: (i) maintainer-hosted vs BYOS; (ii) whether a payment method is acceptable at all (this single answer decides R2, and therefore whether `sync-model.md`'s design is even buildable under its own zero-cost claim); (iii) whether the SPA moves to a custom domain, which decides whether cookie sessions are possible at all.
- **Two "zero cost" labels are not literally true as written.** `identity.md`'s verdict is "feasible at zero cost forever", but its own recommendation requires moving off `futura75.github.io` onto one custom domain; a domain is a recurring cost, and `*.pages.dev` is a public suffix, so a free sibling subdomain would not give a same-site first-party cookie. `sync-model.md`'s "true zero cost" is contingent on accepting a card for R2, which the same project's hosting lane advises against.
- **Unverified buy-tier "sharp edges" should be treated as unknowns, not as settled disqualifiers** — Auth0's missing account linking (#32) and Turso's missing DPA (#33) are exactly the kind of claim that reads as decisive in a verdict paragraph and currently rests on a forum post and a blank table cell.
- **Highest-value follow-ups, in order:** measure the real Stargate document and favicon footprint (collapses or revives the D1-vs-R2 question, see #34); settle the card-in-account question empirically (R2 checkout); settle maintainer-hosted vs BYOS explicitly; and price the domain that `identity.md`'s cookie architecture requires.

---