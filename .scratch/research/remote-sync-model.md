# Research: Remote Sync Model for Stargate (v2 — Sync Service lane)

Scope: one JSON document per user (schemaVersion "1"), up to ~4 MB because of base64 background/favicon images, localStorage-only today, must sync across browsers + mobile. Solo maintainer, EU/Italy, zero-cost requirement. **All numbers below were read on the vendor's own page on 2026-10-09** (current date verified via timeapi.io, Europe/Rome). Free-tier quotas change; treat every figure as a point-in-time reading and re-verify before building.

Unknowns flagged explicitly. No secondary blogs used as citations. "Could not verify" is stated where applicable.

---

## 1. Conflict resolution options, honestly compared for THIS data

### (a) Whole-document LWW + server revision + ETag/If-Match (optimistic concurrency)
- Mechanism: server stores one document per user plus a monotonically increasing revision (implemented as an entity-tag / ETag). Client sends `PUT` with `If-Match: <revision>`; the origin server must use the strong comparison function (RFC 9110 §13.1.1: "The If-Match header field makes the request method conditional on the recipient origin server ... having a current representation of the target resource that has an entity-tag matching a member of the list"); mismatch → `412 Precondition Failed`. This is exactly how Firefox Sync validates writes with `X-If-Unmodified-Since` → `412` (syncstorage-rs API v1.5 docs: "If last-modified time of the resource is greater than the given value, request fails with 412 Precondition Failed").
- User-visible failure: **silent loss of one side's concurrent edits is prevented (412), but the resolution is binary**: the second writer must refetch and either re-apply (LWW, last writer wins, first writer's changes lost) or the UI must merge. For a personal start page with a few devices, this is the industry-floor behavior for bookmark-like data (see §2).
- Code added: small. A CAS update in a SQL store (`UPDATE docs SET doc=?, revision=revision+1 WHERE user=? AND revision=?`), an ETag out on GET, one `412` branch in the client, plus a change-queue.
- Fit for 4 MB payloads: only if the document is stored somewhere that can hold it (see §5: D1 row cap 2 MB → forces images out; KV value cap 25 MiB fits but has consistency problems, see §5).

### (b) Per-entity LWW with tombstones + server-assigned revisions
- Mechanism: each workspace/column/block/link/task is a record; server assigns each record a `modified` timestamp; clients fetch only records changed `?newer=<ts>` and upload changed records; deletions are tombstones. This *is* the Firefox Sync storage model (BSO = Basic Storage Object, per-record `modified`, collections, `newer` query parameter, incremental fetch; syncstorage-rs API v1.5).
- User-visible failure: concurrent edits to the *same* entity still resolve by LWW; you also get rename-vs-delete races and eternal tombstones to garbage-collect. Merge granularity improves (two devices editing different links merge cleanly).
- Code added: moderate — dirty-tracking per entity, tombstone set + GC, per-record revision plumbing, migration of the existing JSON doc into entity columns, and the client becomes a *record synchronizer* rather than a document save.
- Payload note: Firefox Sync requires servers to accept payloads ≥ 256 KiB and caps individual payloads (syncstorage-rs default per-record limit is 2.5 MB, raised only via payload-offload to object storage — see §3).
- Verdict for Stargate: the natural "half step" — a client-side 3-way merge (base/ours/theirs) over the existing JSON structure, without server-side entity rows. That gives ~80% of (b)'s user value at ~20% of its code. Cite: syncstorage-rs API v1.5 + payload-offload docs.

### (c) CRDT document merge (Yjs / Automerge / Loro / json-joy)
- Real measured cost (dmonad/crdt-benchmarks, same repo used by the Yjs author, versions pinned: yjs 13.6.11, ywasm 0.9.3, loro 0.10.1, automerge-wasm 2.1.10):
  - yjs: **69,124 B bundle / 20,100 B gzipped**
  - ywasm: 677,667 / 213,833
  - loro: 1,052,250 / 399,276
  - automerge (wasm): 1,737,571 / 604,118
