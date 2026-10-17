import { describe, expect, it } from "vitest";
import { createDefaultState, exportState, importState, setSkin } from "./core";

const now = "2026-01-01T00:00:00.000Z";

describe("settings.skin", () => {
  it("is absent on a fresh state, so the original look applies", () => {
    expect(createDefaultState(now).settings.skin).toBeUndefined();
  });

  it("imports a file without a skin unchanged (no key added, schema stays 4)", () => {
    const file = JSON.parse(exportState(createDefaultState(now), now));
    delete file.settings.skin;
    const imported = importState(JSON.stringify(file));
    expect(imported.schemaVersion).toBe("4");
    expect("skin" in imported.settings).toBe(false);
  });

  it("round-trips a chosen skin through export and import", () => {
    const state = setSkin(createDefaultState(now), "atlante");
    const imported = importState(exportState(state, now));
    expect(imported.settings.skin).toBe("atlante");
  });

  it("drops an unknown skin value instead of rejecting the file", () => {
    const file = JSON.parse(exportState(createDefaultState(now), now));
    file.settings.skin = "neon-future";
    const imported = importState(JSON.stringify(file));
    expect("skin" in imported.settings).toBe(false);
  });
});
