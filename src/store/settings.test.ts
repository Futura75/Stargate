import { describe, expect, it } from "vitest";
import { createDefaultState, setSearchEngine, setTheme } from "./core";
import type { StargateState } from "./types";

function state(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

describe("setSearchEngine", () => {
  it.each(["google", "ddg", "bing"] as const)("sets searchEngine to %s", (engine) => {
    const s = state();
    const next = setSearchEngine(s, engine);
    expect(next.settings.searchEngine).toBe(engine);
    expect(next.settings).toEqual({ theme: "system", searchEngine: engine, faviconSource: "off" });
    expect(s.settings.searchEngine).toBe("google");
    expect(next).not.toBe(s);
    expect(next.settings).not.toBe(s.settings);
    expect(next.workspaces).toBe(s.workspaces);
  });
});

describe("setTheme", () => {
  it.each(["light", "dark", "system"] as const)("sets theme to %s", (theme) => {
    const s = state();
    const next = setTheme(s, theme);
    expect(next.settings.theme).toBe(theme);
    expect(next.settings).toEqual({ theme, searchEngine: "google", faviconSource: "off" });
    expect(s.settings.theme).toBe("system");
    expect(next).not.toBe(s);
    expect(next.settings).not.toBe(s.settings);
    expect(next.workspaces).toBe(s.workspaces);
  });
});
