import { describe, expect, it } from "vitest";
import {
  addBlock,
  addColumn,
  addLink,
  addWorkspace,
  createDefaultState,
  deleteBlock,
  deleteColumn,
  deleteLink,
  deleteWorkspace,
  moveBlock,
  moveLink,
  renameBlock,
  renameColumn,
  renameLink,
  renameWorkspace,
  reorderBlock,
  reorderColumn,
  reorderLink,
  updateWorkspace,
} from "./core";
import type { StargateState } from "./types";

interface Fixture {
  s: StargateState;
  ws1: string;
  ws2: string;
  colA: string;
  colB: string;
  blkA: string;
  blkB: string;
  link1: string;
  link2: string;
  link3: string;
}

/**
 * Builds a deterministic-shaped state:
 * - ws1 "Personal": colA "Getting started" [ blkA "Welcome" [link1, link2, link3], blkB "Block B" [] ], colB "Col B" []
 * - ws2 "Work": no columns
 */
function fixture(): Fixture {
  let s = createDefaultState("2026-01-01T00:00:00.000Z");
  const ws1 = s.workspaces[0].id;
  s = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
  const ws2 = s.workspaces[1].id;
  s = addColumn(s, ws1, "Col B");
  const colA = s.workspaces[0].columns[0].id;
  const colB = s.workspaces[0].columns[1].id;
  s = addBlock(s, ws1, colA, "Block B");
  const blkA = s.workspaces[0].columns[0].blocks[0].id;
  const blkB = s.workspaces[0].columns[0].blocks[1].id;
  s = addLink(s, ws1, colA, blkA, "https://example.com Example");
  s = addLink(s, ws1, colA, blkA, "https://second.com Second");
  const [link1, link2, link3] = s.workspaces[0].columns[0].blocks[0].links.map((l) => l.id);
  return { s, ws1, ws2, colA, colB, blkA, blkB, link1, link2, link3 };
}

describe("workspace mutations", () => {
  it("renames a workspace and leaves the others untouched", () => {
    const f = fixture();
    const next = renameWorkspace(f.s, f.ws1, "Home");
    expect(next.workspaces.map((w) => w.name)).toEqual(["Home", "Work"]);
    expect(next.workspaces[1]).toBe(f.s.workspaces[1]);
  });

  it("updates a workspace icon and color", () => {
    const f = fixture();
    const next = updateWorkspace(f.s, f.ws1, { icon: "🎯", color: "#112233" });
    expect(next.workspaces[0].icon).toBe("🎯");
    expect(next.workspaces[0].color).toBe("#112233");
    expect(next.workspaces[0].name).toBe("Personal");
  });

  it("deletes a workspace when more than one remains", () => {
    const f = fixture();
    const next = deleteWorkspace(f.s, f.ws2);
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal"]);
  });

  it("refuses to delete the last workspace", () => {
    const f = fixture();
    const one = deleteWorkspace(f.s, f.ws2);
    expect(deleteWorkspace(one, f.ws1)).toBe(one);
  });
});

describe("column mutations", () => {
  it("renames a column", () => {
    const f = fixture();
    const next = renameColumn(f.s, f.ws1, f.colA, "Daily");
    expect(next.workspaces[0].columns.map((c) => c.title)).toEqual(["Daily", "Col B"]);
  });

  it("deletes a column and its blocks", () => {
    const f = fixture();
    const next = deleteColumn(f.s, f.ws1, f.colA);
    expect(next.workspaces[0].columns.map((c) => c.title)).toEqual(["Col B"]);
    expect(next.workspaces[0].columns[0].blocks).toEqual([]);
  });
});

describe("block mutations", () => {
  it("renames a block", () => {
    const f = fixture();
    const next = renameBlock(f.s, f.ws1, f.colA, f.blkA, "News");
    expect(next.workspaces[0].columns[0].blocks.map((b) => b.title)).toEqual(["News", "Block B"]);
  });

  it("deletes a block and keeps its siblings", () => {
    const f = fixture();
    const next = deleteBlock(f.s, f.ws1, f.colA, f.blkA);
    expect(next.workspaces[0].columns[0].blocks.map((b) => b.title)).toEqual(["Block B"]);
  });
});

describe("link mutations", () => {
  it("renames a link's title and url", () => {
    const f = fixture();
    const next = renameLink(f.s, f.ws1, f.colA, f.blkA, f.link2, "Docs", "https://docs.example.com");
    const links = next.workspaces[0].columns[0].blocks[0].links;
    expect(links.map((l) => l.title)).toEqual(["Stargate repo", "Docs", "Second"]);
    expect(links[1].url).toBe("https://docs.example.com");
  });

  it("deletes a link", () => {
    const f = fixture();
    const next = deleteLink(f.s, f.ws1, f.colA, f.blkA, f.link2);
    expect(next.workspaces[0].columns[0].blocks[0].links.map((l) => l.title)).toEqual([
      "Stargate repo",
      "Second",
    ]);
  });
});

