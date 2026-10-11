<script lang="ts">
  import { domainOf, letterTile } from "../store/core";
  import { isPlaceholderFavicon, remoteFaviconUrl } from "../store/favicons";
  import type { FaviconSource, Link } from "../store/types";

  let { link, px, faviconSource }: { link: Link; px: number; faviconSource: FaviconSource } = $props();

  const domain = $derived(domainOf(link.url));
  const tile = $derived(letterTile(domain));
  const stored = $derived(link.favicon?.dataUrl);
  const remote = $derived(remoteFaviconUrl(domain, faviconSource));

  // `source` is never "off" here: these handlers only fire on the remote <img>,
  // which is only rendered when `remote` is non-null, and that's null exactly
  // when faviconSource is "off" (#52).
  function onProbeLoad(source: Exclude<FaviconSource, "off">, img: HTMLImageElement) {
    if (isPlaceholderFavicon(source, { width: img.naturalWidth, height: img.naturalHeight })) {
      img.style.display = "none";
    }
  }

  function onProbeError(img: HTMLImageElement) {
    img.style.display = "none";
  }
</script>

<span class="favicon" style:background={stored ? undefined : `hsl(${tile.hue} 40% 46%)`} style:--favicon-size={`${px}px`}>
  {#if stored}
    <img class="favicon-img" src={stored} alt="" width={px} height={px} draggable={false} />
  {:else}
    <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
    {#if remote && faviconSource !== "off"}
      <img
        class="favicon-img"
        loading="lazy"
        src={remote}
        alt=""
        width={px}
        height={px}
        draggable={false}
        onload={(e) => onProbeLoad(faviconSource, e.currentTarget as HTMLImageElement)}
        onerror={(e) => onProbeError(e.currentTarget as HTMLImageElement)}
      />
    {/if}
  {/if}
</span>
