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
    expect(s.settings.faviconSource).toBe("off");
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
