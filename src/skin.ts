/* Visual skins: presentation helpers. The chosen skin itself lives in the document (settings.skin). */

import { DEFAULT_SKIN, SKINS } from "./store/core";
import type { Skin } from "./store/types";

export { SKINS };

export const SKIN_LABEL: Record<Skin, string> = {
  salvia: "Salvia",
  giardino: "Giardino",
  atlante: "Atlante",
  reticolo: "Reticolo",
};

const FONT_LINK_ID = "stargate-skin-fonts";

const FONT_HREF: Partial<Record<Skin, string>> = {
  giardino: "https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@500;600&display=swap",
  atlante:
    "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600&family=Spectral:ital,wght@1,300;1,400&display=swap",
  reticolo: "https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&display=swap",
};

/** ?skin=<name> previews a look without touching the saved setting. */
export function previewSkin(): Skin | undefined {
  const raw = new URLSearchParams(location.search).get("skin") ?? "";
  return SKINS.find((s) => s === raw);
}

export function applySkin(skin: Skin = DEFAULT_SKIN): void {
  document.body.dataset.skin = skin;
  const href = FONT_HREF[skin];
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
