import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  exportState,
  importState,
  linkStyleOf,
  setBackground,
  setFavicon,
  updateBlockSettings,
} from "./core";
import type { Favicon, LinkStyle, StargateState } from "./types";

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

function withAssets(): StargateState {
  const s = seed();
  const { w, c, b, l } = ids(s);
  const favicon: Favicon = {
    dataUrl: "data:image/png;base64,AAAA",
    source: "custom",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
  return setBackground(setFavicon(s, w, c, b, l, favicon), w, {
    dataUrl: "data:image/webp;base64,BBBB",
    alpha: 42,
  });
}

describe("exportState", () => {
  it("produces the schema envelope with app, exportedAt, settings, and workspaces", () => {
    const s = withAssets();
    const parsed = JSON.parse(exportState(s, "2026-06-06T06:06:06.000Z")) as StargateState;
    expect(parsed.schemaVersion).toBe("3");
    expect(parsed.app).toEqual({ name: "Stargate", version: "0.1.0" });
    expect(parsed.exportedAt).toBe("2026-06-06T06:06:06.000Z");
    expect(parsed.settings).toEqual(s.settings);
    expect(parsed.workspaces).toHaveLength(1);
  });

  it("stamps a fresh exportedAt without mutating the source state", () => {
    const s = seed();
    const before = JSON.stringify(s);
    const parsed = JSON.parse(exportState(s, "2026-06-06T06:06:06.000Z")) as StargateState;
    expect(parsed.exportedAt).toBe("2026-06-06T06:06:06.000Z");
    expect(JSON.stringify(s)).toBe(before);
  });

  it("embeds backgrounds and favicons as data URLs", () => {
    const s = withAssets();
    const parsed = JSON.parse(exportState(s, "2026-01-01T00:00:00.000Z")) as StargateState;
    expect(parsed.workspaces[0].background.dataUrl).toBe("data:image/webp;base64,BBBB");
    expect(parsed.workspaces[0].columns[0].blocks[0].links[0].favicon?.dataUrl).toBe(
      "data:image/png;base64,AAAA",
    );
  });
});

describe("importState", () => {
  it("round-trips export → import to an identical state", () => {
    const s = withAssets();
    expect(importState(exportState(s, "2026-01-01T00:00:00.000Z"))).toEqual(s);
  });

  it("round-trips a chosen link style", () => {
    let s = seed();
    const { w, c, b } = ids(s);
    s = updateBlockSettings(s, w, c, b, { linkStyle: "tiles" });

    const imported = importState(exportState(s, "2026-01-01T00:00:00.000Z"));
    expect(imported.workspaces[0].columns[0].blocks[0].linkStyle).toBe("tiles");
    expect(imported).toEqual(s);
  });

  it("degrades an unknown link style to list", () => {
    const s = seed();
    const { w, c, b } = ids(s);
    const dirty = updateBlockSettings(s, w, c, b, {
      linkStyle: "carousel" as unknown as LinkStyle,
    });

    const imported = importState(exportState(dirty, "2026-01-01T00:00:00.000Z"));
    const block = imported.workspaces[0].columns[0].blocks[0];
    expect(block.linkStyle).toBeUndefined();
    expect(linkStyleOf(block)).toBe("list");
  });

  it("does not mutate the source state object", () => {
    const s = withAssets();
    const before = JSON.stringify(s);
    const imported = importState(exportState(s, "2026-01-01T00:00:00.000Z"));
    expect(JSON.stringify(s)).toBe(before);
    expect(imported).not.toBe(s);
  });

  it("refuses invalid JSON", () => {
    expect(() => importState("not json")).toThrow("not a valid JSON file");
  });

  it("refuses a missing schemaVersion", () => {
    expect(() => importState(JSON.stringify({ settings: {}, workspaces: [] }))).toThrow(
      "missing schemaVersion",
    );
  });

  it("refuses a non-string schemaVersion", () => {
    expect(() => importState(JSON.stringify({ schemaVersion: 1, settings: {}, workspaces: [] }))).toThrow(
      "missing schemaVersion",
    );
  });

  it("refuses a newer schemaVersion", () => {
    expect(() => importState(JSON.stringify({ schemaVersion: "4", settings: {}, workspaces: [] }))).toThrow(
      "made by a newer version of Stargate",
    );
  });

  it("refuses an unknown older schemaVersion", () => {
    expect(() => importState(JSON.stringify({ schemaVersion: "0", settings: {}, workspaces: [] }))).toThrow(
      "cannot migrate from version 0",
    );
  });
});