- Can they merge a full JSON document with embedded binary? Automerge's data model explicitly includes byte arrays (`Uint8Array`), counters, timestamps, and Text (peritext) — so binary *can* live inside a CRDT doc (Automerge "Document Data Model"). Yjs shared types (Map/Array/Text) accept `Uint8Array` values. Loro similarly. But: any change that touches the binary value re-serializes it inside the update payload (delta encoding does not help a newly-set large value), so per-write message size stays proportional to the blob. And merge semantics are type-specific: text must use Text types for character-level merge; concurrent writes to the same map key resolve LWW-style (conflicts in Automerge are tracked and one value wins deterministically); lists merge by insertion order (RGA), which is *not* the same as Stargate's array-pos-then-ID move semantics.
- User-visible failure: apparently "magic" convergence that can contradict product intent (e.g. two concurrent reorders of a column producing an interleaved order), plus you inherit a new model layer and binary format that must be exported/imported back into the current JSON schema (a one-way door for the export contract). "It just merges" is true *for the CRDT semantics*, not for your UX.
- Code added: high — the whole app state layer is rewritten around shared types or patches; none of the existing plain-JSON code path stays.
- JSON-joy: publishes its own JSON CRDT + patch specs and editor integrations (README); I did not find an official bundled-size measurement on a primary source this pass, treat its footprint as "another CRDT option, unverified size".
- Verdict for Stargate: bundle cost + model rewrite are not justified by a personal-bookmarks sync use case, and the export-must-stay-one-JSON constraint (§3) makes a CRDT binary doc format hostile to the existing design.

### (d) Operation/record log (Firefox-Sync-style / Actual-Budget-style)
- Firefox Sync is effectively this at collection level (records + server timestamps, §2). Actual Budget ships a message log with **HULC (Hybrid Logical Clock) timestamps** (timestamp.ts: monotonic logical clocks, 5-minute max drift guard) plus a **merkle trie** of message hashes (merkle.ts) so clients can cheaply detect divergence; protobuf-encoded messages (crdt README). The server persists ordered messages; clients replay.
- Cost: you now maintain a message log, clock state, compaction/GC, and full replay logic — the most complex of the four options, and it buys convergence semantics you only need under sustained multi-writer offline editing.
- Verdict: overkill for the first version. Cite: Actual packages/crdt (timestamp.ts, merkle.ts, README), Joplin sync spec.

**Section conclusion:** (a) is the only option that is *provably buildable by one person at zero cost* while staying honest about conflict behavior; (b)-lite (client-side 3-way merge on conflict, later) is the upgrade path. (c) and (d) are real systems but their complexity budget exceeds this project's.

---

## 2. How the real systems actually do it (primary docs/source)

