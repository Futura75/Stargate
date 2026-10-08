import { describe, expect, it } from "vitest";
import {
  addBlock,
  addColumn,
  addWorkspace,
  createDefaultState,
  updateBlockSettings,
} from "./core";
import type { FaviconSize, StargateState } from "./types";

interface Fixture {
  s: StargateState;
  ws1: string;
  ws2: string;
  colA: string;
  blkA: string;
  blkB: string;
}

function fixture(): Fixture {
  let s = createDefaultState("2026-01-01T00:00:00.000Z");
  const ws1 = s.workspaces[0].id;
  s = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
  const ws2 = s.workspaces[1].id;
  const colA = s.workspaces[0].columns[0].id;
  s = addColumn(s, ws1, "Col B");
  s = addBlock(s, ws1, colA, "Block B");
  const blkA = s.workspaces[0].columns[0].blocks[0].id;
  const blkB = s.workspaces[0].columns[0].blocks[1].id;
  return { s, ws1, ws2, colA, blkA, blkB };
}

function blockA(s: StargateState) {
  return s.workspaces[0].columns[0].blocks[0];
}

describe("updateBlockSettings", () => {
  it("sets a description on a block", () => {
    const f = fixture();
    const next = updateBlockSettings(f.s, f.ws1, f.colA, f.blkA, { description: "Daily reads" });
    expect(blockA(next).description).toBe("Daily reads");
    expect(blockA(f.s).description).toBeUndefined();
    expect(next).not.toBe(f.s);
    expect(blockA(next)).not.toBe(blockA(f.s));
  });

  it("clears a description with an empty string", () => {
    const f = fixture();
    const withDesc = updateBlockSettings(f.s, f.ws1, f.colA, f.blkA, { description: "Daily reads" });
    const cleared = updateBlockSettings(withDesc, f.ws1, f.colA, f.blkA, { description: "" });
    expect(blockA(cleared).description).toBe("");
  });

  it("sets a favicon size", () => {
    const f = fixture();
    const sizes: FaviconSize[] = ["sm", "md", "lg"];
    for (const size of sizes) {
      const next = updateBlockSettings(f.s, f.ws1, f.colA, f.blkA, { faviconSize: size });
      expect(blockA(next).faviconSize).toBe(size);
      expect(blockA(f.s).faviconSize).toBeUndefined();
    }
  });

  it("sets both description and favicon size in one patch", () => {
    const f = fixture();
    const next = updateBlockSettings(f.s, f.ws1, f.colA, f.blkA, {
      description: "News",
      faviconSize: "lg",
    });
    expect(blockA(next)).toMatchObject({ description: "News", faviconSize: "lg" });
    expect(blockA(next).title).toBe("Welcome");
  });

  it("leaves sibling blocks untouched", () => {
    const f = fixture();
    const next = updateBlockSettings(f.s, f.ws1, f.colA, f.blkA, { description: "Only A" });
    expect(next.workspaces[0].columns[0].blocks[1]).toBe(f.s.workspaces[0].columns[0].blocks[1]);
    expect(next.workspaces[0].columns[0].blocks[1].description).toBeUndefined();
  });

  it("returns the same state reference when an id is missing", () => {
    const f = fixture();
    expect(updateBlockSettings(f.s, "x", f.colA, f.blkA, { description: "nope" })).toBe(f.s);
    expect(updateBlockSettings(f.s, f.ws1, "x", f.blkA, { faviconSize: "md" })).toBe(f.s);
    expect(updateBlockSettings(f.s, f.ws1, f.colA, "x", { description: "nope" })).toBe(f.s);
    expect(updateBlockSettings(f.s, f.ws2, f.colA, f.blkA, { faviconSize: "md" })).toBe(f.s);
  });
});
