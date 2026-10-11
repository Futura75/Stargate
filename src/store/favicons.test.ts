import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  deserialize,
  firstLetter,
  hueOf,
  letterTile,
  MAX_FAVICON_BASE64,
  removeFavicon,
  setFavicon,
  setFaviconSource,
} from "./core";
import { faviconProbeKey, isPlaceholderFavicon, remoteFaviconUrl } from "./favicons";
import type { Favicon, FaviconSource, StargateState } from "./types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

function ids(s: StargateState) {
  const w = s.workspaces[0].id;
  const c = s.workspaces[0].columns[0].id;
  const b = s.workspaces[0].columns[0].blocks[0].id;
  const l = s.workspaces[0].columns[0].blocks[0].links[0].id;
  return { w, c, b, l };
}

function favicon(): Favicon {
  return { dataUrl: "data:image/png;base64,AAAA", source: "custom", fetchedAt: "2026-01-01T00:00:00.000Z" };
}

describe("hueOf", () => {
  it("is deterministic and always in [0, 359]", () => {
    for (const s of ["", "github.com", "news.ycombinator.com", "😀", "A", "a"]) {
      const hue = hueOf(s);
      expect(hue).toBe(hueOf(s));
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("spreads common domains across different hues", () => {
    const hues = new Set(
      ["github.com", "example.com", "news.ycombinator.com", "reddit.com", "wikipedia.org"].map(hueOf),
    );
    expect(hues.size).toBeGreaterThan(1);
  });
});

describe("firstLetter", () => {
  it("uppercases the first Unicode code point", () => {
    expect(firstLetter("github.com")).toBe("G");
    expect(firstLetter("éxample.com")).toBe("É");
    expect(firstLetter("a")).toBe("A");
    expect(firstLetter("💻dev.example")).toBe("💻");
  });

  it("ignores leading whitespace", () => {
    expect(firstLetter("  github.com")).toBe("G");
  });

  it("returns an empty string for an empty domain", () => {
    expect(firstLetter("")).toBe("");
  });
});

describe("letterTile", () => {
  it("derives the letter and hue from a domain", () => {
    expect(letterTile("github.com")).toEqual({ letter: "G", hue: hueOf("github.com") });
  });
});

describe("remoteFaviconUrl", () => {
  it("builds the Google S2 URL for a domain", () => {
    expect(remoteFaviconUrl("github.com", "google-s2")).toBe(
      "https://www.google.com/s2/favicons?domain=github.com&sz=32",
    );
  });

  it("builds the DuckDuckGo ip3 URL for a domain", () => {
    expect(remoteFaviconUrl("github.com", "duckduckgo")).toBe("https://icons.duckduckgo.com/ip3/github.com.ico");
  });

  it("returns null when the source is off", () => {
    expect(remoteFaviconUrl("github.com", "off")).toBeNull();
  });

  it("percent-encodes special characters in the domain", () => {
    expect(remoteFaviconUrl("exämple.com", "google-s2")).toBe(
      "https://www.google.com/s2/favicons?domain=ex%C3%A4mple.com&sz=32",
    );
  });
});

describe("isPlaceholderFavicon", () => {
  it("flags the Google S2 16x16 globe placeholder", () => {
    expect(isPlaceholderFavicon("google-s2", { width: 16, height: 16 })).toBe(true);
  });

  it("flags the DuckDuckGo 48x48 globe placeholder", () => {
    expect(isPlaceholderFavicon("duckduckgo", { width: 48, height: 48 })).toBe(true);
  });

  it("does not flag a real favicon at the requested size", () => {
    expect(isPlaceholderFavicon("google-s2", { width: 32, height: 32 })).toBe(false);
  });

  it("does not flag dimensions that are merely close to the placeholder size", () => {
    expect(isPlaceholderFavicon("google-s2", { width: 16, height: 17 })).toBe(false);
    expect(isPlaceholderFavicon("google-s2", { width: 17, height: 16 })).toBe(false);
    expect(isPlaceholderFavicon("duckduckgo", { width: 48, height: 47 })).toBe(false);
  });

  it("does not cross-apply one provider's placeholder size to the other", () => {
    expect(isPlaceholderFavicon("duckduckgo", { width: 16, height: 16 })).toBe(false);
    expect(isPlaceholderFavicon("google-s2", { width: 48, height: 48 })).toBe(false);
  });
});

describe("faviconProbeKey", () => {
  it("combines source and domain into a stable cache key", () => {
    expect(faviconProbeKey("github.com", "google-s2")).toBe("google-s2:github.com");
    expect(faviconProbeKey("github.com", "duckduckgo")).toBe("duckduckgo:github.com");
  });

  it("produces different keys for different domains or sources", () => {
    expect(faviconProbeKey("github.com", "google-s2")).not.toBe(faviconProbeKey("example.com", "google-s2"));
    expect(faviconProbeKey("github.com", "google-s2")).not.toBe(faviconProbeKey("github.com", "duckduckgo"));
  });
});

// End-to-end exercise of the real-presence decision pipeline (#52): given a domain,
// a chosen provider, and the dimensions an <img> loaded with, these three pure
// helpers compose into "show the remote icon" vs. "fall back to the letter tile" —
// the same decision App.svelte's favicon snippet and onFaviconProbeLoad/Error make,
// just without the DOM. This is what `faviconProbeCache` ends up storing.
describe("real-presence probe pipeline (remoteFaviconUrl + isPlaceholderFavicon + faviconProbeKey)", () => {
  function decide(domain: string, source: "google-s2" | "duckduckgo", loaded: { width: number; height: number }) {
    const url = remoteFaviconUrl(domain, source);
    const real = url !== null && !isPlaceholderFavicon(source, loaded);
    return { url, cacheKey: faviconProbeKey(domain, source), shownAsReal: real };
  }

  it("shows the real favicon when Google S2 returns the requested size", () => {
    const result = decide("github.com", "google-s2", { width: 32, height: 32 });
    expect(result.shownAsReal).toBe(true);
    expect(result.url).toBe("https://www.google.com/s2/favicons?domain=github.com&sz=32");
    expect(result.cacheKey).toBe("google-s2:github.com");
  });

  it("falls back to the letter tile when Google S2 returns its 16x16 placeholder", () => {
    const result = decide("thisdomaindoesnotexist9999999xyz.com", "google-s2", { width: 16, height: 16 });
    expect(result.shownAsReal).toBe(false);
  });

  it("falls back to the letter tile when DuckDuckGo returns its 48x48 placeholder", () => {
    const result = decide("thisdomaindoesnotexist9999999xyz.com", "duckduckgo", { width: 48, height: 48 });
    expect(result.shownAsReal).toBe(false);
  });

  it("shows the real favicon when DuckDuckGo returns a real .ico at a non-placeholder size", () => {
    const result = decide("github.com", "duckduckgo", { width: 16, height: 16 });
    expect(result.shownAsReal).toBe(true);
    expect(result.url).toBe("https://icons.duckduckgo.com/ip3/github.com.ico");
  });
});

describe("setFavicon / removeFavicon", () => {
  it("stores a favicon on a link without mutating the original state", () => {
    const s = seed();
    const { w, c, b, l } = ids(s);
    const next = setFavicon(s, w, c, b, l, favicon());
    expect(next.workspaces[0].columns[0].blocks[0].links[0].favicon).toEqual(favicon());
    expect(s.workspaces[0].columns[0].blocks[0].links[0].favicon).toBeUndefined();
    expect(next).not.toBe(s);
  });

  it("removes a stored favicon", () => {
    const s = seed();
    const { w, c, b, l } = ids(s);
    const withFavicon = setFavicon(s, w, c, b, l, favicon());
    const removed = removeFavicon(withFavicon, w, c, b, l);
    const link = removed.workspaces[0].columns[0].blocks[0].links[0];
    expect(link.favicon).toBeUndefined();
    expect("favicon" in link).toBe(false);
  });

  it("is a no-op when the link or favicon is missing", () => {
    const s = seed();
    const { w, c, b, l } = ids(s);
    expect(setFavicon(s, "x", c, b, l, favicon())).toBe(s);
    expect(removeFavicon(s, w, c, b, l)).toBe(s);
  });
});

describe("setFaviconSource", () => {
  it.each(["off", "google-s2", "duckduckgo"] as const)("sets faviconSource to %s", (source: FaviconSource) => {
    const s = seed();
    const next = setFaviconSource(s, source);
    expect(next.settings.faviconSource).toBe(source);
    expect(next.settings).toEqual({
      theme: "system",
      searchEngine: "google",
      faviconSource: source,
      openWorkspace: "first",
    });
    expect(s.settings.faviconSource).toBe("google-s2");
    expect(next).not.toBe(s);
    expect(next.settings).not.toBe(s.settings);
    expect(next.workspaces).toBe(s.workspaces);
  });
});

describe("deserialize favicon sanitization", () => {
  function withFavicon(favicon: unknown): string {
    const s = seed();
    const link = s.workspaces[0].columns[0].blocks[0].links[0];
    (link as { favicon?: unknown }).favicon = favicon;
    return JSON.stringify(s);
  }

  function firstLink(s: StargateState) {
    return s.workspaces[0].columns[0].blocks[0].links[0];
  }

  it("keeps a valid stored favicon", () => {
    const out = deserialize(withFavicon(favicon()));
    expect(firstLink(out).favicon).toEqual(favicon());
  });

  it("drops a remote URL favicon and keeps the link", () => {
    const out = deserialize(
      withFavicon({ dataUrl: "https://example.com/icon.ico", source: "direct", fetchedAt: "2026-01-01T00:00:00.000Z" }),
    );
    const link = firstLink(out);
    expect("favicon" in link).toBe(false);
    expect(link.title).toBe("Stargate repo");
    expect(link.url).toBe("https://github.com/Futura75/Stargate");
  });

  // #52: auto-resolved remote favicons (google-s2/duckduckgo) are deliberately NOT
  // persisted — Google/DuckDuckGo send no CORS headers (SPEC.md §3.5), so the browser
  // can't read the response bytes to store them as a data: URL, only an already-loaded
  // <img>'s dimensions. The real-presence check therefore runs at render time, re-probed
  // each session, and nothing new is written to a link's `favicon` field for it. This
  // sanitize rule is unchanged on purpose: a `google-s2`/`duckduckgo`-sourced favicon is
  // only ever accepted if it is (hypothetically, e.g. a future export/import path) already
  // a data: URL, exactly like `custom` — a bare remote reference is still rejected.
  it("drops a google-s2-sourced favicon that is a remote URL, not a data: URL", () => {
    const out = deserialize(
      withFavicon({
        dataUrl: "https://www.google.com/s2/favicons?domain=github.com&sz=32",
        source: "google-s2",
        fetchedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect("favicon" in firstLink(out)).toBe(false);
  });

  it("keeps a google-s2-sourced favicon when it is already a data: URL", () => {
    const out = deserialize(
      withFavicon({
        dataUrl: "data:image/png;base64,AAAA",
        source: "google-s2",
        fetchedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(firstLink(out).favicon).toEqual({
      dataUrl: "data:image/png;base64,AAAA",
      source: "google-s2",
      fetchedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("drops a favicon with a missing dataUrl", () => {
    const out = deserialize(withFavicon({ source: "custom", fetchedAt: "2026-01-01T00:00:00.000Z" }));
    expect("favicon" in firstLink(out)).toBe(false);
  });

  it("drops an oversized favicon", () => {
    const out = deserialize(
      withFavicon({
        dataUrl: "data:image/png;base64," + "A".repeat(MAX_FAVICON_BASE64),
        source: "custom",
        fetchedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect("favicon" in firstLink(out)).toBe(false);
  });

  it("drops a non-object favicon", () => {
    const out = deserialize(withFavicon("nope"));
    expect("favicon" in firstLink(out)).toBe(false);
  });
});