- **Firefox Sync (syncstorage-rs)** — "The Sync server is effectively a dumb shared whiteboard ... it plays a very small role in the actual syncing process." Clients store *records* (BSOs: `id`, server-assigned `modified`, `payload`, `ttl`) inside *collections*; each collection and each BSO carries a server-assigned last-modified timestamp that is "guaranteed to be monotonically increasing"; clients fetch `?newer=<lastSeen>`; writes are atomic-addressed with `X-If-Unmodified-Since` → 412; conflict resolution is **client-side**. Payloads must be supported to 256 KiB minimum; syncstorage-rs rejects payloads > 2.5 MB by default (payload-offload doc); per-collection quota 2.5 GB. Sources: syncstorage-rs docs: api-1.5.md, sync-client/overview.md, sync-client/life-of-a-sync.md, payload-offload/overview.md, response-codes.md.
- **Chrome Sync (Chromium)** — entity-based: sync units are *entities* (e.g. a bookmark) with type-specific payloads (*specifics*) plus metadata (versions, timestamps, client tags); protocol is protobuf (`sync.proto`); the engine does `Commit`/`GetUpdates` cycles; local/remote conflicts are merged by per-data-type logic in the `DataTypeSyncBridge` ("It handles merging local and remote data"). No document-level CRDT. Source: chromium components/sync/README.md (Architecture Overview).
- **Actual Budget** — local-first money manager; synchronizes by exchanging a log of mutating *messages*; timestamps are HULC hybrid logical clocks (47-char collatable strings; maxDrift 5 min; `send()`/`recv()` advance the clock) and each client keeps a merkle trie of the received message hash tree to detect and complete gaps; messages are protobuf-encoded. Merge precedence is timestamp-ordered (I did not re-verify the exact field-level precedence rule from source this pass — see Missing evidence). Sources: packages/crdt/timestamp.ts, packages/crdt/merkle.ts, packages/crdt/README.md.
- **Joplin (WebDAV/S3/Nextcloud targets)** — offline-first; each note/notebook/tag/resource is an *item*; a per-item `sync_time` in the local `sync_items` table decides what to upload; clients poll every few minutes and download deltas; sync-target-wide *settings* (`info.json`) carry per-property `updatedTime` and "heuristics decide which value should be kept" (syncInfoUtils.ts). Conflicts on notes produce user-resolvable duplicates ("conflict" notes; stated in Joplin's sync docs; exact conflict-note mechanics not re-verified this pass). Source: Joplin synchronisation spec page + syncInfoUtils.ts reference.
- **Chrome's and Firefox's shared lesson:** both use per-record/per-entity LWW with server-assigned versions/timestamps + client-side merge — not full-document CRDTs — for bookmark-like data.

---

## 3. The image problem (base64 backgrounds inside the document)

- Today: every write re-serializes the whole document including base64 blobs; localStorage is capped at 5 MiB/10 MiB per origin (MDN Storage quotas) which is why Stargate guards at 4 MB.
- **Move binaries out:** store each background/favicon as an immutable, content-addressed object — key = hex SHA-256 of the bytes — in R2; the document stores `{ hash, size }` (and optionally a local cache URL). Dedup is free: two workspaces reusing an image share one object.
- What breaks: the **export contract "one .json"**. The export file must still embed base64, so the client must be able to re-inline every referenced blob at export time. That means each device keeps a local IndexedDB blob cache; export runs from local cache (works offline); if a device lacks a blob it must fetch it or warn. This is a packaging change in the export code, not a format change — schemaVersion can stay "1" with an additive `hash` reference (per-entity), and exported JSON must translate references back to `dataUrl`. (Researcher inference: this is the cleanest way to preserve "one .json"; the alternative — exporting a .zip sidecar — *does* break the documented contract.)
- Precedent that proves the pattern at scale: Firefox Sync **payload-offload** — syncstorage-rs writes large payloads to object storage (GCS) and keeps only a `payload_link` URL in the BSO row; reads swap the payload back so "clients never learn that offload exists"; GC is a reconciler that deletes objects no row points at, plus a lifecycle policy (30-day reap) for objects from failed transactions (payload-offload/overview.md: "Moving the payload out of the database splits one write into two, and two writes can disagree. Everything else in this system exists to make them agree again.").
- GC for Stargate's one-writer design is simpler: on each doc save the Worker knows the complete set of referenced hashes; unreferenced objects (and orphans older than N days from interrupted uploads) can be deleted — `DeleteObject` is a **free** R2 operation (R2 pricing).
- Free-tier math with blobs out (R2 pricing, checked 2026-10-09): storage **10 GB-month free (Standard class only)**; **1M Class A ops/month** (Put/List/etc.); **10M Class B ops/month** (Get/Head); **egress is free, all classes**; deletes free. 10 GB ÷ ~3 MB worst-case per user ≈ several thousand heavy-image users before the free storage ceiling; Class A/B op budgets are rarely the binding constraint here. With images inline, D1 (2 MB row) and Firestore (1 MiB doc) are simply impossible — inline images only fit KV's 25 MiB value, and KV is the wrong store for write consistency (§5).
- Favicons (32×32 PNG ≤ 8 KB, hundreds of them): inline is cheap; keep them in the document, only background images (≤ 700 KB each) need R2. (Inference: keeps the document well under the 2 MB D1 row while eliminating the only multi-MB payloads.)

---

## 4. Offline and multi-device mechanics

- **Write queue + retry:** queue sync ops in IndexedDB (or localStorage for the queue metadata), flush on `online` events, exponential backoff, dedupe consecutive serializations of the same document. Nothing exotic; this is how Joplin lands queued item uploads (Joplin sync spec) and how Firefox clients gate on "are we online" before each sync (life-of-a-sync.md).
- **Concurrent offline edits:** with model (a), device B's queued PUT fails with 412; UI must offer "keep local copy" / "take server version" / best-effort 3-way merge. Design the client conflict UI once; it is the safety net for the whole design.
- **Clock skew:** server-assigned revision (or syncstorage-style server `modified` timestamps, "set automatically by the server according to its own clock; any client-supplied value is ignored" — api-1.5.md) is the reason server revisions beat client timestamps; Actual's own fix is HULC logical clocks precisely because wall clocks drift (timestamp.ts `maxDrift: 5 * 60 * 1000`). For (a) you don't need any clock logic beyond the server counter.
- **Multi-tab (same browser):** use BroadcastChannel (HTML standard) to notify other tabs that state changed, and **Web Locks API** for leader election so exactly one tab owns the sync queue — MDN's example is literally "ensure that only one tab is syncing data between the network and Indexed DB" (`navigator.locks.request("sync", ...)`).
- **Mobile constraints (verified):**
  - **Background Sync (`SyncManager`)** is implemented in Chrome/Edge (Chrome 49+), **not** in Firefox and **not** in Safari/WebView (mdn/browser-compat-data `api/SyncManager.json`: firefox false, safari false, webview_android false; WebKit bug 182565). So on iOS (unless EU iOS 17.4+ alternative-engine browser) there is no event-driven background sync — sync when the app is foregrounded/resumed only.
  - **Eviction (iOS Safari/WebKit):** script-writable storage is evicted origin-wide, "proactively ... if an origin has no user interaction ... in the last seven days" (MDN Storage quotas page); Safari 17+ origin quota ≈ 60% of disk for browser apps, 80% overall (WebKit storage policy post); `navigator.storage.persist()` requests are granted "based on heuristics like whether the website is opened as a Home Screen Web App" (WebKit post) — so the PWA/Home-Screen path is materially safer than plain Safari. Eviction deletes an origin's data **as a whole**, which is exactly why the server copy matters and why images should be re-fetchable.
  - **localStorage vs IndexedDB:** localStorage 5 MiB/origin cap (MDN); the synced document (+ queue + blob cache) belongs in IndexedDB, with `QuotaExceededError` handled.
  - No service-worker *requirement*: sync can run from the page; Background Sync is an enhancement for Chromium only.

---

## 5. Storage shape on the server (one row per user vs per entity) and payload caps

Per-value / per-document caps, read on vendor pages 2026-10-09:

| Store (free tier) | Per-value/row/doc limit | Other binding free-tier limits | Consistency |
|---|---|---|---|
| Cloudflare Workers KV | **value ≤ 25 MiB**, key ≤ 512 B | 100k reads/day; **1,000 writes/day (different keys)**, 1 write/s same key; 1 GB storage | **eventually consistent** (changes may take 60 s+ to propagate; "not ideal ... where you need ... atomic operations"; KV docs recommend Durable Objects/D1 for write-after-write consistency) — **disqualifying for CAS sync** |
| Cloudflare D1 (SQLite) | **string/BLOB/row ≤ 2,000,000 B (2 MB)**; SQL stmt ≤ 100 KB | 5M rows read/day, 100k rows written/day, 5 GB total storage, 10 DBs; no egress fees | strong per-DB consistency; single-writer transactions → natural CAS (`UPDATE ... WHERE revision=?`) |
| Cloudflare Durable Objects (SQLite) | (DO storage API, SQLite-backed only on Free) | free: 100k req/day, 13,000 GB-s/day, 5M rows read/100k written/day, 5 GB | single-writer per object id; the "one DO per user" pattern exists precisely for per-user state and WebSockets |
| Cloudflare R2 (blobs) | object ≤ 5 TiB; 5 GiB single-part upload | 10 GB-month free (Standard only), 1M Class A/mo, 10M Class B/mo, **egress free**, delete free | strong per-object; concurrent writes to same key 1/s |
| Firestore (Spark) | **document ≤ 1 MiB (1,048,576 B)**; field value ≤ 1 MiB − 89 B; request ≤ 10 MiB | 1 GiB stored, 50k reads/day, 20k writes/day, 10 GiB egress/mo | strong, transactions |

Consequences:
- **One row per user (D1)** is the clean fit: a JSON doc ≤ ~1–1.5 MB (settings + workspaces + kanban + favicons, backgrounds in R2) fits the 2 MB row; SQL `WHERE revision = ?` gives the §1(a) CAS in one statement; 100k rows written/day covers thousands of sync writes per day account-wide; scale-to-zero (no idle compute cost); free 5 GB total is the aggregate-user ceiling before $0.75/GB-mo.
- **One value per user (KV)** fits 25 MiB *but* KV gives no CAS and is eventually consistent — a sync source of truth must not be KV. (KV also has account-wide 1,000 writes/day on free, and 1 write/s to the same key.) Reject.
- **Per-entity rows** fit D1 trivially (each row tiny), but multiply the code (§1b) and consume the free budget faster (each list/fetch scans more rows toward the 5M rows-read/day). Not the v1 shape.
- **Firestore doc ≤ 1 MiB** caps any doc with inline images (4 MB doc impossible) and 1 GiB storage is the smallest free ceiling of the set.

---

## 6. Minimal REST surface (one person can implement and test)

All endpoints are JSON over HTTPS on the Workers route, same origin as the auth flows (avoids CORS token issues; GitHub Pages client is a pure consumer with CORS allowlist). User identity comes from OIDC `iss`+`sub` (OIDC Core §2/§5.7: `sub` is "a locally unique and never reassigned identifier within the Issuer", ≤ 255 ASCII; iss+sub is the only stable pair); the Worker derives `userId = sha256(iss|sub)` so no personal data is used as a key. Token validation (JWKS) belongs to the auth lane; surface here assumes a verified Bearer token.

| Method/Path | Request | Success | Failure |
|---|---|---|---|
| `POST /v1/doc` | initial document | `201 {revision}` | `409` if exists |
| `GET /v1/doc` | `If-None-Match: rev` | `200 {revision, doc}` / `304` | `404` (never synced) |
| `PUT /v1/doc` | `{doc}` with `If-Match: <revision>` | `200 {revision, updatedAt}` | **`412` → client must refetch and resolve** |
| `DELETE /v1/doc` | — | `204` | — |
| `POST /v1/objects` | raw bytes (content-addressed) | `201 {hash}` or `200` if already present | `413` if > cap (e.g. 2 MB) |
| `GET /v1/objects/{hash}` | — | `200` bytes, long cache headers | `404` |
| `GET /v1/health` | — | `200` | — |

Seven endpoints. The only subtle code is the D1 CAS UPDATE and the 412 branch; the objects endpoints are ~10 lines each against R2. Optional later: `GET /v1/doc/meta` (revision-only) to make device A cheaply ask "did anything change?" without pulling 1 MB — the info/collections pattern from syncstorage (api-1.5.md).

---

## Verdict: feasible at zero cost? Concrete path? What breaks at what scale?

**Feasible: yes, at true zero cost**, on Cloudflare's free tier (Workers + D1 + R2), which is scale-to-zero, charges nothing for idle, bills nothing for egress, and offers a GDPR-oriented data-protection program (Cloudflare GDPR/trust-hub pages; DPA and sub-processor disclosures are first-party pages, EU data-locality guidance exists).

**Picked:** Sync model = **(a) whole-document last-write-wins with a server-assigned monotonic revision and ETag/If-Match optimistic concurrency (RFC 9110 §13.1.1; the Firefox Sync write path proves the same shape with X-If-Unmodified-Since → 412)**. Storage shape = **one D1 row per user** (`user_id PRIMARY KEY, doc TEXT/JSON, revision INTEGER, updated_at INTEGER`) with CAS `UPDATE … WHERE user_id=? AND revision=?`, and **content-addressed background images in R2** referenced by SHA-256 hash in the document. Client: change queue in IndexedDB, Web Locks single-writer + BroadcastChannel invalidation, online-event flushes, one 412 resolution screen (keep local / take remote / best-effort 3-way merge later).

**Why over the alternatives:** CRDTs (c) cost +20–600 KB gzipped and a full model rewrite for merge semantics (RGA list ordering, LWW map keys) that do not match Stargate's positional-order + ID semantics, and their binary format collides with the one-JSON export contract. Per-entity server rows (b) and message logs (d) multiply code for marginal value on a personal multi-device app; the *client-side* 3-way merge (b-lite) is the cheap upgrade later. KV as the source of truth is disqualified by its own documentation (eventually consistent, "not ideal for atomic operations"); D1 gives the CAS in one statement.

**Limits that constrain it (the ones that will actually bite):**
1. **D1 row cap 2,000,000 B** → the synced JSON document must stay under ~1.5 MB → backgrounds must leave the document (R2), favicons can stay. This is a hard, vendor-documented constraint, not a style choice.
2. **Workers Free CPU 10 ms/invocation** (and 100k requests/day) → parsing/serializing a ~1 MB JSON body on every sync could approach the CPU budget; keep docs ≤ a few hundred KB and measure parse time. (Inference: parse of ~1 MB JSON is on the order of tens of ms in V8; must be measured on a real Worker before committing.) The 100k req/day budget limits polling cadence — design the client to sync on events/focus, not heartbeat-poll, or throttle.
3. **D1 free storage 5 GB total + R2 free 10 GB-month (Standard only), $0.75/GB-mo and $0.015/GB-mo beyond** → the true aggregate ceiling for the project (roughly mid-four-figures of users at ~1 MB doc + ~2-3 MB images each; beyond that the maintainer must delete stale data, raise limits, or pay — the first real cost trigger is Workers Paid's $5/mo minimum, since D1/R2 overage on free is hard-blocked, not billed).
4. **D1 free daily budgets (5M rows read / 100k rows written)** → not binding at hobby scale; 100k writes/day ≈ tens of thousands of doc saves/day.
5. **KV free 1,000 writes/day** — irrelevant once KV is rejected, but the reason "one KV value per user" would die at ~1,000 daily writers.
6. **Firestore doc ≤ 1 MiB / 1 GiB storage** — rules Firestore out for inline-image docs and gives the smallest overall ceiling.
7. **Safari/Firefox have no Background Sync** → sync runs on app foreground/resume; iOS storage may be evicted origin-wide after 7 days without interaction unless the app is Home-Screen-added (persist() heuristics) — the R2/D1 server copy is therefore also the *backup* story, not just the multi-device story.
8. **OIDC `iss`+`sub`** is the stable user key (≤ 255 ASCII; never assume `sub` alone is globally unique across providers).

**What breaks first in practice:** arbitrary *storage* volume (D1 5 GB + R2 10 GB free) — not operations. Silent conflict loss is prevented by design (412), but the UX of the 412 screen determines how "correct" users perceive it to be; that is the main product risk of picking (a).

---

## Contradictions
- None found between primary sources on the core numbers (all caps quoted above were read directly). 
- Nuance flagged, not contradiction: WebKit's storage-policy post describes Safari 17+ quotas (60%/80%), while MDN still documents the 7-day proactive eviction for origins without interaction — the two coexist (eviction is still proactive in Safari); the historical "7-day hard cap" wording has changed over time. Treat the MDN wording + WebKit post as the current state, medium confidence.
- Free-tier figures in this brief should be re-checked quarterly: Cloudflare docs pages themselves show different "Last updated" dates within 2026 (e.g., KV limits Oct 2026, D1 pricing Apr 2026, R2 limits Jun 2026), and Google/Firestore free quotas are periodically revised.

## Missing evidence / could not verify
- Firefox client-side conflict "forks" mechanics: not re-verified from primary source this pass (the mechanism of server timestamps + 412 + client-side resolution *is* documented; the "fork" terminology lives in Firefox client code I did not inspect).
- Actual Budget's exact field-level merge precedence (timestamp-ordered LWW) not re-verified from merged source this pass (HULC timestamps + merkle sync state are verified from source).
- Joplin "conflict note" creation mechanics not re-verified this pass (only the per-item sync_time model and updatedTime heuristics are verified).
- R2 bucket location selection (e.g., explicit EU region enum): the bucket-creation docs page exists but the location enum values were not captured; data-locality claims should be confirmed against Cloudflare's DPA/sub-processor pages before launch.
- Whether a ~1 MB document parse/serialize fits the 10 ms Workers Free CPU budget: needs a real measurement.
- OIDC/PKCE flow specifics, token storage and cross-device session handling: deliberately left to the auth lane.

## Sources (all primary; all checked 2026-10-09)
- RFC 9110 HTTP Semantics (If-Match §13.1.1, ETag §8.8.3): https://www.rfc-editor.org/rfc/rfc9110.html
- OpenID Connect Core 1.0 (§2 ID Token `sub`, §5.7 Claim Stability): https://openid.net/specs/openid-connect-core-1_0.html
- Cloudflare Workers KV – Limits: https://developers.cloudflare.com/kv/platform/limits/
- Cloudflare Workers KV – How KV works (eventual consistency): https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Cloudflare D1 – Limits: https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare D1 – Pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare R2 – Limits: https://developers.cloudflare.com/r2/platform/limits/
- Cloudflare R2 – Pricing: https://developers.cloudflare.com/r2/platform/pricing/
- Cloudflare R2 – Create new buckets: https://developers.cloudflare.com/r2/buckets/create-buckets/
- Cloudflare Workers – Limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Workers – Pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Durable Objects – Pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Cloudflare – Privacy & data protection (GDPR hub, DPA/sub-processors): https://www.cloudflare.com/trust-hub/privacy-and-data-protection/
- Firebase Firestore – Usage and limits: https://firebase.google.com/docs/firestore/quotas
- Mozilla syncstorage-rs – SyncStorage API v1.5 (BSO, `modified`, `newer`, X-If-Unmodified-Since → 412, payload ≥ 256 KiB): https://github.com/mozilla-services/syncstorage-rs/blob/main/docs/src/syncstorage/api-1.5.md
- Mozilla syncstorage-rs – Sync Client Overview (dumb server, collections/records, 2.5 GB quota): https://github.com/mozilla-services/syncstorage-rs/blob/main/docs/src/sync-client/overview.md
- Mozilla syncstorage-rs – The Life of a Sync: https://github.com/mozilla-services/syncstorage-rs/blob/main/docs/src/sync-client/life-of-a-sync.md
- Mozilla syncstorage-rs – Payload Offload (blob out, reconciler GC, 2.5 MB default payload cap, 30-day reap): https://github.com/mozilla-services/syncstorage-rs/blob/main/docs/src/payload-offload/overview.md
- Mozilla syncstorage-rs – Response codes: https://github.com/mozilla-services/syncstorage-rs/blob/main/docs/src/response-codes.md
- Chromium – Sync Architecture Overview (entities, specifics, metadata, Commit/GetUpdates, DataTypeSyncBridge merge): https://chromium.googlesource.com/chromium/src/+/main/components/sync/README.md
- Actual Budget – packages/crdt (README, timestamp.ts HULC, merkle.ts): https://github.com/actualbudget/actual/tree/master/packages/crdt
- Joplin – Synchronisation (items, sync_time, polling, updatedTime heuristics): https://joplinapp.org/help/dev/spec/sync/
- dmonad/crdt-benchmarks (bundle sizes gzipped: yjs 20,100 B; ywasm 213,833 B; loro 399,276 B; automerge-wasm 604,118 B; versions pinned): https://github.com/dmonad/crdt-benchmarks
- Automerge – Document Data Model (bytes, maps, lists, text/peritext, counters): https://automerge.org/docs/reference/documents/
- Yjs – README (shared types, network-agnostic, MIT): https://github.com/yjs/yjs
- Loro – README (wasm CRDT, snapshots): https://github.com/loro-dev/loro
- json-joy – README (JSON CRDT spec, patches): https://github.com/streamich/json-joy
- MDN – BroadcastChannel: https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel
- MDN – Web Locks API (leader election example): https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- MDN – SyncManager: https://developer.mozilla.org/en-US/docs/Web/API/SyncManager
- MDN – Storage quotas and eviction criteria (localStorage caps, origin-wide eviction, Safari 7-day proactive eviction): https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria
- WebKit – Updates to Storage Policy (Safari 17 quotas, persist() heuristics): https://webkit.org/blog/14403/updates-to-storage-policy/
- mdn/browser-compat-data – api/SyncManager.json (Chrome 49+, Firefox false, Safari false): https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json
- Current-date reference: https://timeapi.io/api/Time/current/zone?timeZone=Europe/Rome

### Deprioritized / rejected during research
- Secondary blog posts and SEO roundups about free tiers: rejected as citations (task rule: primary sources only).
- loro.dev/docs (403 on fetch; used GitHub README + crdt-benchmarks instead).
- mozilla-services.readthedocs.io legacy client docs (archived; redirected to syncstorage-rs docs, per its own header).