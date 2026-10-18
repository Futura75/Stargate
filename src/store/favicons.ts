import type { FaviconSource } from "./types";

/**
 * Remote favicon providers (#2, #52). Both are opt-in-by-default-off in spirit
 * (privacy: the provider learns the domain being looked up) but are now
 * attempted automatically when a link is added — see App.svelte's favicon
 * snippet and SPEC.md §3.5.
 */
export function remoteFaviconUrl(domain: string, source: FaviconSource): string | null {
  if (source === "google-s2") {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
  }
  if (source === "duckduckgo") {
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
  }
  return null;
}

type RemoteFaviconSource = Exclude<FaviconSource, "off">;

interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Both Google S2 and DuckDuckGo's ip3 favicon services serve a generic
 * "globe" placeholder instead of cleanly failing when a site has no favicon
 * (see issue #52). Because neither sends CORS headers (SPEC.md §3.5), the
 * response bytes can't be read via fetch()+arrayBuffer() from browser JS to
 * hash them — but an already-loaded <img>'s intrinsic naturalWidth/
 * naturalHeight IS readable cross-origin without CORS. Each provider's
 * placeholder happens to come back at a fixed size regardless of the
 * requested size, which a real favicon at our requested size essentially
 * never coincidentally matches. Verified against live traffic 2026-10-11:
 * Google's placeholder is 16x16 (we request sz=32; a real icon like
 * github.com's comes back 32x32); DuckDuckGo's is 48x48.
 */
const PLACEHOLDER_DIMENSIONS: Record<RemoteFaviconSource, ImageDimensions> = {
  "google-s2": { width: 16, height: 16 },
  duckduckgo: { width: 48, height: 48 },
};

/** True when the loaded image's dimensions match the given provider's known placeholder size exactly. */
export function isPlaceholderFavicon(source: RemoteFaviconSource, dims: ImageDimensions): boolean {
  const placeholder = PLACEHOLDER_DIMENSIONS[source];
  return dims.width === placeholder.width && dims.height === placeholder.height;
}

/** Stable cache key for memoizing a per-domain-per-source probe result in memory (never persisted). */
export function faviconProbeKey(domain: string, source: FaviconSource): string {
  return `${source}:${domain}`;
}
