import { describe, expect, it } from "vitest";
import {
  addBlock,
  addColumn,
  addLink,
  addWorkspace,
  createDefaultState,
  deserialize,
  domainOf,
  moveWorkspace,
  parseLinkInput,
  resolveActiveWorkspace,
  serialize,
  setLastWorkspaceId,
  setOpenWorkspace,
} from "./core";
import type { StargateState } from "./types";

describe("createDefaultState", () => {
  it("returns schemaVersion 4, default settings, and one seeded workspace", () => {
    const s = createDefaultState("2026-01-01T00:00:00.000Z");
    expect(s.schemaVersion).toBe("4");
    expect(s.app).toEqual({ name: "Stargate", version: "0.1.0" });
    expect(s.exportedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(s.settings).toEqual({
      theme: "system",
      searchEngine: "google",
      faviconSource: "off",
      openWorkspace: "first",
    });
    expect(s.workspaces).toHaveLength(1);

    const w = s.workspaces[0];
    expect(w.name).toBe("Personal");
    expect(w.background).toEqual({ dataUrl: null, alpha: 70 });
    expect(w.kanban.columns.map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
    expect(w.columns).toHaveLength(1);
    expect(w.columns[0].title).toBe("Getting started");
    expect(w.columns[0].blocks[0].title).toBe("Welcome");
    expect(w.columns[0].blocks[0].links[0]).toMatchObject({
      title: "Stargate repo",
      url: "https://github.com/Futura75/Stargate",
    });
  });

  it("assigns every entity a unique id", () => {
    const s = createDefaultState();
    const ids: string[] = [];
    for (const w of s.workspaces) {
      ids.push(w.id);
      for (const c of w.columns) {
        ids.push(c.id);
        for (const b of c.blocks) {
          ids.push(b.id);
          for (const l of b.links) ids.push(l.id);
        }
      }
      for (const k of w.kanban.columns) ids.push(k.id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("addWorkspace", () => {
  it("appends a workspace with empty columns and default kanban, leaving existing workspaces intact", () => {
    const s = createDefaultState();
    const before = s.workspaces[0];
    const next = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
    expect(next.workspaces).toHaveLength(2);
    expect(next.workspaces[0]).toBe(before);
    const w = next.workspaces[1];
    expect(w.name).toBe("Work");
    expect(w.icon).toBe("🧪");
    expect(w.color).toBe("#2e6da3");
    expect(w.columns).toEqual([]);
    expect(w.kanban.columns.map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
  });
});

describe("addColumn / addBlock / addLink", () => {
  it("adds entities in positional order", () => {
    const s = createDefaultState();
    const ws = s.workspaces[0].id;

    const withCol = addColumn(s, ws, "Tools");
    const colId = withCol.workspaces[0].columns[1].id;
    expect(withCol.workspaces[0].columns.map((c) => c.title)).toEqual(["Getting started", "Tools"]);

    const withBlock = addBlock(withCol, ws, colId, "Dev");
    expect(withBlock.workspaces[0].columns[1].blocks.map((b) => b.title)).toEqual(["Dev"]);

    const withLink = addLink(withBlock, ws, colId, withBlock.workspaces[0].columns[1].blocks[0].id, "github.com");
    const links = withLink.workspaces[0].columns[1].blocks[0].links;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ title: "github.com", url: "https://github.com" });
  });
});

describe("parseLinkInput", () => {
  it("derives a title and https url from a bare domain", () => {
    expect(parseLinkInput("github.com")).toEqual({ title: "github.com", url: "https://github.com" });
  });
  it("keeps a full url and derives its domain title (www stripped)", () => {
    expect(parseLinkInput("https://www.news.ycombinator.com")).toEqual({
      title: "news.ycombinator.com",
      url: "https://www.news.ycombinator.com",
    });
  });
  it("honours an explicit title after the url", () => {
    expect(parseLinkInput("https://github.com GitHub")).toEqual({
      title: "GitHub",
      url: "https://github.com",
    });
  });
  it("tolerates protocol-relative urls", () => {
    expect(parseLinkInput("//example.com")).toEqual({ title: "example.com", url: "https://example.com" });
  });
});

describe("domainOf", () => {
  it("strips www and returns the hostname", () => {
    expect(domainOf("https://www.github.com/x")).toBe("github.com");
  });
});

describe("moveWorkspace", () => {
  function workspaceFixture(): { s: StargateState; personal: string; work: string; play: string } {
    let s = createDefaultState("2026-01-01T00:00:00.000Z");
    s = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
    s = addWorkspace(s, { name: "Play", icon: "🎮", color: "#22aa55" });
    const [personal, work, play] = s.workspaces.map((w) => w.id);
    return { s, personal, work, play };
  }

  it("reorders workspaces positionally and returns a new state", () => {
    const f = workspaceFixture();
    const next = moveWorkspace(f.s, f.play, 0);
    expect(next).not.toBe(f.s);
    expect(next.workspaces.map((w) => w.name)).toEqual(["Play", "Personal", "Work"]);
  });

  it("leaves the other workspaces untouched", () => {
    const f = workspaceFixture();
    const next = moveWorkspace(f.s, f.play, 0);
    expect(next.workspaces.find((w) => w.id === f.personal)).toBe(
      f.s.workspaces.find((w) => w.id === f.personal),
    );
    expect(next.workspaces.find((w) => w.id === f.work)).toBe(
      f.s.workspaces.find((w) => w.id === f.work),
    );
  });

  it("is a same-reference no-op when the target index is unchanged", () => {
    const f = workspaceFixture();
    expect(moveWorkspace(f.s, f.work, 1)).toBe(f.s);
  });

  it("is a same-reference no-op when the workspace id is missing", () => {
    const f = workspaceFixture();
    expect(moveWorkspace(f.s, "missing", 0)).toBe(f.s);
  });
});

describe("resolveActiveWorkspace", () => {
  function workspaceFixture(): { s: StargateState; personal: string; work: string } {
    let s = createDefaultState("2026-01-01T00:00:00.000Z");
    s = addWorkspace(s, { name: "Work", icon: "🧪", color: "#2e6da3" });
    const [personal, work] = s.workspaces.map((w) => w.id);
    return { s, personal, work };
  }

  it("returns the first workspace by default", () => {
    const f = workspaceFixture();
    expect(resolveActiveWorkspace(f.s)).toBe(f.s.workspaces[0]);
  });

  it("returns the remembered workspace when openWorkspace is last and the id still exists", () => {
    const f = workspaceFixture();
    const s = setLastWorkspaceId(setOpenWorkspace(f.s, "last"), f.work);
    expect(resolveActiveWorkspace(s)).toBe(s.workspaces[1]);
  });

  it("falls back to the first workspace when the remembered id is missing", () => {
    const f = workspaceFixture();
    const s = setLastWorkspaceId(setOpenWorkspace(f.s, "last"), "missing");
    expect(resolveActiveWorkspace(s)).toBe(f.s.workspaces[0]);
  });

  it("returns undefined for an empty workspace list", () => {
    const s = { ...createDefaultState(), workspaces: [] };
    expect(resolveActiveWorkspace(s)).toBeUndefined();
    expect(resolveActiveWorkspace(setOpenWorkspace(s, "last"))).toBeUndefined();
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a state unchanged", () => {
    const s = createDefaultState();
    expect(deserialize(serialize(s))).toEqual(s);
  });
  it("rejects non-JSON", () => {
    expect(() => deserialize("not json")).toThrow();
  });
  it("rejects a document with a different schemaVersion", () => {
    expect(() => deserialize(JSON.stringify({ schemaVersion: "1", settings: {}, workspaces: [] }))).toThrow();
  });
});
