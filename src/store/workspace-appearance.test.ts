import { describe, expect, it } from "vitest";
import {
  addWorkspace,
  createDefaultState,
  deserialize,
  exportState,
  importState,
  serialize,
  updateBlockTitleSize,
  updateWorkspaceLayout,
} from "./core";
import type { BlockTitleSize, StargateState, WorkspaceLayout } from "./types";

const LAYOUT: WorkspaceLayout = { columnCount: 3, fluid: false, columnGap: 24 };

function state(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

function withTwoWorkspaces(): StargateState {
  return addWorkspace(state(), { name: "Work", icon: "🧪", color: "#2e6da3" });
}

describe("updateWorkspaceLayout", () => {
  it("sets the layout on the matching workspace", () => {
    const s = state();
    const wsId = s.workspaces[0].id;
    const next = updateWorkspaceLayout(s, wsId, LAYOUT);
    expect(next.workspaces[0].layout).toEqual(LAYOUT);
    expect(next).not.toBe(s);
    expect(next.workspaces[0]).not.toBe(s.workspaces[0]);
  });

  it("leaves the source state untouched", () => {
    const s = state();
    const wsId = s.workspaces[0].id;
    updateWorkspaceLayout(s, wsId, LAYOUT);
    expect(s.workspaces[0].layout).toBeUndefined();
  });

  it("leaves sibling workspaces untouched", () => {
    const s = withTwoWorkspaces();
    const wsId = s.workspaces[0].id;
    const next = updateWorkspaceLayout(s, wsId, LAYOUT);
    expect(next.workspaces[1]).toBe(s.workspaces[1]);
    expect(next.workspaces[1].layout).toBeUndefined();
  });

  it("returns the same state reference when the workspace id is missing", () => {
    const s = state();
    expect(updateWorkspaceLayout(s, "missing", LAYOUT)).toBe(s);
  });
});

describe("updateBlockTitleSize", () => {
  it.each(["sm", "md", "lg"] as const)("sets the block title size to %s", (size) => {
    const s = state();
    const wsId = s.workspaces[0].id;
    const next = updateBlockTitleSize(s, wsId, size);
    expect(next.workspaces[0].blockTitleSize).toBe(size);
    expect(s.workspaces[0].blockTitleSize).toBeUndefined();
    expect(next).not.toBe(s);
    expect(next.workspaces[0]).not.toBe(s.workspaces[0]);
  });

  it("returns the same state reference when the workspace id is missing", () => {
    const s = state();
    expect(updateBlockTitleSize(s, "missing", "lg")).toBe(s);
  });
});

describe("appearance settings defaults", () => {
  it("omits layout and block title size on new workspaces (render-time defaults)", () => {
    const s = state();
    expect(s.workspaces[0].layout).toBeUndefined();
    expect(s.workspaces[0].blockTitleSize).toBeUndefined();
  });
});

describe("appearance settings round-trip", () => {
  it("serializes and deserializes layout and block title size", () => {
    let s = state();
    const wsId = s.workspaces[0].id;
    s = updateWorkspaceLayout(s, wsId, LAYOUT);
    s = updateBlockTitleSize(s, wsId, "lg");
    expect(deserialize(serialize(s))).toEqual(s);
  });

  it("keeps appearance settings through export and import", () => {
    let s = state();
    const wsId = s.workspaces[0].id;
    s = updateWorkspaceLayout(s, wsId, LAYOUT);
    s = updateBlockTitleSize(s, wsId, "lg");
    expect(importState(exportState(s, "2026-01-01T00:00:00.000Z"))).toEqual(s);
  });

  it("imports a v2 document without layout or block title size unchanged", () => {
    const s = state();
    const imported = importState(JSON.stringify(s));
    expect(imported.workspaces[0].layout).toBeUndefined();
    expect(imported.workspaces[0].blockTitleSize).toBeUndefined();
  });
});

describe("type coverage", () => {
  it("supports all block title size values", () => {
    const sizes: BlockTitleSize[] = ["sm", "md", "lg"];
    expect(sizes).toEqual(["sm", "md", "lg"]);
  });
});
