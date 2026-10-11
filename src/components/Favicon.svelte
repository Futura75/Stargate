<script lang="ts">
  import { domainOf, letterTile } from "../store/core";
  import type { FaviconSource, Link } from "../store/types";

  function remoteFaviconUrl(domain: string, source: FaviconSource): string | null {
    if (source === "google-s2") {
      return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
    }
    if (source === "duckduckgo") {
      return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
    }
    return null;
  }

  let { link, px, faviconSource }: { link: Link; px: number; faviconSource: FaviconSource } = $props();

  const domain = $derived(domainOf(link.url));
  const tile = $derived(letterTile(domain));
  const stored = $derived(link.favicon?.dataUrl);
  const remote = $derived(remoteFaviconUrl(domain, faviconSource));
</script>

<span class="favicon" style:background={stored ? undefined : `hsl(${tile.hue} 40% 46%)`} style:--favicon-size={`${px}px`}>
  {#if stored}
    <img class="favicon-img" src={stored} alt="" width={px} height={px} draggable={false} />
  {:else}
    <span class="tile-letter" aria-hidden="true">{tile.letter}</span>
    {#if remote}
      <img
        class="favicon-img"
        loading="lazy"
        src={remote}
        alt=""
        width={px}
        height={px}
        draggable={false}
        onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
      />
    {/if}
  {/if}
</span>
