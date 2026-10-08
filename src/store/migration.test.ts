import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  exportState,
  importState,
  updateBlockSettings,
  updateBlockTitleSize,
  updateWorkspaceLayout,
} from "./core";

function now(): string {
  return "2026-01-01T00:00:00.000Z";
}

/** A v1 export: a current default state with schemaVersion rolled back to "1". */
function v1File(): any {
  const parsed = JSON.parse(exportState(createDefaultState(now()), now()));
  parsed.schemaVersion = "1";
  return parsed;
}

describe("schema v2 migration", () => {
  it("migrates a v1 file by filling defaults and bumping the schema version", () => {
    const imported = importState(JSON.stringify(v1File()));
    expect(imported.schemaVersion).toBe("2");

    const ws = imported.workspaces[0];
    expect(ws.layout).toEqual({ columnCount: 0, fluid: true, columnGap: 18 });
    expect(ws.blockTitleSize).toBe("md");

    const block = ws.columns[0].blocks[0];
    expect(block.description).toBe("");
    expect(block.faviconSize).toBe("sm");
    expect(block.links[0].title).toBe("Stargate repo");
  });

  it("imports a v2 file with the new settings unchanged", () => {
    let s = createDefaultState(now());
    const wsId = s.workspaces[0].id;
    const colId = s.workspaces[0].columns[0].id;
    const blkId = s.workspaces[0].columns[0].blocks[0].id;
    s = updateWorkspaceLayout(s, wsId, { columnCount: 3, fluid: false, columnGap: 24 });
    s = updateBlockTitleSize(s, wsId, "lg");
    s = updateBlockSettings(s, wsId, colId, blkId, { description: "News", faviconSize: "lg" });

    expect(importState(exportState(s, now()))).toEqual(s);
  });

  it("refuses a file from a newer version", () => {
    const newer = v1File();
    newer.schemaVersion = "3";
    expect(() => importState(JSON.stringify(newer))).toThrow("made by a newer version of Stargate");
  });

  it("coerces malformed new-field values and keeps the entity", () => {
    const raw = v1File();
    raw.schemaVersion = "2";
    const ws = raw.workspaces[0];
    ws.layout = { columnCount: "x", fluid: 42, columnGap: null };
    ws.blockTitleSize = "xxl";
    const block = ws.columns[0].blocks[0];
    block.description = 123;
    block.faviconSize = "huge";

    const imported = importState(JSON.stringify(raw));
    expect(imported.workspaces[0].layout).toEqual({ columnCount: 0, fluid: true, columnGap: 18 });
    expect(imported.workspaces[0].blockTitleSize).toBeUndefined();

    const outBlock = imported.workspaces[0].columns[0].blocks[0];
    expect(outBlock.description).toBeUndefined();
    expect(outBlock.faviconSize).toBeUndefined();
    expect(outBlock.links[0].title).toBe("Stargate repo");
  });
});
