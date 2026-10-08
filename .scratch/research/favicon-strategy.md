# Research: Favicon strategy for Stargate (local-only homepage, no backend)

Ticket: wayfinder #2 — "Research: favicon strategy for a local-only homepage"
Method: live primary-source research via `curl` (HTTP probes of the actual endpoints, fetched spec/MDN/ToS pages) plus local measurement of real icon bytes with Python/Pillow. **All URLs below were fetched on 2026-10-08.** Claims that could not be verified against a fetched source are explicitly marked **[unverified]**.

This brief supersedes `favicon-strategy-draft-unverified.md` (the draft's "decision-critical open fact" — whether the favicon services send CORS headers — is now **answered: they do not**, see §2).

---

## 1. Favicon services: Google s2 and DuckDuckGo icons (live probes)

### 1.1 Google s2 (`https://www.google.com/s2/favicons?domain=<d>&sz=<n>`)

Probed live on 2026-10-08:

| Probe | Result |
|---|---|
| `GET .../s2/favicons?domain=example.com` (no follow) | `301 Moved Permanently` → `Location: https://t{N}.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://example.com&size=16`. The `sz` param is mapped onto faviconV2's `size`. |
| `domain=github.com&sz=32` (follow) | `200`, `image/png`, 519 B, measured PNG 32×32 |
| `domain=github.com&sz=16` | `200`, PNG 16×16, 330 B |
| `domain=github.com&sz=48` | `200`, **`image/jpeg`**, 1074 B, measured JPEG 48×48 (no alpha channel!) |
| `domain=github.com&sz=64` | `200`, PNG **32×32** (519 B) — the service does not honor every size; ≥64 behaves inconsistently |
| faviconV2 `size=128` direct | `200`, JPEG 128×128, 2533 B |
| faviconV2 `size=256` direct | `200`, JPEG 180×180, 3488 B |
| `domain=thisdomaindoesnotexist12345xyz.com&sz=32` | **`404` with a valid image body**: `image/png`, 726 B, generic globe PNG 16×16 |
| `domain=192.168.1.10&sz=32` (private IP) | `404` + same generic globe PNG (16×16, 726 B) — local/IP bookmarks get a useless globe |
| `domain=https://github.com/octocat` (full URL in param) | `200`, 32×32 PNG — the param tolerates full URLs |
| Response caching | gstatic body: `Cache-Control: public, max-age=604800` (7 days); s2 redirect: `max-age=1800` |

Observations that matter for Stargate:
- **Practical sweet spot is `sz=32`** (PNG with alpha, ~0.5 KB). `sz≥48` switches to JPEG (no transparency — bad on dark themes) and sizes above ~64 are not reliably honored (observed sz=64 → 32 px PNG).
- Unknown domains / IPs return a **generic globe with HTTP 404 but a decodable PNG body**. Because the HTML spec defines an image as `Broken` only when it "cannot even decode the image enough to get the image dimensions", a 404 with a decodable body does **not** fire `<img>` `error` — the globe renders (spec: https://html.spec.whatwg.org/multipage/images.html, "Broken" state definition, fetched 2026-10-08; network error = "a response whose type is `error`, status is 0" per https://fetch.spec.whatwg.org/#concept-network-error, fetched 2026-10-08; the in-browser rendering consequence is inference from these spec texts — **[unverified]** in a live browser).
- **CORS: none.** `curl` with `Origin: http://localhost:5173` on both HEAD and GET of the gstatic endpoint returned **no `Access-Control-Allow-Origin` header** (probe 2026-10-08).

ToS / official status:
- The s2 favicons endpoint is **undocumented**: there is no official Google developer page for it (**[unverified]** as a negative claim — no doc was findable; DuckDuckGo/Bing/Mojeek HTML search were bot-blocked during this run, so absence-of-docs was not exhaustively provable). Google's general Terms of Service apply (https://policies.google.com/terms, fetched 2026-10-08), including "Don't abuse our services" (no "interfere with, or disrupt" our systems; no "providing services that appear to originate from you (or someone else) when they actually originate from us") and a clause against "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt…)".
- https://www.google.com/robots.txt (fetched 2026-10-08) lists `Allow:` rules for `/s2/profiles`, `/s2/oz`, `/s2/photos`, `/s2/search/social` — **no rule mentions `/s2/favicons`** either way. (robots.txt governs crawlers, not browser `<img>` requests; noted for completeness.)

### 1.2 DuckDuckGo icons (`https://icons.duckduckgo.com/ip3/<domain>.ico`)

Probed live on 2026-10-08:

| Probe | Result |
|---|---|
| `ip3/github.com.ico` | `200`, `image/x-icon`, 6518 B — measured ICO containing 2 icons (16×16 + 32×32, 32 bpp) |
| `ip3/news.ycombinator.com.ico` | `200`, `image/x-icon`, 7527 B — ICO containing a single **256×256 PNG-compressed** image |
| `ip3/example.com.ico` | `200`, but `Content-Type: text/plain`, `Content-Length: 0` (empty body — DDG has no icon for example.com and serves a blank 200) |
| `ip3/thisdomaindoesnotexist12345xyz.com.ico` | `404` + generic globe PNG 48×48, 1478 B |
| `ip3/192.168.1.10.ico` | `404` + same generic globe PNG |
| `ip3/github.com/anything.ico` (path suffix) | `404` + globe — endpoint is strictly domain-shaped |
| Alternative host | `https://duckduckgo.com/ip3/github.com.ico` also `200 image/x-icon` (probed) |
| Response caching | `Cache-Control: max-age=2592000` (30 days) |

Observations that matter for Stargate:
- **No size parameter** — you get whatever the site's ICO contains: sometimes tiny 16×16, sometimes a 256×256 PNG inside an ICO (7.5 KB+). Unpredictable payload sizes.
- `.ico` (multi-image container) is decodable by browsers as `<img>` content, but if Stargate ever re-encodes/stores bytes, ICO needs decoding to a single raster (Pillow handles it; browser-side decoding of ICO via `createImageBitmap`/`<img>` yields the browser-picked sub-image).
- The empty-200 case (example.com) means `<img>` fires `error` (nothing to decode) — good, fallback triggers; but the 404-with-globe case does **not** fire `error` (same spec reasoning as §1.1) — the globe would show instead of a letter tile.
- **CORS: none.** No `Access-Control-Allow-Origin` on HEAD or GET with an `Origin` header (probe 2026-10-08).

ToS / usage restrictions:
- The ip3 endpoint is not covered by any endpoint-specific published terms (**[unverified]** — same search-blocked caveat). DuckDuckGo's Terms of Service (https://duckduckgo.com/terms, fetched 2026-10-08) say: "We expect you to use our Services as authorized, or we may otherwise suspend access," require compliance with the DuckDuckGo Acceptable Use Policy, and state "We don't track you."
- The Acceptable Use Policy (https://duckduckgo.com/acceptable-use, fetched 2026-10-08) prohibits, among other things: "**Frame, inline link, or similarly display any portion of the services within another service**" and "Sell or resell any portion of the services". Hotlinking DDG's icon endpoint inside a third-party homepage is arguably an "inline link… of a portion of the services" — **whether ip3 icons count as "the Services" and whether `<img>` embedding counts as "inline linking" is interpretation, [unverified]**. This is a real (if likely low-enforcement) ToS risk for using DDG as a default icon provider in a distributed open-source app.

### 1.3 Privacy trade-offs (both services)

- Every rendered icon is an HTTP request from the user's machine to the provider carrying: **the bookmarked domain** (in the URL), the user's **IP address**, User-Agent, and — under the browser default referrer policy `strict-origin-when-cross-origin` — the **origin of the Stargate page** (MDN: "This default policy (strict-origin-when-cross-origin), unless it's overwritten by a Referrer-Policy HTTP header" — https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy, fetched 2026-10-08). A homepage with 100 tiles that all use a remote service therefore **discloses the user's bookmark set to Google or DDG**.
- Mitigating factor: both endpoints send long `Cache-Control` freshness (7 d Google / 30 d DDG), so the browser HTTP cache suppresses repeat requests while fresh (MDN HTTP caching guide: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching, fetched 2026-10-08). The HTTP cache is per-browser-profile, not app-controlled, and does not survive export/import to another machine.
- DDG's ToS says "We don't track you" (fetched, §1.2); Google's privacy policy exists at https://policies.google.com/privacy (fetch returned 200; contents not analyzed here). Choosing between providers on privacy grounds beyond the raw disclosure fact is out of scope of verifiable claims — **[unverified]**.

---

## 2. Direct fetch of site icons and `<img>`+canvas capture

### 2.1 Reading bytes cross-origin with `fetch()`/XHR

- `fetch()` default mode is `cors`; MDN: "the server still must opt-in using `Access-Control-Allow-Origin` to **share** the response with the script" (https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS, fetched 2026-10-08).
- `mode: 'no-cors'` is not a workaround: MDN RequestMode — "The response is **opaque**, meaning that its headers and body are not available to JavaScript" (https://developer.mozilla.org/en-US/docs/Web/API/Request/mode, fetched 2026-10-08).
- Live header probes (2026-10-08, `curl` with `Origin: http://localhost:5173`):
  - `https://github.com/favicon.ico` — `200 image/x-icon`, **no ACAO**
  - `https://www.google.com/favicon.ico` — `200 image/x-icon`, **no ACAO**
  - `https://news.ycombinator.com/favicon.ico` — `200 image/x-icon` on GET (HEAD returns 405), **no ACAO**
  - Counter-examples: `https://github.githubassets.com/favicons/favicon.png` → `Access-Control-Allow-Origin: *`; `https://www.wikipedia.org/static/favicon/wikipedia.ico` → `Access-Control-Allow-Origin: *`.
- Conclusion: direct byte-level fetching of site icons works only for the minority of origins whose icon URL is served with CORS headers (often asset CDNs, not the site's own `/favicon.ico`). A general "download the icon bytes" feature cannot rely on it, but a best-effort attempt (try `fetch`, catch the CORS TypeError) is legitimate and will succeed for some sites.

### 2.2 `<img>` + canvas capture — tainting

- MDN canvas tutorial: "By default, externally fetched images **taint the canvas**, preventing your site from reading data cross-origin. Using the `crossorigin` attribute … If the hosting domain permits cross-domain access to the image, the image can be used in your canvas without tainting it" (https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Using_images, fetched 2026-10-08).
- MDN `crossorigin` attribute reference: for `img` without the attribute, "When resource is placed in `<canvas>`, element is marked as **tainted**" (https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/crossorigin, fetched 2026-10-08).
- Spec chain (all fetched 2026-10-08):
  - HTML images: an `<img>`'s current request carries a CORS flag — `CORS-same-origin` or `CORS-cross-origin`; "this affects the image's interaction with other APIs (e.g., when used on a `canvas`)" (https://html.spec.whatwg.org/multipage/images.html).
  - HTML canvas: "An object `image` **is not origin-clean** if … `HTMLOrSVGImageElement`: image's current request's image data is `CORS-cross-origin`" (https://html.spec.whatwg.org/multipage/canvas.html, "The image argument is not origin-clean"); `drawImage` then sets the context's `origin-clean` flag to false (same page, drawing-images steps).
  - `toDataURL()`: "If this canvas element's bitmap's origin-clean flag is set to false, then **throw a `SecurityError` DOMException**" (same page; also MDN https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL: Exceptions → SecurityError "The canvas's bitmap is not origin clean", fetched 2026-10-08).
- `crossorigin="anonymous"` only helps **if the server sends ACAO**; otherwise the image fails to load entirely (MDN crossorigin page: CORS request without permission fails). Since **neither Google s2/gstatic nor DDG ip3 sends ACAO** (§1, probed), canvas capture of their icons is **impossible** — and so is `fetch()` of them. There is no client-side path to "hoard" bytes from these two services.

---

## 3. Client-side `<link rel="icon">` discovery — viable without a proxy?

**No.**

- Discovery means fetching the target site's **HTML** and parsing `<link rel=icon>`. From browser JS that is a cross-origin `fetch()` subject to §2.1's rules; live probe: `https://github.com/` returned `200 text/html` with **no ACAO header** (curl, 2026-10-08), representative of general websites.
- The HTML Standard defines icon collection/selection (type/media/sizes, last-declared wins, legacy default of resolving "/favicon.ico" against the document URL) as a **user-agent** behavior for documents it renders — it provides no API for web content to query another site's declared icons (https://html.spec.whatwg.org/multipage/links.html, §4.6.8.9 "Link type icon", fetched 2026-10-08).
- The only script-usable approximation is guessing well-known URLs (`/favicon.ico`, asset paths) and loading them as `<img>` — displayable, but per §2 generally **not byte-readable**.

---

## 4. Offline behaviour and localStorage byte cost

### 4.1 Offline / unreachable service

- When an image can't be fetched or decoded, the HTML spec sets the request state to `Broken` ("cannot even decode the image enough to get the image dimensions (e.g. the image is corrupted, or the format is not supported, or **no data could be obtained**)") and the UA must "fire an event named `error` at element" (https://html.spec.whatwg.org/multipage/images.html, updating-the-image-data steps; MDN HTMLElement error event: https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/error_event, fetched 2026-10-08). → Stargate's `onerror` handler swaps in the letter tile.
- While offline, previously fetched icons **may still render from the browser HTTP cache** if fresh (Google 7 d / DDG 30 d `Cache-Control`, probed §1; caching semantics: MDN HTTP caching guide, fetched 2026-10-08). This is best-effort, not app-controlled, and not portable across browsers/profiles/exports.
- Caveat from §1: both services answer unknown domains with a **decodable generic globe** (404/200-with-body), so `error` does not fire in those cases — a letter tile will not automatically replace a globe unless the app detects it (not reliably possible client-side).

### 4.2 Storage cost of base64 icons in localStorage (measured, 2026-10-08)

Base64 expands 3 input bytes to 4 output characters (RFC 4648 §4: "The encoding process represents 24-bit groups of input bits as output … concatenating 3 8-bit input groups", https://www.rfc-editor.org/rfc/rfc4648.txt, fetched 2026-10-08) → **×4/3 ≈ +33 %**. Data-URL syntax `data:<mediatype>;base64,<data>`: MDN https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data (fetched 2026-10-08).

Measured with Pillow 12.1.1 (LANCZOS resample) from GitHub's real 32×32 favicon, plus real service outputs:

| Image | Raw bytes | base64 chars |
|---|---|---|
| 16×16 PNG (re-encoded) | 774 B | 1 032 |
| 32×32 PNG (re-encoded) | 897 B | 1 196 |
| 48×48 PNG (re-encoded) | 3 681 B | 4 908 |
| 16×16 WebP lossy q80 | 350 B | 468 |
| 32×32 WebP lossy q80 | 358 B | 480 |
| 48×48 WebP lossy q80 | 1 746 B | 2 328 |
| Google s2 16px PNG (wire) | 330 B | 440 |
| Google s2 32px PNG (wire) | 519 B | 692 |
| Google faviconV2 128px JPEG (wire) | 2 533 B | 3 380 |
| DDG ip3 github.com.ico (wire) | 6 518 B | 8 692 |
| DDG ip3 news.ycombinator.com.ico (256px, wire) | 7 527 B | 10 036 |
| wikipedia.org /favicon.ico (multi-size ICO, wire) | 2 734 B | 3 648 |

Takeaways:
- A **normalized 32×32 PNG costs ~1–1.2 KB of base64** per icon; even a fat unnormalized DDG ICO is ~10 KB. 48px PNGs are disproportionately large (~5 KB b64) — 32px is the right canonical size (renders crisply at 16 CSS px on 2× displays).
- Budget: 200 bookmarks × ~1.2 KB ≈ **240 KB** — under 5 % of the per-origin localStorage quota.
- Quota: MDN — "Web Storage … is limited to 10 MiB of data maximum on all browsers. Browsers can store up to **5 MiB of local storage** … per origin. Once this limit is reached, browsers throw a **QuotaExceededError**" (https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria, fetched 2026-10-08). Favicons compete with Stargate's base64 background images for this budget (see sibling ticket #3).
- Format for stored bytes: **PNG**, not WebP or JPEG. JPEG loses alpha (Google itself serves JPEG at sz≥48 — observed §1.1); WebP *encoding* via `toDataURL` is optional per MDN — "Browsers are required to support image/png; many will support additional formats including image/jpeg and image/webp", detectable because "if the returned value starts with `data:image/png` for any other requested type, then that format is not supported" (https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL, fetched 2026-10-08). WebP *decoding* is near-universal (caniuse global usage 96.74 %; Safari 14–15.6 flagged partial: "requires macOS 11 Big Sur or later" — https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/webp.json, fetched 2026-10-08), but PNG encoding is the only universally guaranteed canvas export, and PNG data URLs are guaranteed to render in every browser importing the JSON. WebP lossless/q80 saves ~50–60 % (~500–660 b64 chars at 32px) if an export-size optimization is ever wanted; at favicon scale it isn't worth the compatibility surface.
- `toDataURL()` warning worth remembering if re-encoding ever moves to large images: MDN advises `toBlob()` + `createObjectURL` for large images (same page) — irrelevant at 32 px.

### 4.3 Sensible caps (recommendation input)

- Canonical stored form: **32×32 PNG data URL**, typical ~1.2 KB base64.
- Per-icon hard cap at write time: **8 KB base64** (blocks unnormalized ICO/256px payloads; ~6.7× the typical case).
- Global favicon budget guidance: warn above ~1 MB total, given the 5 MiB quota shared with backgrounds (arbitrary threshold — engineering judgment, not a cited fact).

---

## 5. Fallback strategies: letter-avatar / first-letter tiles

- No web-standard fallback-icon API exists; the fallback must be app-generated (absence claim; consistent with the HTML icon spec exposing nothing to scripts, §3).
- The pattern: first character of title/domain on a background color derived from a stable hash of the domain (e.g., hash → HSL hue). Pure CSS/Svelte, **zero network, zero storage, works offline, survives export/import** (nothing to export). Rendering primitives are standard (CSS colors: https://www.w3.org/TR/css-color-4/ — **[unverified]**, not fetched this run; Unicode-safe first code point via `codePointAt`/`Array.from`: MDN https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/codePointAt — **[unverified]**, not fetched this run).
- Prior art / library status (npm registry, fetched 2026-10-08 via https://registry.npmjs.org/<pkg>): `favico` 1.2.2 last published **2017-04-14**; `letter-avatar` 1.1.0 last published **2017-05-24**; `ui-avatars` 1.0.0 last published **2019-05-26**. All effectively unmaintained → implement the tile in-app (a dozen lines of Svelte); no dependency justified.
- Hosted generator ui-avatars.com is live (`GET /api/?name=John+Doe` → `200 image/png`, `Cache-Control: max-age=31536000`, and notably `Access-Control-Allow-Origin: *`; probed 2026-10-08) — unnecessary third-party dependency for something CSS can do locally; listed only to show a CORS-friendly letter-avatar source exists if server-rendered tiles were ever needed.
- Because both icon services serve **decodable generic globes for unknown domains without firing `error`** (§1, §4.1), the letter tile cannot rely on `onerror` alone when a remote service is in the chain; it is cleanest as the *default/base layer* with the remote icon layered on top only when a toggle opts in (see Recommendation).

---

## RECOMMENDATION

**Primary approach — three-tier resolution, letter tile as the base layer:**

1. **Stored data URL (per-bookmark, highest priority).** If the bookmark has `favicon.dataUrl`, render it directly. Works offline, zero network, self-contained in the JSON export; data URLs render in every browser (MDN data: URL page, §4.2 citations).
2. **Letter tile (always-present base layer).** Deterministic first-character tile, hue from a hash of the domain. Pure CSS — no storage, no network, no ToS surface. This is what shows whenever tier 1 is absent and tier 3 is disabled, unreachable, or slow.
3. **Remote service (opt-in setting, lazy, rendered tiles only).** `<img loading="lazy" src="https://icons.duckduckgo.com/ip3/{domain}.ico">` **or** `https://www.google.com/s2/favicons?domain={domain}&sz=32`, behind a settings toggle ("Fetch favicons from DuckDuckGo / Google") whose copy states plainly that the provider learns which domains appear on the start page (§1.3). Prefer `sz=32` Google (PNG+alpha, ~0.7 KB b64-equivalent) for visual quality; prefer DDG for the stated no-tracking posture — but flag the DDG AUP "inline link" clause (§1.2) as a **[unverified]** legal-gray-zone risk; Google s2 is undocumented but has no equivalent explicit clause. Let the user choose; default the toggle **off** for a privacy-first product (product decision for the maintainer — flagged, not decided here).
   - Handle the globe problem: services return generic globes for unknown domains **without** `onerror` (§4.1) — accept it, or suppress remote tier for hosts that are IPs/localhost (trivially detectable in-app).

**Hoarding ("save this icon locally") — constrained by hard findings:**
- **Neither service can be hoarded client-side**: no ACAO (probed §1), so `fetch()` fails and `<img crossorigin="anonymous">` fails to load at all; plain `<img>` + canvas taints → `toDataURL()` throws `SecurityError` (§2.2). This resolves the draft's open question #1: the answer is **no**.
- Viable hoard sources, in order: (a) **user-provided icons** (file upload / paste — `File`/`Blob` objects are always readable, no CORS involved); (b) **best-effort direct fetch** of the site's own icon URL when that origin happens to send ACAO (works for e.g. github.githubassets.com, wikipedia static — probed §2.1; catch and skip on failure).
- Any hoarded bytes must be **normalized before store**: decode → draw to 32×32 canvas → `toDataURL('image/png')` → enforce the 8 KB base64 cap (§4.3).

**Export-schema implications (single .json, bump `schemaVersion`):**

```jsonc
// optional field on each bookmark-link object; absence = letter tile
"favicon": {
  "dataUrl":   "data:image/png;base64,iVBOR…",  // REQUIRED if object present; 32×32 PNG
  "source":    "custom" | "direct" | "google-s2" | "duckduckgo",
  "fetchedAt": "2026-10-08T08:00:00Z"           // ISO 8601, for staleness/refresh UI
}
```
- **Never store the remote service URL as the icon value** — store real bytes or nothing, so the export stays self-contained, offline-capable, and portable across browsers/machines (and so the importer doesn't silently inherit a third-party request set).
- Write-time caps: reject icons > **8 KB base64** after normalization; warn when total favicon payload > ~1 MB against the 5 MiB per-origin quota shared with backgrounds (§4.2).
- Import tolerance: unknown/malformed/oversized `favicon` objects are **dropped field-wise** (bookmark survives import); the letter tile guarantees graceful degradation in every case.

---

## Could-not-verify list (carried forward honestly)

1. Official documentation/ToS existence for Google s2 favicons and DDG ip3 — none found; general Google ToS, DDG ToS and DDG AUP fetched and cited instead. "Undocumented" is a negative claim; HTML search engines (DDG, Bing, Mojeek, searx.be) were bot-blocked during this run, so discovery was limited to known first-party URLs.
2. Whether DDG's AUP "inline link" clause legally covers `<img>`-embedding ip3 icons in a third-party app — interpretation only.
3. In-browser rendering of the services' 404-with-globe responses (no `error` event) — inferred from fetched spec text (HTML "Broken" definition + fetch network-error definition), not exercised in a live browser during this run.
4. CSS color / `codePointAt` MDN/W3C pages cited in §5 were **not** re-fetched this run (standard, low-risk primitives) — marked inline.
5. Google s2 behavior for HTTPS-only or blocked domains (whether `url=http://…` upstream fetch ever fails for HSTS-only sites) — not probed.
6. Exact 2026 localStorage quotas per browser build beyond MDN's "5 MiB per origin" statement — MDN figure cited; per-browser re-verification belongs to sibling ticket #3.
