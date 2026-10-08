import { describe, expect, it } from "vitest";
import { addLink, addWorkspace, createDefaultState, renameLink, setLinkUrl } from "./core";
import type { StargateState } from "./types";

interface Fixture {
  s: StargateState;
  ws1: string;
  ws2: string;
  colA: string;
  blkA: string;
  link1: string;
  link2: string;
}

function fixture(): Fixture {
  let s = createDefaultState("2026-01-01T00:00:00.000Z");
  const ws1 = s.workspaces[0].id;
  s = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
  const ws2 = s.workspaces[1].id;
  const colA = s.workspaces[0].columns[0].id;
  const blkA = s.workspaces[0].columns[0].blocks[0].id;
  s = addLink(s, ws1, colA, blkA, "https://example.com Example");
  const [link1, link2] = s.workspaces[0].columns[0].blocks[0].links.map((l) => l.id);
  return { s, ws1, ws2, colA, blkA, link1, link2 };
}

function links(s: StargateState) {
  return s.workspaces[0].columns[0].blocks[0].links;
}

describe("renameLink", () => {
  it("sets only the link title and leaves the url untouched", () => {
    const f = fixture();
    const next = renameLink(f.s, f.ws1, f.colA, f.blkA, f.link2, "Docs");
    expect(links(next).map((l) => l.title)).toEqual(["Stargate repo", "Docs"]);
    expect(links(next)[1].url).toBe("https://example.com");
    expect(links(next)[0]).toBe(links(f.s)[0]);
    expect(next).not.toBe(f.s);
  });

  it("returns the same state reference when an id is missing", () => {
    const f = fixture();
    expect(renameLink(f.s, "x", f.colA, f.blkA, f.link1, "T")).toBe(f.s);
    expect(renameLink(f.s, f.ws1, "x", f.blkA, f.link1, "T")).toBe(f.s);
    expect(renameLink(f.s, f.ws1, f.colA, "x", f.link1, "T")).toBe(f.s);
    expect(renameLink(f.s, f.ws1, f.colA, f.blkA, "x", "T")).toBe(f.s);
    expect(renameLink(f.s, f.ws2, f.colA, f.blkA, f.link1, "T")).toBe(f.s);
  });
});

describe("setLinkUrl", () => {
  it("sets only the link url and leaves the title untouched", () => {
    const f = fixture();
    const next = setLinkUrl(f.s, f.ws1, f.colA, f.blkA, f.link2, "https://docs.example.com");
    expect(links(next)[1].url).toBe("https://docs.example.com");
    expect(links(next)[1].title).toBe("Example");
    expect(links(next)[0]).toBe(links(f.s)[0]);
    expect(next).not.toBe(f.s);
  });

  it("returns the same state reference when an id is missing", () => {
    const f = fixture();
    expect(setLinkUrl(f.s, "x", f.colA, f.blkA, f.link1, "https://nope.example")).toBe(f.s);
    expect(setLinkUrl(f.s, f.ws1, "x", f.blkA, f.link1, "https://nope.example")).toBe(f.s);
    expect(setLinkUrl(f.s, f.ws1, f.colA, "x", f.link1, "https://nope.example")).toBe(f.s);
    expect(setLinkUrl(f.s, f.ws1, f.colA, f.blkA, "x", "https://nope.example")).toBe(f.s);
    expect(setLinkUrl(f.s, f.ws2, f.colA, f.blkA, f.link1, "https://nope.example")).toBe(f.s);
  });
});
