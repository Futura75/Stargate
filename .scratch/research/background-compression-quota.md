# Research: Client-side background compression & localStorage quota practices (Stargate #3)

> **Written from model knowledge — claims NOT re-verified live in this run; parent will spot-check via HTTP before ticket resolution.**
> No web_search/fetch tool was available in this subagent runtime. Citations below point to the canonical primary sources that own each claim, but URLs and exact wording were not fetched/verified in this run. Every decision-critical claim is repeated in "Needs verification / residual risks" (§6). Where confidence is low, it is labeled as such.

## Summary

For Stargate (static Svelte app, backgrounds embedded as base64 data URLs in localStorage), the best pipeline is a **hand-rolled Canvas resize + encode** (~80–100 lines): decode via `createImageBitmap`, downscale to max 1920 px with `imageSmoothingQuality: 'high'`, encode via `canvas.toBlob` to **WebP q0.80 when a runtime feature-detect passes, otherwise JPEG q0.80**, with an iterative quality/dimension fallback until the data URL is ≤ ~500–700 KB. Budget the ~5 MB per-origin localStorage quota manually (character accounting, not `navigator.storage.estimate()`, which tracks the whole storage bucket and not the localStorage per-origin cap), reserve ~3 MB total for backgrounds and ~1 MB for config, and handle `QuotaExceededError` with an explicit user-facing recovery flow. IndexedDB as an escape hatch is **not a v1 concern**.

---

## 1. Canvas API resize + encode

### 1.1 Scaling quality (`drawImage`)

- **Claim:** 2D canvas downscaling quality is controlled by `imageSmoothingEnabled` and `imageSmoothingQuality` (`'low' | 'medium' | 'high'`); `'high'` requests better filtering (bilinear/bicubic-class) at higher cost.
  **Sources:** MDN — `CanvasRenderingContext2D.imageSmoothingQuality` (https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality); MDN — `CanvasRenderingContext2D.drawImage` (https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage).
  **Support:** direct evidence (well-established API surface). **Confidence:** high.
