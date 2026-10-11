import type { FaviconSize, LinkStyle } from "../store/types";

/** `detail` second line: drop the protocol and any trailing slash for display (#33). */
export function bareUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

export const LINK_STYLE_OPTIONS: LinkStyle[] = ["list", "detail", "tiles"];
export const LINK_STYLE_LABEL: Record<LinkStyle, string> = {
  list: "List",
  detail: "Detail",
  tiles: "Tiles",
};

export const FAVICON_SIZE_OPTIONS: FaviconSize[] = ["sm", "md", "lg"];
export const FAVICON_SIZE_LABEL: Record<FaviconSize, string> = {
  sm: "Small 16",
  md: "Medium 24",
  lg: "Large 32",
};
export const FAVICON_SIZE_PX: Record<FaviconSize, number> = {
  sm: 16,
  md: 24,
  lg: 32,
};

/** `tiles` renders a fixed large favicon regardless of the block's faviconSize (#33). */
export const TILE_FAVICON_PX = 40;
