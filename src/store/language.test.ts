import { describe, expect, it } from "vitest";
import { importBookmarksFromTree } from "./bookmarks";
import { addWorkspace, createDefaultState, deserialize, exportState, importState, languageOf, setLanguage } from "./core";
import { StargateError } from "./errors";
import { mergeRemoteIntoLocal, toRemotePayload } from "./sync";

function now(): string {
  return "2026-01-01T00:00:00.000Z";
}

describe("language setting", () => {
  it("defaults to Italian, with Italian seed content", () => {
    const s = createDefaultState(now());
    expect(s.settings.language).toBe("it");
    expect(languageOf(s.settings)).toBe("it");
    expect(s.workspaces[0].name).toBe("Personale");
    expect(s.workspaces[0].kanban.columns.map((c) => c.title)).toEqual(["Da fare", "In corso", "Fatto"]);
  });

  it("seeds English content when asked", () => {
    const s = createDefaultState(now(), "en");
    expect(s.settings.language).toBe("en");
    expect(s.workspaces[0].name).toBe("Personal");
    expect(s.workspaces[0].columns[0].title).toBe("Getting started");
    expect(s.workspaces[0].kanban.columns.map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
  });

  it("setLanguage changes only the language", () => {
    const s = createDefaultState(now());
    const next = setLanguage(s, "en");
    expect(next.settings).toEqual({ ...s.settings, language: "en" });
    expect(next.workspaces).toBe(s.workspaces);
    expect(s.settings.language).toBe("it");
  });

  it("is saved in the export file and survives a round trip", () => {
    const s = setLanguage(createDefaultState(now()), "en");
    const json = exportState(s, now());
    expect(JSON.parse(json).settings.language).toBe("en");
    expect(importState(json).settings.language).toBe("en");
  });

  it("names new workspaces' kanban columns in the current language", () => {
    const en = addWorkspace(setLanguage(createDefaultState(now()), "en"), { name: "W", icon: "⭐", color: "#000" });
    expect(en.workspaces[1].kanban.columns.map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
    const it = addWorkspace(createDefaultState(now()), { name: "W", icon: "⭐", color: "#000" });
    expect(it.workspaces[1].kanban.columns.map((c) => c.title)).toEqual(["Da fare", "In corso", "Fatto"]);
  });

  it("names imported bookmark blocks in the current language", () => {
    const state = setLanguage(createDefaultState(now()), "en");
    const next = importBookmarksFromTree(
      state,
      { entries: [{ type: "link", title: "A", url: "https://a.example" }] },
      { excludedFolders: [], includeRootLinks: true },
    );
    const ws = next.workspaces[1];
    expect(ws.name).toBe("Bookmarks");
    expect(ws.columns[0].title).toBe("Links");
    expect(ws.columns[0].blocks[0].title).toBe("General");
  });
});

describe("language backward compatibility", () => {
  it("does not bump the schema version, so older Stargate versions can still import new files", () => {
    const json = exportState(setLanguage(createDefaultState(now()), "en"), now());
    expect(JSON.parse(json).schemaVersion).toBe("4");
  });

  it("imports a v4 file without a language and falls back to Italian", () => {
    const raw = JSON.parse(exportState(createDefaultState(now(), "en"), now()));
    delete raw.settings.language;
    const imported = importState(JSON.stringify(raw));
    expect(imported.settings.language).toBeUndefined();
    expect(languageOf(imported.settings)).toBe("it");
  });

  it.each(["1", "2", "3"])("imports a v%s file without a language", (version) => {
    const raw = JSON.parse(exportState(createDefaultState(now()), now()));
    raw.schemaVersion = version;
    delete raw.settings.language;
    delete raw.settings.openWorkspace;
    const imported = importState(JSON.stringify(raw));
    expect(imported.schemaVersion).toBe("4");
    expect(languageOf(imported.settings)).toBe("it");
  });

  it("drops an unknown language instead of rejecting the file", () => {
    const raw = JSON.parse(exportState(createDefaultState(now()), now()));
    raw.settings.language = "klingon";
    const imported = deserialize(JSON.stringify(raw));
    expect(imported.settings.language).toBeUndefined();
    expect(languageOf(imported.settings)).toBe("it");
  });
});

describe("language sync", () => {
  it("is part of the synced payload and is adopted from the server copy", () => {
    const local = createDefaultState(now());
    const remote = toRemotePayload(setLanguage(local, "en"), now());
    expect(remote.settings.language).toBe("en");
    expect(mergeRemoteIntoLocal(remote, local).settings.language).toBe("en");
  });
});

describe("coded errors", () => {
  it("tags import failures with a translatable code", () => {
    try {
      importState("not json");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StargateError);
      expect((err as StargateError).code).toBe("invalid-json");
    }
  });
});