- **Claim (practical):** Very large single-step downscales (e.g., 6000 px → 900 px) can alias/moiré on some engines; the common mitigation is iterative halving (draw to intermediate canvases at ~½ size per step). For photo backgrounds downscaled to 1920 px, a single high-quality `drawImage` is usually adequate; iterative halving is cheap insurance for huge source images (>4× reduction).
  **Sources:** community/engineering consensus, e.g. Stack Overflow "Scaling images in Canvas" threads (https://stackoverflow.com/questions/18922880/html5-canvas-resize-downscale-image-high-quality); no single spec owns filtering quality — the HTML spec leaves rendering quality implementation-defined (WHATWG HTML, "Drawing images to the canvas": https://html.spec.whatwg.org/multipage/canvas.html#drawing-images-to-the-canvas).
  **Support:** interpretation/inference from implementation-defined behavior. **Confidence:** medium.

### 1.2 Encoding: `toBlob` / `toDataURL`, quality parameter

- **Claim:** `canvas.toBlob(callback, type, quality)` asynchronously produces a `Blob`; `canvas.toDataURL(type, quality)` synchronously produces a base64 data URL. The `quality` argument (0–1) applies only to lossy types (`image/jpeg`, `image/webp`); implementations choose a default (commonly ~0.92) when omitted. If the requested `type` is not supported by the encoder, the browser falls back to `image/png`.
  **Sources:** MDN — `HTMLCanvasElement.toBlob` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob); MDN — `HTMLCanvasElement.toDataURL` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL); WHATWG HTML spec — `dom-canvas-toblob` / `dom-canvas-todataurl` (https://html.spec.whatwg.org/multipage/canvas.html#dom-canvas-toblob).
  **Support:** direct evidence. **Confidence:** high.
- **Claim:** Prefer `toBlob` over `toDataURL` in the compression step (async, no main-thread base64 stringify of a multi-MB string); convert the final accepted Blob to a data URL only once, at the end.
  **Sources:** API semantics per MDN links above (synchronous vs asynchronous).
  **Support:** interpretation (inference from API design). **Confidence:** high.

### 1.3 WebP **encoding** support across current browsers

- **Claim:** Canvas **WebP encoding** (`toBlob`/`toDataURL` with `image/webp`) is supported in **Chrome/Edge/Opera** (long-standing) and in **Firefox since Firefox 65** (WebP decode shipped in 65; canvas WebP encode shipped in the same era).
  **Sources:** MDN compatibility tables on `HTMLCanvasElement.toDataURL` (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL#browser_compatibility) and caniuse "WebP image format" notes (https://caniuse.com/webp); Mozilla platform status (https://platform.mozilla.org/).
  **Support:** direct evidence per compat data (not re-fetched). **Confidence:** high for Chrome/Edge/Opera, **medium for the exact Firefox version** (needs verification).
- **Claim (decision-critical):** **Safari does not support WebP canvas encoding.** Safari 14+ (2020, macOS Big Sur) added WebP *decoding*, but `toBlob`/`toDataURL` with `type: 'image/webp'` silently falls back to **PNG** — which for a 1920 px photo is far *larger* than JPEG. Treating "Safari supports WebP" (true for `<img>` decoding) as "Safari can encode WebP" (false) is the classic bug here.
  **Sources:** WebKit blog — WebP support in Safari 14 covers decoding (https://webkit.org/blog/); caniuse WebP entry notes encoding separately from decoding (https://caniuse.com/webp); MDN `toDataURL` compat table (Safari row).
  **Support:** direct evidence per compat data (not re-fetched this run). **Confidence:** medium-high — **flagged for spot-check; this materially changes the recommendation.**
- **Claim:** Robust feature-detect: encode a tiny (2×2) canvas to `image/webp` and check the result starts with `data:image/webp`; do this once at startup and choose the encoder accordingly. Checking only decode support (e.g., `HTMLImageElement` loading a WebP) is insufficient.
  **Sources:** standard technique documented on MDN `toDataURL` page notes and Modernizr's webp test (https://github.com/Modernizr/Modernizr/blob/master/feature-detects/webp.js — decode-oriented, hence the need for an encode-specific test).
  **Support:** interpretation. **Confidence:** high (the technique itself is straightforward and self-verifying at runtime).

**Implication for Stargate:** the encoder choice must be made at runtime per browser, not at build time. JPEG q0.80 is the universally safe baseline; WebP is a ~25–35% size win where encoding is supported.

---

## 2. Libraries: browser-image-compression vs Compressor.js vs hand-rolled

### 2.1 browser-image-compression

- **Claim:** npm package `browser-image-compression` (repo: DonaldZhan/browser-image-compression). API: `imageCompression(file, options)` returning a Promise<Blob>; options include `maxSizeMB`, `maxWidthOrHeight`, `initialQuality`, `fileType`, `useWebWorker`, `maxIteration`, `alwaysKeepResolution`. It runs compression in a Web Worker when `useWebWorker: true` (worker code is inlined/extracted from the bundle), and iterates quality/resolution until `maxSizeMB` is met.
  **Sources:** npm (https://www.npmjs.com/package/browser-image-compression); GitHub README (https://github.com/DonaldZhan/browser-image-compression).
  **Support:** direct evidence per README (not re-fetched). **Confidence:** high on API surface.
- **Claim:** Size: roughly ~10 kB minified / ~4 kB gzipped (approximate, from memory of the package). Maintenance: last releases around v2.0.x in 2022–2023; commit activity slowed since. Not abandoned but not rapidly evolving.
  **Sources:** npm version history (https://www.npmjs.com/package/browser-image-compression); bundlephobia (https://bundlephobia.com/package/browser-image-compression).
  **Support:** interpretation from memory of package metadata. **Confidence:** low-medium — **needs verification** (exact kB and last-publish date).

### 2.2 Compressor.js

- **Claim:** npm package `compressorjs` (repo: fengyuanchen/compressorjs). API: `new Compressor(file, { quality, maxWidth, maxHeight, minWidth, minHeight, mimeType, convertSize, success, error })` — callback-oriented, canvas-based, runs on the main thread (no worker support). `convertSize` controls when large PNGs are converted to JPEG. Same maintainer ecosystem as Cropper.js (actively maintained project family; Compressor.js itself has infrequent releases, ~v1.2.x).
  **Sources:** npm (https://www.npmjs.com/package/compressorjs); GitHub (https://github.com/fengyuanchen/compressorjs).
  **Support:** direct evidence per README (not re-fetched). **Confidence:** high on API shape; low-medium on exact version/date — needs verification.

### 2.3 Hand-rolled canvas pipeline

- **Claim (inference):** Both libraries are thin wrappers around exactly the Canvas primitives in §1 (decode → drawImage downscale → toBlob encode → optional iteration). Stargate's requirement is narrow and fully specified (background images, max 1920 px, known quality targets, known byte cap, known encoder feature-detect). A hand-rolled module is ~80–100 lines, zero supply-chain surface, zero bundle cost, and can be unit-tested with fake canvases/blobs. The main things the libraries add are (a) worker offload (browser-image-compression) and (b) edge-case handling for EXIF orientation and odd file types.
  - EXIF orientation note: modern browsers apply EXIF orientation automatically when decoding via `<img>`/`createImageBitmap` with `imageOrientation: 'from-image'` (MDN: https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap — `imageOrientation` option). Relevant because Compressor.js historically handled orientation manually.
  **Support:** researcher inference from the libraries' documented implementations. **Confidence:** medium-high.
- Worker offload value for Stargate: encoding one 1920 px JPEG/WebP takes tens-to-hundreds of ms on typical hardware; with a loading spinner this is acceptable on the main thread. **Inference. Confidence:** medium.

---

## 3. Data-URL overhead

- **Claim:** Base64 expands binary data by exactly 4/3 (every 3 octets → 4 characters), plus 0–2 `=` padding chars: **+33.3%**. This is definitional.
  **Sources:** RFC 4648 §4 "Base 64 Encoding" (https://datatracker.ietf.org/doc/html/rfc4648#section-4).
  **Support:** direct evidence (spec). **Confidence:** high.
- **Claim:** Data-URL prefix cost: `data:image/jpeg;base64,` and `data:image/webp;base64,` are each 23 characters — negligible.
  **Sources:** RFC 2397 data URL scheme (https://datatracker.ietf.org/doc/html/rfc2397); MDN data URLs (https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URLs).
  **Support:** direct computation. **Confidence:** high.
- **Claim:** Realistic per-background cost at 1920×1080, photographic content:
  - **JPEG q80:** ~250–600 KB binary → **~335–800 KB as base64**.
  - **WebP q80:** typically ~25–35% smaller than JPEG at similar perceptual quality → ~175–420 KB binary → **~235–560 KB as base64**.
  The WebP-vs-JPEG delta is the commonly cited ~30% (Google's WebP documentation claims ~25–34% smaller than JPEG at equivalent SSIM).
  **Sources:** Google WebP docs / developers.google.com/speed/webp (https://developers.google.com/speed/webp); web.dev "Serve images in modern formats" (https://web.dev/articles/serve-images-modern-formats).
  **Support:** the ~30% delta is direct evidence from Google's docs; the absolute KB ranges are **researcher estimates** dependent on image content (flat graphics compress far smaller; noisy photos far larger). **Confidence:** medium (ranges), high (expansion factors).
- **Claim (important, under-appreciated):** JavaScript strings are UTF-16 (ECMA-262, https://tc39.es/ecma262/#sec-ecmascript-language-types-string-type). Browsers that meter localStorage in *bytes of UTF-16 storage* effectively charge **2 bytes per ASCII character**, so a base64 data URL can consume up to **~2.67× the original binary size** against the quota (binary × 4/3 chars × 2 bytes). Whether each browser meters characters or UTF-16 bytes differs and is not spec'd — budget conservatively at 2 bytes/char until verified.
  **Sources:** WHATWG HTML spec — the `localStorage` section specifies a "storage quota" but leaves the size to implementations (https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface); ECMA-262 string type.
  **Support:** spec for UTF-16 strings; the 2-bytes-per-char quota accounting is **interpretation** of observed browser behavior. **Confidence:** medium — flagged for verification.

---

## 4. Quota mechanics

### 4.1 Per-origin localStorage limits

- **Claim:** The HTML spec does not fix a localStorage size; it requires user agents to impose a quota and fire `QuotaExceededError` when exceeded. All major browsers implement **~5 MB per origin** as the practical limit:
  - **Chrome/Chromium:** 5 MB per origin.
  - **Firefox:** 5 MB per origin (controlled by `dom.storage.default_quota` ≈ 5120 KiB); exceeding shows/throws rather than prompting for more in current versions.
  - **Safari:** 5 MB per origin; throws `QuotaExceededError`. Older Safari private-browsing modes had a near-zero quota (historical); current Safari private browsing allows ephemeral localStorage. Safari may also evict all script-writable storage after 7 days of non-interaction under ITP (see §5).
  **Sources:** WHATWG HTML — Web storage, "Disk space" (https://html.spec.whatwg.org/multipage/webstorage.html#disk-space); MDN `localStorage` / `Window.localStorage` notes (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage); MDN `QuotaExceededError` (https://developer.mozilla.org/en-US/docs/Web/API/DOMException#quotaexceedederror); Firefox prefs — searchfox.org `dom.storage.default_quota` (https://searchfox.org/mozilla-central/search?q=dom.storage.default_quota); WebKit ITP (https://webkit.org/tracking-prevention/#state).
  **Support:** direct evidence for the 5 MB convention (MDN/vendor docs); exact per-browser numbers are **needs-verification** because they are implementation details that have shifted historically (e.g., mobile Safari, Firefox per-profile pooling). **Confidence:** high that ~5 MB is the right planning number; medium on exact per-browser figures.
- **Claim (planning rule):** Because of UTF-16 accounting (§3), treat the usable capacity as **~2.5 million ASCII characters ≈ 5 MB of string data**, not 5 million characters. Budget in `key.length + value.length` summed over all keys, and treat the ceiling as ~4 MB (80%) for safety.
  **Support:** researcher inference (conservative). **Confidence:** medium.

### 4.2 `QuotaExceededError` detection

- **Claim:** Detect via `try { localStorage.setItem(k, v) } catch (e)` and check `e.name === 'QuotaExceededError'` (DOMException, per WebIDL/MDN). Legacy robustness: also accept `e.code === 22 || e.code === 1014` and `e.name === 'NS_ERROR_DOM_QUOTA_REACHED'` (older Firefox). The check must wrap *every* write of large values, and should be done **before** committing a new background by measuring sizes first (§4.3), with the try/catch as the last line of defense (e.g., quota changed underneath you, or another tab wrote).
  **Sources:** MDN `DOMException` / `QuotaExceededError` (https://developer.mozilla.org/en-US/docs/Web/API/DOMException); MDN Web storage docs.
  **Support:** direct evidence. **Confidence:** high.

### 4.3 `navigator.storage.estimate()` — does it help?

- **Claim:** `StorageManager.estimate()` returns `{ usage, quota }` for the origin's **storage bucket** — the aggregate of site storage the browser tracks against its eviction quota (IndexedDB, Cache Storage, service workers, file system access, etc.). The `quota` it reports is a large fraction of available disk (hundreds of MB to GB), **not** the ~5 MB localStorage per-origin cap. Whether `usage` includes localStorage bytes is browser-dependent and not guaranteed (Chromium has moved DOM storage under the storage service over time; the Storage standard does not require localStorage to be reflected).
  **Sources:** MDN `StorageManager.estimate()` (https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate); WHATWG Storage Standard — `StorageManager` (https://storage.spec.whatwg.org/#storagemanager); web.dev "Storage quota and eviction guidelines" (https://web.dev/articles/storage-for-the-web).
  **Support:** direct evidence for the bucket-level semantics; the "may or may not include localStorage" part is **interpretation** of the spec's silence + implementation variation. **Confidence:** high that it is **unusable for localStorage budgeting** regardless of the inclusion question, because the reported `quota` is the eviction quota, not the localStorage cap.
- **Claim (consequence):** Stargate must track its own usage: keep a running `usedBytes ≈ Σ (key.length + value.length) × 2` computed from the actual stored JSON, or measure candidate values with `new Blob([str]).size` (UTF-8 bytes; equals char count for pure-ASCII base64) and double it for conservatism.
  **Support:** researcher inference from §4.1–4.3. **Confidence:** high (as an engineering practice).

### 4.4 Practical budgeting (proposal)

Given ~5 MB per origin and UTF-16 accounting uncertainty:

| Bucket | Budget (string bytes, conservative) | Notes |
|---|---|---|
| Hard ceiling | ~5,000,000 B (≈2.5M chars ×2) | browser-enforced |
| Safety margin | stop writing at ~4,000,000 B | 80% of ceiling |
| Config JSON (workspaces/columns/blocks/links/kanban) | ≤ ~1,000,000 B | typical config is «100 KB; headroom for power users |
| Backgrounds (all workspaces combined, base64 incl. prefix) | ≤ ~3,000,000 B total | ≈ 4–6 backgrounds at ≤500–700 KB base64 each |
| Per-background cap (base64 string) | ≤ ~700,000 B (target ~500 KB) | enforced by the compression loop, not by the writer |

**Support:** researcher inference from the numbers above. **Confidence:** medium — the exact split is a product decision; the constraints (measure in chars, keep ≥20% margin, cap per-image) are the defensible parts.

User-facing behaviour on pressure: (1) if a compressed image still exceeds the per-image cap, auto-step down quality/dimensions (§Recommendation); (2) if a write would breach the total background budget, tell the user *before* writing ("Adding this background would exceed the storage budget — replace the existing one or lower quality"); (3) if `QuotaExceededError` fires anyway, keep the previous config intact (write new value only after success, or use a two-slot key swap), surface an error, and offer "remove backgrounds" / "export backup now".

---

## 5. IndexedDB as fallback — v1 concern or future fog?

- **Claim:** IndexedDB quotas are orders of magnitude larger than localStorage: browsers compute per-origin limits from available disk (Chrome: up to ~60% of disk for the whole bucket; Firefox: pool-based, group limit ~2 GB per origin group without prompting; Safari: starts around ~1 GB with prompts above). IndexedDB stores **Blobs natively** — no base64 expansion, no UTF-16 penalty.
  **Sources:** WHATWG Storage Standard — quotas (https://storage.spec.whatwg.org/#quota); MDN IndexedDB (https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API); web.dev storage quota article (https://web.dev/articles/storage-for-the-web); Firefox storage docs (https://firefox-source-docs.mozilla.org/dom/storage.html).
  **Support:** direct evidence (numbers vary by version — the exact figures are needs-verification; the "orders of magnitude larger + native Blob storage" conclusion is solid). **Confidence:** high on the conclusion.
- **Claim:** Safari's ITP evicts **all script-writable storage** (localStorage, IndexedDB, Cache, service worker registrations) for origins the user hasn't interacted with in 7 days. So IndexedDB buys no extra *durability* on Safari — it only buys capacity. This undercuts the main non-capacity argument for moving early.
  **Sources:** WebKit blog — ITP 2.2/2.3 announcements (https://webkit.org/blog/8828/intelligent-tracking-prevention-2-3/ and https://webkit.org/blog/); WebKit tracking prevention page (https://webkit.org/tracking-prevention/).
  **Support:** direct evidence. **Confidence:** high.
- **Claim (export constraint):** Stargate's export must remain a single `.json` with `schemaVersion`. Moving backgrounds to IndexedDB would not change that: on export, Blobs must be read (`blob.arrayBuffer()`) and base64-encoded into the JSON anyway; on import, decoded back. So IndexedDB changes only the *storage* location, adding async complexity to every read/write path (startup hydration, atomic config+background writes, migration logic) while the interchange format is identical.
  **Support:** researcher inference from the stated product constraints + MDN Blob/FileReader APIs (https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer). **Confidence:** high.
- **Judgement:** With §1–§4 compression (≤1920 px, q0.8, ≤~700 KB base64/image), localStorage comfortably holds several backgrounds plus config within a 3 MB background budget. IndexedDB is only needed if the product later wants *original, uncompressed* images retained, many-per-workspace galleries, or >~6 backgrounds. **It can stay future fog — not a v1 concern.** Design note to keep the door open: store backgrounds as opaque string URLs in the config schema (they already are data URLs); a future `idb://`-style indirection or a parallel `backgrounds` object keyed by background ID would be a non-breaking schema addition (bump `schemaVersion`).
  **Support:** researcher inference. **Confidence:** medium-high.

---

## 6. Needs verification / residual risks (spot-check list for parent)

Decision-critical claims NOT re-verified live in this run, in priority order:

1. **Safari WebP canvas *encoding* is unsupported (falls back to PNG).** Check MDN `HTMLCanvasElement.toDataURL`/`toBlob` browser-compat tables and caniuse.com/webp notes. If Safari ≥ some recent version added WebP encoding, the encoder fallback matrix simplifies. *(Highest impact on recommendation.)*
2. **Firefox WebP canvas encoding version floor** (claimed ≥65) — MDN compat table.
3. **Per-browser localStorage quota exact figures** (Chrome 5 MB/origin; Firefox `dom.storage.default_quota` = 5120 KiB; Safari 5 MB) and **whether the quota meters UTF-16 bytes (~2.5M ASCII chars) or characters (~5M chars)** — MDN Web storage page, searchfox for the Firefox pref, or an empirical in-browser fill test. This determines whether the conservative 2×-bytes budgeting in §4.4 can be relaxed.
4. **Whether `navigator.storage.estimate().usage` includes localStorage** in current Chrome/Firefox/Safari — WHATWG Storage Standard + chromium docs (`chrome.storage`/storage service docs) or empirical test. (Recommendation doesn't depend on the answer — we self-meter regardless — but the brief asserts it.)
5. **browser-image-compression maintenance status & bundle size** (last publish date, min/gzip kB, worker behavior) — npm page + bundlephobia + GitHub releases. Only matters if we choose the library over hand-rolled.
6. **Compressor.js current version/maintenance** — npm/GitHub.
7. **JPEG/WebP output size ranges at 1920×1080 q80** (§3) — empirical: run the actual pipeline on 5–10 representative user-style wallpapers. Ranges are content-dependent estimates.
8. **Safari ITP 7-day eviction scope** (all script-writable storage incl. IndexedDB & localStorage) — webkit.org tracking-prevention page.
9. **Exact IndexedDB per-origin quota figures** for Chrome/Firefox/Safari — storage.spec.whatwg.org + web.dev storage article. (Only affects the future-fog judgement, not v1.)

## RECOMMENDATION

**Target format / dimensions / quality**
- Max dimension **1920 px** (cap width *and* height; keep aspect ratio). Rationale: matches typical fullscreen display need; keeps JPEG q80 output in the ~250–600 KB binary range (§3).
- Encoder chosen at runtime: **WebP q0.80 if a canvas-encode feature-detect passes (Chrome/Edge/Opera/Firefox), else JPEG q0.80** (Safari). Never request `image/webp` blindly — the PNG fallback is larger than the original problem.
- Hard cap per background: **≤ ~500 KB target / ~700 KB absolute, measured on the final base64 data-URL string** (~935 KB worst-case quota charge under UTF-16 accounting).

**Compression pipeline — hand-rolled Canvas module, not a library**
- `createImageBitmap(file, { imageOrientation: 'from-image' })` → offscreen/2D canvas at target size → single `drawImage` with `imageSmoothingQuality: 'high'` (iterative halving only if source > 4× target) → `canvas.toBlob(type, quality)`.
- Iterative fit loop: quality 0.80 → 0.72 → 0.64; if still over cap, dimensions 1920 → 1600 → 1280; reject the upload (with a clear message) only if it can't get under cap.
- Convert the winning Blob to a data URL once (`FileReader.readAsDataURL` or manual base64 from `arrayBuffer()`), then store.
- Rationale: ~80–100 lines, zero dependencies, full control of the byte cap and encoder detect; the libraries (§2) add mostly worker offload, which isn't needed for a single 1920 px encode behind a spinner. Keep `browser-image-compression` as the drop-in alternative if the team prefers not to own the code (verify maintenance first, §6.5).

**Quota strategy**
- Self-meter usage: `used ≈ Σ (key.length + value.length)` chars, budgeted as **2 bytes/char (conservative UTF-16 accounting)**; ceiling 5 MB, write-guard at **4 MB (80%)**; sub-budgets **≤3 MB backgrounds total, ≤1 MB config JSON** (§4.4).
- Do **not** use `navigator.storage.estimate()` for this — it reports the storage-bucket eviction quota, not the localStorage cap (§4.3).
- Pre-check before every large write; also wrap `setItem` in try/catch for `e.name === 'QuotaExceededError'` (+ legacy `code 22/1014`, `NS_ERROR_DOM_QUOTA_REACHED`).
- Never lose data on quota failure: write to a temp key and swap only on success; on failure, keep the previous config, surface an actionable error ("storage full — remove a background or export a backup"), and offer to re-run compression at lower settings.
- Export/import: unchanged single `.json` with `schemaVersion`; base64 data URLs already serialize trivially.

**IndexedDB: future fog, not v1.** Compressed backgrounds fit the localStorage budget; IDB adds async complexity without changing the export format, and buys no durability on Safari (ITP evicts it too). Keep the schema indirection-friendly (backgrounds keyed by ID) so an IDB tier can be added later behind a `schemaVersion` bump (§5).

---

## 7. Parent verification log (curl spot-checks, 2026-10-08)

The claims in §6 were spot-checked by the parent session against primary sources over HTTP:

1. **Safari WebP canvas encoding — UNSUPPORTED, confirmed.** WebKit bug 226950 "Canvas (HTMLCanvasElement.toDataURL) can't export it's data to image/webp" is RESOLVED **WONTFIX** (https://bugs.webkit.org/show_bug.cgi?id=226950); layout-test bug 125499 "canvas-toDataURL-webp.html layout test is failing" still **NEW**, last activity 2026-03-26 (https://bugs.webkit.org/show_bug.cgi?id=125499). The runtime encode feature-detect + JPEG q0.80 fallback is mandatory. Note: caniuse's "webp" entry tracks `<img>` **decoding** only (Safari 14+ shows "y") — it must not be used to infer encoding support.
2. **Firefox WebP canvas encoding — version claim CORRECTED.** Encoding shipped in **Firefox 96** (bug 1511670 "Implement WebP image encoder", FIXED, target_milestone "96 Branch", https://bugzilla.mozilla.org/show_bug.cgi?id=1511670) — *not* 65 (65 was decoding only). The `quality` parameter for WebP `toBlob`/`toDataURL` was fixed in **Firefox 98** (bug 1750475, https://bugzilla.mozilla.org/show_bug.cgi?id=1750475). §1.3's "≥65" is wrong; the practical conclusion is unchanged (all current Firefox releases encode WebP with quality).
3. **Firefox localStorage quota = 5 MB confirmed (primary source).** `dom.storage.default_quota` = `5 * 1024` KiB, "enforcing simple per-origin quota only" (mozilla-central `modules/libpref/init/StaticPrefList.yaml`, https://hg.mozilla.org/mozilla-central/raw-file/tip/modules/libpref/init/StaticPrefList.yaml). Chrome/Safari exact figures not primary-source-verified this run; the ~5 MB planning number stands. UTF-16-bytes vs characters metering remains unverified — keep the conservative 2-bytes/char budgeting.
4. **`navigator.storage.estimate()` — confirmed at doc level.** MDN describes origin storage-bucket usage/quota with no localStorage inclusion guarantee (https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate). The "self-meter, don't use estimate()" conclusion stands unchanged.
5. **Library status — UPDATED from npm registry (2026-10-08).** `browser-image-compression` latest 2.0.2, last publish **2023-03-06** (dormant 3+ years). `compressorjs` latest **1.4.0, published 2026-10-01** (actively maintained) — the drop-in library alternative is compressorjs if the team prefers not to own the code (https://registry.npmjs.org/browser-image-compression, https://registry.npmjs.org/compressorjs). The hand-rolled recommendation stands on bundle-size/control grounds.
6. **Safari ITP 7-day cap — confirmed (primary source).** webkit.org/tracking-prevention/ documents "7-Day Cap on All Script-Writeable Storage": eviction after 7 days without user interaction (https://webkit.org/tracking-prevention/).
7. **Still open (empirical, deferred to implementation):** actual JPEG/WebP output sizes at 1920px q80 (§6.7); exact IndexedDB per-origin figures (§6.9 — future fog anyway).