describe("reorder", () => {
  it("reorders columns positionally", () => {
    const f = fixture();
    const next = reorderColumn(f.s, f.ws1, f.colB, 0);
    expect(next.workspaces[0].columns.map((c) => c.title)).toEqual(["Col B", "Getting started"]);
  });

  it("reorders blocks within a column", () => {
    const f = fixture();
    const next = reorderBlock(f.s, f.ws1, f.colA, f.blkB, 0);
    expect(next.workspaces[0].columns[0].blocks.map((b) => b.title)).toEqual([
      "Block B",
      "Welcome",
    ]);
  });

  it("reorders links within a block", () => {
    const f = fixture();
    const next = reorderLink(f.s, f.ws1, f.colA, f.blkA, f.link3, 0);
    expect(next.workspaces[0].columns[0].blocks[0].links.map((l) => l.title)).toEqual([
      "Second",
      "Stargate repo",
      "Example",
    ]);
  });
});

describe("move", () => {
  it("moves a block across columns", () => {
    const f = fixture();
    const next = moveBlock(f.s, f.ws1, f.colA, f.colB, f.blkB, 0);
    expect(next.workspaces[0].columns[0].blocks.map((b) => b.title)).toEqual(["Welcome"]);
    expect(next.workspaces[0].columns[1].blocks.map((b) => b.title)).toEqual(["Block B"]);
  });

  it("inserts a moved block at a specific index in the target column", () => {
    const f = fixture();
    let s = addBlock(f.s, f.ws1, f.colB, "X");
    s = addBlock(s, f.ws1, f.colB, "Y");
    const next = moveBlock(s, f.ws1, f.colA, f.colB, f.blkB, 1);
    expect(next.workspaces[0].columns[1].blocks.map((b) => b.title)).toEqual([
      "X",
      "Block B",
      "Y",
    ]);
    expect(next.workspaces[0].columns[0].blocks.map((b) => b.title)).toEqual(["Welcome"]);
  });

  it("moves a link between blocks", () => {
    const f = fixture();
    let s = addLink(f.s, f.ws1, f.colA, f.blkB, "https://news.ycombinator.com HN");
    const next = moveLink(s, f.ws1, f.colA, f.blkA, f.blkB, f.link2, 1);
    expect(next.workspaces[0].columns[0].blocks[0].links.map((l) => l.title)).toEqual([
      "Stargate repo",
      "Second",
    ]);
    expect(next.workspaces[0].columns[0].blocks[1].links.map((l) => l.title)).toEqual([
      "HN",
      "Example",
    ]);
  });
});

describe("missing ids are no-ops", () => {
  it("returns the same state reference when a target id is missing", () => {
    const f = fixture();
    expect(renameWorkspace(f.s, "x", "T")).toBe(f.s);
    expect(updateWorkspace(f.s, "x", { icon: "🎯" })).toBe(f.s);
    expect(deleteWorkspace(f.s, "x")).toBe(f.s);
    expect(renameColumn(f.s, "x", f.colA, "T")).toBe(f.s);
    expect(renameColumn(f.s, f.ws1, "x", "T")).toBe(f.s);
    expect(deleteColumn(f.s, "x", f.colA)).toBe(f.s);
    expect(deleteColumn(f.s, f.ws1, "x")).toBe(f.s);
    expect(renameBlock(f.s, f.ws1, "x", f.blkA, "T")).toBe(f.s);
    expect(renameBlock(f.s, f.ws1, f.colA, "x", "T")).toBe(f.s);
    expect(deleteBlock(f.s, f.ws1, f.colA, "x")).toBe(f.s);
    expect(renameLink(f.s, f.ws1, f.colA, f.blkA, "x", "T", "U")).toBe(f.s);
    expect(deleteLink(f.s, f.ws1, f.colA, f.blkA, "x")).toBe(f.s);
    expect(reorderColumn(f.s, f.ws1, "x", 0)).toBe(f.s);
    expect(reorderBlock(f.s, f.ws1, f.colA, "x", 0)).toBe(f.s);
    expect(reorderLink(f.s, f.ws1, f.colA, f.blkA, "x", 0)).toBe(f.s);
    expect(moveBlock(f.s, f.ws1, "x", f.colB, f.blkA, 0)).toBe(f.s);
    expect(moveBlock(f.s, f.ws1, f.colA, "x", f.blkA, 0)).toBe(f.s);
    expect(moveBlock(f.s, f.ws1, f.colA, f.colB, "x", 0)).toBe(f.s);
    expect(moveLink(f.s, f.ws1, "x", f.blkA, f.blkB, f.link1, 0)).toBe(f.s);
    expect(moveLink(f.s, f.ws1, f.colA, "x", f.blkB, f.link1, 0)).toBe(f.s);
    expect(moveLink(f.s, f.ws1, f.colA, f.blkA, "x", f.link1, 0)).toBe(f.s);
    expect(moveLink(f.s, f.ws1, f.colA, f.blkA, f.blkB, "x", 0)).toBe(f.s);
  });
});
