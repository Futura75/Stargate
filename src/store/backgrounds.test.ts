import { describe, expect, it } from "vitest";
import {
  createDefaultState,
  MAX_BACKGROUND_BASE64,
  removeBackground,
  setBackground,
  setBackgroundAlpha,
} from "./core";
import type { StargateState } from "./types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

const bg = { dataUrl: "data:image/webp;base64,AAAA", alpha: 40 };

describe("setBackground", () => {
  it("stores a background on the workspace without mutating the original state", () => {
    const s = seed();
    const ws = s.workspaces[0].id;
    const next = setBackground(s, ws, bg);
    expect(next.workspaces[0].background).toEqual(bg);
    expect(s.workspaces[0].background).toEqual({ dataUrl: null, alpha: 70 });
    expect(next).not.toBe(s);
    expect(next.workspaces[0]).not.toBe(s.workspaces[0]);
  });

  it("is a no-op for an unknown workspace", () => {
    const s = seed();
    expect(setBackground(s, "nope", bg)).toBe(s);
  });
});

describe("removeBackground", () => {
  it("clears the data URL and keeps the alpha", () => {
    const s = seed();
    const ws = s.workspaces[0].id;
    const withBg = setBackground(s, ws, bg);
    const removed = removeBackground(withBg, ws);
    expect(removed.workspaces[0].background).toEqual({ dataUrl: null, alpha: 40 });
  });

  it("is a no-op for an unknown workspace", () => {
    const s = seed();
    expect(removeBackground(s, "nope")).toBe(s);
  });
});

describe("setBackgroundAlpha", () => {
  it("sets alpha and clamps to 0–100", () => {
    const s = seed();
    const ws = s.workspaces[0].id;
    const withBg = setBackground(s, ws, bg);
    expect(setBackgroundAlpha(withBg, ws, 25).workspaces[0].background.alpha).toBe(25);
    expect(setBackgroundAlpha(withBg, ws, 150).workspaces[0].background.alpha).toBe(100);
    expect(setBackgroundAlpha(withBg, ws, -5).workspaces[0].background.alpha).toBe(0);
  });

  it("keeps the data URL while changing alpha", () => {
    const s = seed();
    const ws = s.workspaces[0].id;
    const withBg = setBackground(s, ws, bg);
    const next = setBackgroundAlpha(withBg, ws, 10);
    expect(next.workspaces[0].background).toEqual({ dataUrl: bg.dataUrl, alpha: 10 });
  });

  it("is a no-op for an unknown workspace", () => {
    const s = seed();
    expect(setBackgroundAlpha(s, "nope", 50)).toBe(s);
  });
});

describe("MAX_BACKGROUND_BASE64", () => {
  it("matches the 700 KB absolute cap", () => {
    expect(MAX_BACKGROUND_BASE64).toBe(700 * 1024);
  });
});
