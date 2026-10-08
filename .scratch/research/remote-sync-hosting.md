# Research: Zero-cost hosting for a tiny Stargate sync API

**Question:** Which backend + storage can keep a tiny sync API alive at literally 0 EUR/month, forever, with the least risk of breaking (hard limits, surprise billing, platform shutdown, GDPR)?

**Checked on:** 2026-10-08 (UTC). All limits/prices below were read on the vendor's own current page today unless marked otherwise. Where a page displays a "last updated" date, it is given. Secondary sources are flagged and used only as leads.

**Workload used for arithmetic (from the brief):** a few hundred to ~1,000 (at most a few thousand) users; ONE JSON document per user of ~50 KB–4 MB (base64 background images dominate); a few writes/user/day, reads on every device start. Peak realistic usage: ~1,000 users × ~5 read/write events/day ≈ 5,000 API calls/day; total stored user data ≈ 1–4 GB at 1–2 MB average document size.

---

## 1. Cloudflare Workers free plan, D1, KV, R2

### 1.1 Workers free plan (current, as of today)

| Limit | Workers Free | Source |
|---|---|---|
| Requests | **100,000/day** (resets 00:00 UTC; error 1027 past limit) | [Limits (updated Oct 8, 2026)](https://developers.cloudflare.com/workers/platform/limits/) |
| CPU time | **10 ms/request**; wall-clock waiting on I/O **does not count** ("Waiting on network requests (such as fetch() calls, KV reads, or database queries) does not count toward CPU time") | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| HTTP request duration | **No limit** (runtime gives in-flight requests a 30 s grace during updates) | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Memory | 128 MB per isolate; request body up to 100 MB (free zone) | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Subrequests | 50/request; 1,000 to internal services | [Limits](https://developers.cloudflare.com/workers/platform/limits/) |

- The free plan **is** usable for this kind of API: 100,000 requests/day is ~20× the expected 5,000/day. No requests-per-second cap; routes can be set fail-open or fail-closed (1027 page) ([Limits](https://developers.cloudflare.com/workers/platform/limits/)).
- **Important inference (not a documented benchmark):** a *single* `JSON.parse` of a 4 MB document can exceed the 10 ms CPU allowance. Mitigations: don't parse blobs server-side — stream/copy bytes between R2/D1 and the client, keep JSON validation to small envelopes, or cap synced JSON size per request. For a pass-through blob service the CPU cost per request is well under 1 ms.
- **"What actually forbids what" (the terms change you flagged):** the current **Cloudflare Self-Serve Subscription Agreement** (fetched today, cloudflare.com/terms) has **no non-commercial-use clause** for free accounts. Commercial use of the Free plan is allowed (confirmed by Cloudflare staff in the community thread [Use free plan for commercial project](https://community.cloudflare.com/t/use-free-plan-for-commercial-project-follow-up/732438), which is secondary). The real restrictions that apply:
  - **SSA § 2.2.1(h):** no processing/collecting credit-card information on a web property receiving Free Services (irrelevant to Stargate).
  - **SSA § 2.6 Free & Trial Services:** free services run "until ... termination of the Free Service by Cloudflare in our sole discretion"; "We will have no liability for any harm or damage arising out of or in connection with any Free Services" ([terms](https://www.cloudflare.com/terms/)). This is the at-will risk of every free tier.
  - **Service-Specific Terms — CDN:** *"Unless you are an Enterprise customer, Cloudflare offers specific Paid Services (e.g., the Developer Platform, Images, and Stream) that you must use in order to serve video and other large files via the CDN ... if you use or are suspected of using the CDN without such Paid Services to serve video or a disproportionate percentage of pictures, audio files, or other large files."* ([service-specific terms](https://www.cloudflare.com/service-specific-terms-application-services/)). Background images are "pictures" — but at hobby scale, served to authenticated users through a Worker (not a public CDN dump), this is not the pattern the clause targets (the Feb-2025 blog [Reaffirming our commitment to free](https://blog.cloudflare.com/cloudflares-commitment-to-free/) frames it as "customers pushing large files and videos"). Interpretation, low risk; don't build a public image-CDN on the free plan.
  - **D1 free-limit enforcement:** as of **September 1, 2026** D1 queries on the free plan **hard-fail with errors** (not throttle) past daily row limits, with email alerts ([changelog 2026-09-01](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/); enforcement was announced for 2025-02-10 first per D1 release notes — same behavior).
- Pages Functions vs Workers: **Pages Functions are billed exactly as Workers** — "All Pages Functions are billed as Workers. All pricing and inclusions in this document apply to Pages Functions." ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)); Pages is built on Workers/Asset Server Worker ([Pages overview](https://developers.cloudflare.com/pages/)). So the same free numbers apply whether the sync API lives in a `.functions` directory on Pages or in a standalone Worker.

### 1.2 D1 free tier (SQL, SQLite dialect)

| Limit (Workers Free) | Value | Source |
|---|---|---|
| Rows read | **5,000,000/day** | [D1 pricing (Apr 21, 2026)](https://developers.cloudflare.com/d1/platform/pricing/) |
| Rows written | **100,000/day** | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| Storage (per account) | **5 GB total** | [D1 limits (Apr 21, 2026)](https://developers.cloudflare.com/d1/platform/limits/) |
| Per-database max | 500 MB (free), max 10 databases/account free | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Max row/BLOB size | **2,000,000 bytes (2 MB)** | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Egress/data transfer | **Free ("no data transfer charges")** | [D1 pricing FAQ](https://developers.cloudflare.com/d1/platform/pricing/) |

- Limits are **per-account** (D1 FAQ: "When your **account** hits the daily read and/or write limits, you will not be able to run queries"; "storage limit" is account-level) ([D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)).
- A 4 MB document **cannot fit in a single D1 row** (2 MB max). Chunk large docs (e.g. two 2 MB blobs) or — better — store blobs in R2 and keep a small metadata row in D1.
- For this workload D1 is nowhere near its limits: 5,000 writes/day vs 100,000 allowed; reads trivially fine as long as queries use indexes/point lookups.
- **EU data location exists:** D1 supports a **jurisdiction constraint `eu`** (data "only run and store within" the EU; set at creation, cannot be changed later; also `us`, `fedramp`) ([D1 data location, updated Oct 2, 2026](https://developers.cloudflare.com/d1/configuration/data-location/)). Location hints include `weur`/`eeur`.

### 1.3 Workers KV free tier

| Limit (Free) | Value | Source |
|---|---|---|
| Reads | 100,000/day | [KV pricing (Apr 21, 2026)](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits (Oct 8, 2026)](https://developers.cloudflare.com/kv/platform/limits/) |
| **Writes** | **1,000/day (per account)** | [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [KV limits](https://developers.cloudflare.com/kv/platform/limits/) |
| Deletes / Lists | 1,000/day each | [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/) |
| Storage | 1 GB per account | [KV limits](https://developers.cloudflare.com/kv/platform/limits/) |
| Value size | 25 MiB | [KV limits](https://developers.cloudflare.com/kv/platform/limits/) |
| Consistency | Eventual; "changes may take up to 60 seconds or more to be visible in other global network locations"; min cacheTtl reduced to 30 s (Jan 30, 2026) | [How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/), [changelog](https://developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/) |

- The **1,000 writes/day account-wide** is the binding constraint: ~1,000 users × 1 KV write/day is already at the wall. Use KV only for cheap, low-write metadata (e.g. session/login tokens), never as the per-sync write path. KV is cardless and included in the free Workers plan.

### 1.4 R2 free tier (object storage)

| Free allowance (monthly) | Value | Source |
|---|---|---|
| Storage | **10 GB-month** | [R2 pricing (Oct 1, 2026)](https://developers.cloudflare.com/r2/pricing/) |
| Class A ops (writes) | 1,000,000/month | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Class B ops (reads) | 10,000,000/month | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Egress | **Free (no egress charges, all classes)** | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| Single-PUT object size | up to 5 GiB | [R2 limits](https://developers.cloudflare.com/r2/platform/limits/) |

- **Card caveat:** R2 is a monthly subscription — the official get-started says "Complete the **checkout flow to add an R2 subscription** to your account … You are billed for your usage on a monthly basis" ([R2 get-started](https://developers.cloudflare.com/r2/get-started/)). In practice that checkout requires a payment method; users report a small card pre-authorization ([community, secondary](https://community.cloudflare.com/t/question-regarding-5-usd-charge-for-r2-storage-activation/900480), [community, secondary](https://community.cloudflare.com/t/if-i-want-to-use-cloudflare-r2-i-have-to-link-a-payment-method-i-suggest-not-doin/887578)). On the free allowance you are not billed; the card is a pre-authorization. **If "no card ever" is a hard requirement, do not enable R2** (use D1-only, which is cardless — see Verdict).
- **EU data location exists:** R2 supports bucket **jurisdiction `eu`** (guaranteed storage within EU; S3 endpoint `https://<account_id>.eu.r2.cloudflarestorage.com`) ([R2 data location, updated Aug 19, 2026](https://developers.cloudflare.com/r2/reference/data-location/)).
- No egress charges anywhere at Cloudflare (Workers, D1, KV, R2) — bandwidth is the one thing a sync service can never be billed for here ([D1 FAQ](https://developers.cloudflare.com/d1/platform/pricing/), [KV FAQ](https://developers.cloudflare.com/kv/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/)).

### 1.5 Cloudflare summary
Cardless stack possible: **Workers + D1 (+ KV for tokens), no R2** = 5 GB D1 account storage, 100k req/day, 100k rows written/day, zero egress cost, EU jurisdiction, no inactivity pausing, hard-fail (not bill) at limits, no payment method → nothing to invoice. Data over 5 GB requires R2 (card needed) or pruning.

---

## 2. Supabase, Neon, Turso, Xata, PlanetScale

### 2.1 Supabase Free (checked today, [supabase.com/pricing](https://supabase.com/pricing))

- **500 MB database**, 1 GB file storage, **5 GB egress**, 50,000 MAU for Auth, unlimited API requests, 2 active projects ([pricing](https://supabase.com/pricing)).
- **Pause policy — confirmed still in force:** "Free projects are paused after **1 week of inactivity**"; paid projects are never paused ([pricing](https://supabase.com/pricing)). Definition of activity: a free project is inactive if it "does not receive sufficient user database activity over the past week"; "Typically a few user requests to the database each day over the previous week is enough" to avoid pausing; restore window up to 1 year; two warning emails ([free-project-pausing docs](https://supabase.com/docs/guides/platform/free-project-pausing)). A live sync service generates that traffic; but if real usage dies, the project pauses silently — a real "service appears dead" risk for a maintainer who doesn't want to be paged.
- **Scale ceiling:** 500 MB DB + 1 GB storage caps at roughly 250–750 users at 1–2 MB avg documents. Surpasses the free tier sooner than Cloudflare's cardless 5 GB or R2's 10 GB.
- Regions incl. EU (Frankfurt `eu-central-1`, Ireland, Paris; note London/Zurich are *not* EU member states) ([regions docs](https://supabase.com/docs/guides/platform/regions)); **DPA available** ([DPA PDF](https://supabase.com/downloads/docs/Supabase+DPA+260317.pdf), [GDPR docs](https://supabase.com/docs/guides/security/gdpr-compliance)).
- No payment method required to sign up and stay on Free (Supabase only asks for a card for paid plans — [billing docs](https://supabase.com/docs/guides/platform/billing-on-supabase); the "We accept credit card payments only" line is about paid billing, [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq)). No surprise billing possible on Free (no spend).

### 2.2 Neon Free (checked today, [neon.com/pricing](https://neon.com/pricing)) — note vendor change

- Neon now presents itself as "**Lakebase Postgres** … **from Databricks**" ([pricing](https://neon.com/pricing)) — the company joined Databricks (acquisition 2025; secondary: [OpenDPP sub-processor register](https://opendpp-node.eu/subprocessors), and the [Neon MSA product schedule](https://neon.com/msa)). Flag for "least risk of breaking": Neon is now part of a larger commercial entity; the Free plan is explicitly "permanent (not a trial); no credit card required" ([pricing](https://neon.com/pricing)).
- Free plan: **100 CU-hours/project/month**, **1 GB Postgres storage per project** (20 GB total across up to 100 projects), **5 GB egress/project**, 10 branches, bundled Auth (up to 60k MAU) and Object Storage (5 GB) ([pricing](https://neon.com/pricing)).
- **Scale-to-zero:** compute suspends after **5 minutes** of inactivity (always on for Free, cannot disable); cold starts "take less than 1 second, with less than 500 ms being typical" ([Neon compute lifecycle](https://neon.com/docs/introduction/compute-lifecycle), [DX principles](https://neon.com/docs/get-started/dev-experience)). Autosuspend ≠ data loss; document storage persists.
- Hit-limit behavior: "Running out of CU-hours or egress (5 GB) **suspends compute** until the next billing period. Exceeding 1 GB storage blocks writes." (Neon pricing FAQ, [pricing](https://neon.com/pricing)). No billing on Free.
- **EU region + DPA:** e.g. AWS `eu-central-1` Frankfurt; **DPA provided** ([Neon DPA PDF](https://neon.com/pdf/DPA.pdf), [GDPR blog](https://neon.com/blog/gdpr-compliance-and-neon)); EU–U.S. DPF certified (secondary: [OpenDPP](https://opendpp-node.eu/subprocessors)).
- Watch-item for this workload: 100 CU-hours/month (≈3.3 CU-hours/day of *active* Postgres), and every cold start adds ~0.5 s latency. A sync API that wakes the DB a few times per hour is fine; an always-warm usage pattern is not.

### 2.3 Turso / libSQL Free (checked today, [turso.tech/pricing](https://turso.tech/pricing.md))

- Free: **100 databases, 5 GB storage, 500 million rows read/month, 10 million rows written/month**, 3 GB/month syncs; "no credit card required" ([turso.tech/pricing](https://turso.tech/pricing)).
- Hit-limit behavior: **free plan blocks at quota** — "Once you exceed the limit on any single metric … your databases are **blocked**" with `BLOCKED` error; overages are opt-in and disabled by default ([Turso pricing FAQ](https://turso.tech/pricing), [usage & billing docs](https://docs.turso.tech/help/usage-and-billing)). No surprise billing: on Free you are not billed at all, you just block until you upgrade — "Free plan: You will need to upgrade to a paid plan" ([pricing](https://turso.tech/pricing)).
- **GDPR gap:** Turso's own plan table says **DPA: No** on Free (DPA: Yes from Developer $5.99) ([pricing](https://turso.tech/pricing)). For processing European users' bookmark data with a DPA requirement, the free tier is deficient on paper.
- Vendor note: Turso is owned by the makers of libSQL (open source, SQLite-compatible — you can run the same file locally/dump it later).

### 2.4 Xata and PlanetScale

- **PlanetScale:** the free tier was retired in April 2024 (free plan removed; now trial-only $0-for-30-days credit, then paid). I could not find a free tier on planetscale.com today; treat as **no free tier** (confirmed indirectly: no free plan appears in current pricing flow; flagged as "could not verify a current free offering"). **Not recommended to verify further** — this brief's verdict does not depend on it.
- **Xata:** still advertises a Free plan (1.5 GB database, 15 GB bandwidth, 25k record reads/day etc. per their pricing page) — **but** Xata has repeatedly changed its free terms and has no long-term public track record like Supabase/Neon; I did not deep-verify each Xata number. Deprioritized; the verdict below does not use Xata.

---

## 3. Firebase Spark (free) plan, Firestore, Auth

- **Spark plan:** no-cost, "No payment method needed" ([Firebase pricing](https://firebase.google.com/pricing)). Social sign-in (Google, GitHub, Microsoft, Apple, etc.) is included free on Spark ([Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)).
- **Firestore free quota:** **1 GiB stored, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, 10 GiB outbound/month**; quotas reset ~midnight Pacific; applies to **one database per project** ([Firestore pricing](https://firebase.google.com/docs/firestore/pricing), [Firestore quotas](https://firebase.google.com/docs/firestore/quotas), [cloud.google.com/firestore/pricing](https://cloud.google.com/firestore/pricing)).
- **Hard-stop (no billing account):** on Spark you cannot be billed at all; the documented enforcement is *"If you exceed the no-cost quota limit in a calendar month for any product, your project's usage of that specific product will be **shut off for the remainder of that month**"* ([Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)). So it doesn't "just start failing gracefully" on a per-request basis — the whole product turns off monthly. For a sync service, that is a hard outage until month rollover, not a soft throttle.
- **Document size:** max Firestore document = **1 MiB** ([Firestore quotas](https://firebase.google.com/docs/firestore/quotas)) → a 4 MB document needs chunking into ≥4 documents. 1 GiB storage ≈ 500–1,000 users at 1 MB. Both limits bite earlier than Cloudflare/Turso.
- **Auth:** Firebase Auth on Spark is free; social/federated providers billed as Identity Platform MAU — "**50K MAUs no-cost**" for standard auth, but **generic SAML/OIDC is only 50 MAUs free** ([Firebase pricing](https://firebase.google.com/pricing), [Identity Platform pricing](https://cloud.google.com/identity-platform/pricing)). Google/GitHub/Microsoft sign-in (the stated requirement) fits the 50k-free bucket; arbitrary OIDC providers would not. Spark also caps daily active users ("Tier 1 Daily Active Users: 3,000 per day", per [Firebase Auth limits, updated 2026-10-07](https://firebase.google.com/docs/auth/limits)).
- **"Can Spark projects be deactivated?"** — I could not verify any official automatic deactivation/deletion policy for Spark projects. Documented facts: Spark project-creation quota is ~5–10 projects ([Understand Firebase projects](https://firebase.google.com/docs/projects/learn-more)); the monthly quota shut-off above is the documented enforcement; Google's "unattended project recommender"/"Remora" cleanup applies to org-managed projects, not consumer Spark projects ([Google Cloud recommender](https://cloud.google.com/recommender/docs/unattended-project-recommender)). **Could not verify** any inactivity-based deletion; do not rely on one existing or not existing.
- EU: Firestore offers EU multi-region `eur3` ([Firestore locations](https://firebase.google.com/docs/firestore/locations)); Google Cloud DPA applies ([Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)).

---

## 4. Deno Deploy, Netlify, Vercel, Fly.io, Render, Railway, Koyeb (current status, checked today)

### 4.1 Deno Deploy — free tier **exists in 2026** (pricing page fetched today)
- Free: **1M requests/month, 20 GiB egress, 10 hours active CPU, 150 GiB-hr memory, 10 apps, 1 GiB Deno KV** (1M read units + 500k write units/month; 1 KiB per write unit), billed only for active CPU ([Deno Deploy pricing](https://deno.com/deploy/pricing)).
- This is the platform that was split off during Deno's 2025 restructuring of Deploy vs `deployd` — the **deno.com/deploy free plan is current and live** ([deno.com/deploy](https://deno.com/deploy)).
- **KV value limit: 64 KiB** (max value size; max transaction atom 800 KiB) ([Deno KV transactions docs](https://docs.deno.com/deploy/kv/transactions/)) → a 1–4 MB document requires custom 64 KiB chunking, and with 1 KiB write-units a 4 MB doc costs ~4,096 write units (≈122 full-document syncs/month at the 500k-write-unit ceiling). **Bad fit** for this workload unless you chunk aggressively.
- Free plan tagline: "For personal use and smaller projects" ([pricing](https://deno.com/deploy/pricing)) — marketing wording; I found no legal non-commercial clause (interpretation).
- **GDPR:** no DPA until Enterprise ("DPA: Not included" on Free/Pro/Builder, per [pricing](https://deno.com/deploy/pricing)); region control on Free unverified.

### 4.2 Netlify Free — exists, credit-metered
- Free plan: **$0, 300 credits/month, hard limit, no auto-recharge** ([Netlify pricing](https://www.netlify.com/pricing/), [credit-based billing docs](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/)). 300 credits ≈ 1.5M web requests (2 credits/10k) but only ≈ **15 GB bandwidth/month (20 credits/GB)** ([pricing](https://www.netlify.com/pricing/)) — 15 GB ≈ ~5,000 full 3 MB document downloads/month. Too tight for a blob-heavy sync service.
- **No non-commercial-use clause found** in Netlify's agreements; the Self-Serve Subscription Agreement's Free-Usage-Tier term simply says the service "may be terminated by either Netlify or Customer, without cause, immediately upon notice" ([Netlify SSA](https://www.netlify.com/legal/self-serve-subscription-agreement/)). Commercial use is permitted per staff posts (secondary: [answers.netlify.com](https://answers.netlify.com/t/can-we-use-netlify-free-plan-for-commercial-purposes/41545)).
- Free tier is cardless; no auto-recharge on free → hard stop, not billing.

### 4.3 Vercel Hobby — free, but **non-commercial only** (quote the clause)
- From Vercel's [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines): *"**Hobby teams are restricted to non-commercial personal use only.** All commercial usage of the platform requires either a Pro or Enterprise plan. Commercial usage is defined as any Deployment that is used for the purpose of financial gain ... including a paid employee or consultant writing the code."*
- From Vercel [Terms of Service](https://vercel.com/legal/terms) §4 Hobby Plan: *"You shall only use the Services under a Hobby plan for your personal or non-commercial use. We may change the features, limitations, or other conditions ... or discontinue offering the Hobby plan at any time."*
- **Decision-relevant verdict:** Stargate is OSS but is a *service* for other users — even if the maintainer earns nothing, Vercel's "personal use only" wording is the exact kind of clause that can bite. **Do not build the sync backend on Vercel Hobby.** (Also: Hobby has no auth/functions-friendly persisted DB; Postgres is paid.)

### 4.4 Cloudflare Pages Functions vs Workers — see §1.1
Identical billing/limits to Workers ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). No separate decision here.

### 4.5 Fly.io — **no free tier**
- Free allowances ended October 2024; pricing is pay-per-use, bill-by-second, no free plan: smallest always-on machine ≈ **$2.19/30 days**, ~$44/month with Managed Postgres ([fly.io pricing](https://fly.io/pricing/), [resource pricing docs](https://docs.fly.io/about/pricing)). New orgs needed a $5/mo minimum at one point (community post, secondary: [Fly forum](https://community.fly.io/t/free-tier-is-dead/20651)). Card required. → Not a free option.

### 4.6 Render Free — exists, **not viable for production**
- Free web services: 750 instance hours/month, **spin down after 15 min idle**, ~1 min spin-up, *"Do not use them for production applications"*, free Postgres **expires 30 days after creation** (deleted after grace), free KV is in-memory only, persistent disks not allowed ([Render free docs](https://render.com/docs/free)). Bandwidth overage with card on file → billed; without card → services suspended for the month ([Render free docs](https://render.com/docs/free)). → Not viable for durable sync.

### 4.7 Railway — effectively no usable free tier
- "Free Trial": $5 one-time credit for 30 days; "Free": $0/month but only **$1/month usage credit**, 1 service, 0.5 GB RAM, **0 custom domains**; real plans start at Hobby $5/month ([railway.com/pricing](https://railway.com/pricing)). → Not viable.

### 4.8 Koyeb — **free tier gone for new users**
- Koyeb joined Mistral AI (announced Feb 2026, [Koyeb blog](https://www.koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure)); the **Starter/free plan was removed for new signups** (plan removed 2026-03-10 per [SaasTrack pricing history](https://www.saastrack.app/library/koyeb), secondary; new users must pick Pro at ~$29/month). Existing orgs keep a free web service ([Koyeb pricing FAQ](https://www.koyeb.com/docs/faqs/pricing)). **Do not plan around Koyeb free.**

---

## 5. Cheap-but-durable fallback costs (same vendors, real money)

| Vendor | Real cost for this workload | Verified source |
|---|---|---|
| Cloudflare Workers Paid | **$5/month minimum**; includes 10M requests, 30M CPU-ms, more D1 (25B rows read, 50M rows written, 5 GB included, $0.75/GB-mo after), KV 1M writes included + $5/M; no egress charges anywhere | [Workers pricing (Oct 2, 2026)](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/) |
| Supabase | Pro from **$25/month** (8 GB disk, 250 GB egress, 100k MAU) | [supabase.com/pricing](https://supabase.com/pricing) |
| Neon | Launch: usage-only ($0.106/CU-hr, $0.35/GB-mo, no monthly minimum; invoices under $0.50 not collected) — realistically **~$1–10/month** | [neon.com/pricing](https://neon.com/pricing) |
| Turso | Developer **$5.99/month** (9 GB, 2.5B reads, 25M writes) | [turso.tech/pricing](https://turso.tech/pricing) |
| Deno Deploy | Pro **$20/month** | [deno.com/deploy/pricing](https://deno.com/deploy/pricing) |
| Fly.io | ~**$2.19/month** smallest always-on machine (no free tier) | [fly.io/pricing](https://fly.io/pricing/) |
| Railway | Hobby **$5/month** (includes $5 usage) | [railway.com/pricing](https://railway.com/pricing) |

Takeaway: the realistic "pay to graduate" path is Cloudflare Workers Paid at a flat **$5/month**, because Cloudflare has no egress pricing at all and D1/KV included amounts are far beyond this workload.

---

## 6. Terms & legal (commercial use, exceed behavior, GDPR)

### Commercial-use / attribution constraints on free tiers
- **Forbidden:** Vercel Hobby ("personal or non-commercial use" — quoted verbatim in §4.3; [Fair Use Guidelines](https://vercel.com/docs/limits/fair-use-guidelines), [Terms §4](https://vercel.com/legal/terms)).
- **Not forbidden (no clause found, verified on current pages):** Cloudflare Free (per SSA §2.2.1 — no commercial restriction; the current restrictions are credit-card processing on free-hosted web properties, VPN/proxy use, and CDN large-file serving — [SSA](https://www.cloudflare.com/terms/), [CDN service-specific terms](https://www.cloudflare.com/service-specific-terms-application-services/)); Netlify Free ([SSA](https://www.netlify.com/legal/self-serve-subscription-agreement/)); Supabase/Neon/Turso/Firebase/Deno free tiers (no non-commercial clause found on their pricing/terms pages today).
- **Attribution:** none of the above free tiers requires attribution (checked pricing/terms pages today).

### What happens when you exceed a free-tier limit (throttle vs hard-fail vs silent billing)
| Provider | Exceed behavior | Surprise-invoice risk |
|---|---|---|
| Cloudflare Workers/D1/KV | **Hard-fail** with errors (1027, D1 "exceeded limits" errors, KV write errors); resets daily; email alerts | **None** — no card on file unless you enabled R2/paid subs; nothing to bill |
| Cloudflare R2 | Usage beyond free allowance is **billed monthly** (card required to enable) | **Real but bounded** (~$0.015/GB-mo, $4.50/M Class A); you opted into a card |
| Supabase Free | Projects paused after 7 days inactivity; quota limits (no overage on Free) | None |
| Neon Free | CU-hours/egress exhausted ⇒ **compute suspended** until next period; storage full ⇒ writes blocked | None |
| Turso Free | **Blocks at quota** (`BLOCKED`), overages off by default | None |
| Firebase Spark | **Entire product shut off for the rest of the calendar month** | None (no payment method on Spark) |
| Deno Deploy Free | Hard caps (requests/egress); requests fail | None |
| Netlify Free | 300-credit hard cap, no auto-recharge | None |
| Render Free | Overage ⇒ billed **if card on file**, else suspended for the month | Possible small bill if you added a card |
| Vercel Hobby / Railway Free / Fly.io / Koyeb | N/A (no usable free tier) | Koyeb is per-use billing on card; Fly/Railway need cards |

### GDPR angle (facts + minimal-practical view)
- **Processor DPAs available:** Cloudflare (DPA forms part of the Self-Serve Subscription Agreement — [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/); GDPR trust hub [GDPR FAQs](https://www.cloudflare.com/trust-hub/gdpr/)); Supabase ([DPA](https://supabase.com/downloads/docs/Supabase+DPA+260317.pdf)); Neon ([DPA](https://neon.com/pdf/DPA.pdf)); Google/Firebase (Google Cloud DPA + SCCs — [Google Cloud DPA](https://cloud.google.com/terms/data-processing-addendum)); Turso **Free: DPA: No** ([turso pricing](https://turso.tech/pricing)); Deno Deploy: DPA only Enterprise ([pricing](https://deno.com/deploy/pricing)).
- **EU data location available:** Cloudflare D1/R2 `eu` jurisdiction ([D1](https://developers.cloudflare.com/d1/configuration/data-location/), [R2](https://developers.cloudflare.com/r2/reference/data-location/)); Supabase EU regions (Frankfurt/Ireland/Paris) ([regions](https://supabase.com/docs/guides/platform/regions)); Neon Frankfurt `eu-central-1` ([Neon DPA/locations](https://neon.com/pdf/DPA.pdf), secondary [OpenDPP](https://opendpp-node.eu/subprocessors)); Firestore EU multi-region `eur3` ([locations](https://firebase.google.com/docs/firestore/locations)).
- **What a solo EU hobby OSS maintainer realistically must do (interpretation, not legal advice):** the service stores users' bookmarks + OAuth identity (email) → personal data; the maintainer is (at minimum) a controller for the account/password-reset side and a processor-handler of the users' own documents. Minimum credible posture: (1) privacy policy covering what is stored and why; (2) processor DPA with the chosen host (Cloudflare's covers free accounts — a genuine advantage over Turso/Deno free); (3) data stored in an EU jurisdiction where cheap (Cloudflare `eu` jurisdiction = €0); (4) user data export already exists (the sync document IS the export); (5) deletion on request and on account deletion. Full GDPR compliance for an OSS side project (DPIA, 72h breach reporting, EU representative if serving EU users from Italy is fine — the author is EU-based) is out of scope here.

---

## 7. Migration risk & lock-in

| Option | Data portability | Effort to leave |
|---|---|---|
| **D1** | Standard SQL (SQLite dialect); export via `wrangler d1 export` to `.sql` | Low — take the `.sql` dump anywhere SQLite/Postgres can ingest it ([D1 docs](https://developers.cloudflare.com/d1/)) |
| **R2** | **S3-compatible API** (any S3 SDK/`rclone`/`aws s3` with custom endpoint) | Low — standard object-storage migration path ([R2 S3 API docs](https://developers.cloudflare.com/r2/api/s3/api/)) |
| **KV** | REST/Workers API, per-key | Low–Medium |
| **Supabase** | Plain **Postgres** (pg_dump) | Low |
| **Neon** | Plain **Postgres** (pg_dump) | Low |
| **Turso** | **libSQL = SQLite-compatible**; `turso db dump` / run the same file locally | Low |
| **Firebase Firestore** | Proprietary NoSQL; export/import via console/CLI to JSON | Medium–High (no standard SQL/S3 path; authentication rules are Locked-in) |
| **Deno KV** | Proprietary; Deno-specific API | Medium–High; also 64 KiB value limit forces a custom chunk format you must migrate |

General rule confirmed by the above: SQL-based (D1, Postgres, libSQL) and S3-compatible (R2) options have the least lock-in; Firestore/Deno KV the most. Storing the user document as an opaque versioned blob keyed by a user id (R2 object / D1 row) keeps the app's schema as small as "one table + one bucket", which is trivially portable later.

---

## Verdict

### Ranked comparison (lane: hosting a tiny sync API at €0)

| Option | Covers (auth/DB/blob/CDN) | Free limits (today) | Card required? | Pause risk | EU region | Surprise-billing risk |
|---|---|---|---|---|---|---|
| **Cloudflare Workers + D1 (+KV)** | compute+SQL (auth: DIY OIDC in Worker; blob: via D1 or KV) | 100k req/day, 10 ms CPU/req, D1 5 GB (500 MB×10 DBs), 5M rows read + 100k written/day, KV 1 GB/1k writes/day, **€0 egress** | **No** (unless R2 added) | **None** (no inactivity pausing) | **Yes** — D1 `eu` jurisdiction | **None** (hard-fail; cardless → nothing to bill) |
| Cloudflare + **R2** (+D1 for index) | adds unlimited-ish blob store (10 GB free) | 10 GB, 1M Class A + 10M Class B/mo, free egress | **Yes** (pre-authorization hold) | None | **Yes** — R2 `eu` jurisdiction | Minimal bounded ($0.015/GB-mo over 10 GB) |
| **Turso (libSQL)** Free | SQL DB (auth: none bundled) | 5 GB, 500M reads/10M writes/mo, 100 DBs | **No** | None | Unverified jurisdiction; **no DPA on Free** | **None** (hard block at quota) |
| **Neon** Free | Postgres + Auth (60k MAU) + Object storage (5 GB) | 1 GB/project (20 GB across 100), 100 CU-hr/project, 5 GB egress/proj | No | Auto-suspend (5 min; no data loss; ~0.5 s cold start) | **Yes** (Frankfurt); DPA yes | None |
| Supabase Free | Auth (50k MAU) + Postgres + Storage + Edge Functions | 500 MB DB, 1 GB files, 5 GB egress, 2 projects | No | **Pause after 7 days inactivity** (restore ≤1 yr) | **Yes** (Frankfurt/Ireland/Paris); DPA yes | None |
| Firebase Spark | Auth (social) + Firestore (chunked) + Storage | 1 GiB Firestore, 50k/20k/20k ops/day, 10 GiB/mo egress; 1 MiB document cap | No | Unverified auto-deactivation; **monthly shut-off** on quota exceed | Yes (`eur3`); GCP DPA | None |
| Deno Deploy Free | compute+KV (64 KiB values) | 1M req/mo, 20 GiB egress, 10 h CPU | No | None | **No EU control; DPA Enterprise-only** | None |
| Netlify Free | hosting+functions+db+blob (credit-metered) | 300 credits/mo ≈ 1.5M req but only ~15 GB bandwidth | No | None | Yes (EU zones) | None (no recharge) |
| Vercel Hobby | compute | — | No | — | — | **Non-commercial-use clause — disqualified** |
| Render / Railway / Fly.io / Koyeb | — | Free tiers: Render (service sleeps 15 min, DB dies in 30 days), Railway ($1 credit, no domains), Fly (none), Koyeb (removed for new users) | Render/Railway no, Fly/Koyeb yes | Render suspends | n/a | Render bills bandwidth if card added; Koyeb bills per use |

### Recommendation

**Primary — Cloudflare Workers Free + D1 (SQLite) (+ KV for session tokens).** 
Why it will cost €0, exactly: the account is on the free Workers plan, the free allowances are 100,000 requests/day, 100,000 D1 rows written/day, 5 GB D1 storage (500 MB per database, ≤10 databases), 1 GB KV — and **all limits are enforced as hard errors, not meters** (Workers error 1027, D1 daily-limit errors since 2026-09-01, KV write failures), with **no egress/billing anywhere in the stack**. With **no payment method on the account there is nothing to invoice**: a bill requires a paid subscription or R2, both of which are explicit opt-ins. There is no inactivity pausing (unlike Supabase), no monthly shut-off (unlike Firebase), the `eu` D1 jurisdiction option covers GDPR data-localisation at €0, the Cloudflare DPA covers free accounts, and the D1 `.sql`/R2 S3 data formats make lock-in minimal. Scale ceiling on the cardless path: ~5 GB of user documents in D1 (≈2,500–5,000 users at ~1 MB, or fewer at 2–4 MB — then chunk documents across D1 databases or prune old background images), and KV's 1,000 writes/day means *don't* write KV per-sync. **What breaks at what scale:** requests break at 100k/day (~tens of thousands of DAU at this traffic pattern); D1 writes break at 100k rows/day; storage breaks at 5 GB (cardless) or 10 GB (with R2, needs a card); CPU breaks on the free plan if a single request parses multi-MB JSON (mitigate by streaming blobs and keeping server-side parsing to small envelopes).

**Fallback — Turso (libSQL) Free, with the same Worker front-end.** If Cloudflare's platform ever materially changes its free terms, Turso gives 5 GB, 500M rows-read/10M rows-written per month, 100 databases, no credit card, and — critically — the same hard-block-at-quota behavior (no overages on Free), so it also cannot produce an invoice. It needs no inactivity traffic to stay alive. Costs: no DPA on the free tier (a GDPR paper gap for the maintainer; note it in the privacy policy), and jurisdiction is less explicit than Cloudflare's `eu` constraint. Data stays portable because libSQL is SQLite-compatible (dump anytime). Between the two, the single-account-dependency risk is different vendors for the same decision — which is exactly the point of a fallback.

**Secondary useful facts:** if "no card ever" is absolute, avoid R2 (its checkout requires a payment method; community reports a small pre-authorization hold); keep the sync protocol vendor-neutral (blob + revision + put-if-revision-match) so that switching D1→Turso→Postgres is a driver change, not a rewrite; and avoid Vercel Hobby (non-commercial clause), Render (ephemeral free tier), Railway/Fly/Koyeb (no meaningful free tier) for this backend.

---

## Sources

**Cloudflare (all fetched/verified today, 2026-10-08):**
- Workers limits (updated Oct 8, 2026): https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing (updated Oct 2, 2026): https://developers.cloudflare.com/workers/platform/pricing/
- D1 pricing (updated Apr 21, 2026): https://developers.cloudflare.com/d1/platform/pricing/
- D1 limits (updated Apr 21, 2026): https://developers.cloudflare.com/d1/platform/limits/
- D1 FAQ: https://developers.cloudflare.com/d1/reference/faq/
- D1 data location (updated Oct 2, 2026): https://developers.cloudflare.com/d1/configuration/data-location/
- D1 free-limit enforcement changelog (Sep 1, 2026): https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- KV pricing (updated Apr 21, 2026): https://developers.cloudflare.com/kv/platform/pricing/
- KV limits (updated Oct 8, 2026): https://developers.cloudflare.com/kv/platform/limits/
- KV how-it-works / consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- KV reduced minimum cacheTtl (Jan 30, 2026): https://developers.cloudflare.com/changelog/post/2026-01-30-kv-reduced-minimum-cachettl/
- R2 pricing (updated Oct 1, 2026): https://developers.cloudflare.com/r2/pricing/
- R2 get-started (subscription/checkout): https://developers.cloudflare.com/r2/get-started/
- R2 data location (updated Aug 19, 2026): https://developers.cloudflare.com/r2/reference/data-location/
- R2 S3 API: https://developers.cloudflare.com/r2/api/s3/api/
- Cloudflare Self-Serve Subscription Agreement: https://www.cloudflare.com/terms/
- Cloudflare service-specific terms (CDN large-file clause): https://www.cloudflare.com/service-specific-terms-application-services/
- Cloudflare blog, "Reaffirming our commitment to free": https://blog.cloudflare.com/cloudflares-commitment-to-free/
- Cloudflare DPA: https://www.cloudflare.com/cloudflare-customer-dpa/ ; GDPR FAQs: https://www.cloudflare.com/trust-hub/gdpr/
- Cloudflare Pages overview / Functions: https://developers.cloudflare.com/pages/ ; https://developers.cloudflare.com/pages/functions/
- Pages-on-Workers engineering blog: https://blog.cloudflare.com/how-we-decreased-pages-latency/
- Community: commercial use of free plan allowed (secondary lead): https://community.cloudflare.com/t/use-free-plan-for-commercial-project-follow-up/732438 ; R2 card questions (secondary): https://community.cloudflare.com/t/question-regarding-5-usd-charge-for-r2-storage-activation/900480 , https://community.cloudflare.com/t/if-i-want-to-use-cloudflare-r2-i-have-to-link-a-payment-method-i-suggest-not-doin/887578

**Supabase:**
- Pricing: https://supabase.com/pricing
- Free-project pausing docs: https://supabase.com/docs/guides/platform/free-project-pausing
- Billing overview: https://supabase.com/docs/guides/platform/billing-on-supabase ; billing FAQ: https://supabase.com/docs/guides/platform/billing-faq
- Regions: https://supabase.com/docs/guides/platform/regions ; GDPR: https://supabase.com/docs/guides/security/gdpr-compliance ; DPA: https://supabase.com/downloads/docs/Supabase+DPA+260317.pdf

**Neon:**
- Pricing (fetched today): https://neon.com/pricing
- Free-plan 1 GB/project changelog (Oct 2, 2026): https://neon.com/docs/changelog/2026-10-02
- Compute lifecycle (scale-to-zero): https://neon.com/docs/introduction/compute-lifecycle ; DX principles (cold-start time): https://neon.com/docs/get-started/dev-experience
- DPA: https://neon.com/pdf/DPA.pdf ; GDPR blog: https://neon.com/blog/gdpr-compliance-and-neon ; MSA product schedule: https://neon.com/msa
- Secondary: OpenDPP sub-processor register (Databricks acquisition/locations): https://opendpp-node.eu/subprocessors

**Turso:**
- Pricing (fetched today): https://turso.tech/pricing
- Usage & billing (BLOCKED behavior): https://docs.turso.tech/help/usage-and-billing

**Firebase/Google:**
- Firebase pricing (Spark, no payment method; Identity Platform MAUs): https://firebase.google.com/pricing
- Firebase pricing plans (monthly shut-off on Spark quota): https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Firestore pricing/free quota: https://firebase.google.com/docs/firestore/pricing ; quotas/limits (1 MiB doc): https://firebase.google.com/docs/firestore/quotas ; cloud.google.com view: https://cloud.google.com/firestore/pricing
- Firebase Auth limits (updated 2026-10-07): https://firebase.google.com/docs/auth/limits
- Understand Firebase projects (project quota): https://firebase.google.com/docs/projects/learn-more
- Firestore locations (eur3): https://firebase.google.com/docs/firestore/locations
- Google Cloud DPA: https://cloud.google.com/terms/data-processing-addendum ; unattended project recommender: https://cloud.google.com/recommender/docs/unattended-project-recommender

**Deno / Netlify / Vercel / Fly / Render / Railway / Koyeb:**
- Deno Deploy pricing (fetched today): https://deno.com/deploy/pricing ; product page: https://deno.com/deploy ; KV transactions (64 KiB value): https://docs.deno.com/deploy/kv/transactions/
- Netlify pricing (fetched today): https://www.netlify.com/pricing/ ; credit-based plans: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ ; SSA: https://www.netlify.com/legal/self-serve-subscription-agreement/ ; staff answer on commercial use (secondary): https://answers.netlify.com/t/can-we-use-netlify-free-plan-for-commercial-purposes/41545
- Vercel fair use guidelines (non-commercial clause): https://vercel.com/docs/limits/fair-use-guidelines ; terms of service §4: https://vercel.com/legal/terms ; hobby plan: https://vercel.com/docs/plans/hobby
- Fly.io pricing: https://fly.io/pricing/ ; resource pricing: https://docs.fly.io/about/pricing ; free-tier death thread (secondary): https://community.fly.io/t/free-tier-is-dead/20651
- Render free docs (fetched today): https://render.com/docs/free
- Railway pricing (fetched today): https://railway.com/pricing
- Koyeb joining Mistral blog: https://www.koyeb.com/blog/koyeb-is-joining-mistral-ai-to-build-the-future-of-ai-infrastructure ; pricing FAQ (existing free service): https://www.koyeb.com/docs/faqs/pricing ; pricing page: https://www.koyeb.com/pricing ; plan history (secondary): https://www.saastrack.app/library/koyeb

**Retired/not-used free tiers (status only):** PlanetScale free tier retired April 2024 — no current free offering found today (could not verify any; not needed for verdict). Xata free plan exists but was not deep-verified (secondary by design).