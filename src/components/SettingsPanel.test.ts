import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import SettingsPanel from "./SettingsPanel.svelte";
import { createDefaultState } from "../store/core";
import type { StargateState } from "../store/types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

function baseProps(doc: StargateState) {
  return {
    open: true,
    onclose: vi.fn(),
    doc,
    active: doc.workspaces[0],
    account: null,
    syncStatus: "off" as const,
    syncMessage: null,
    usage: { totalBytes: 0, backgroundBytes: 0, configBytes: 0 },
    commit: vi.fn((_next: StargateState) => true),
    onBlockTitleSize: vi.fn(),
    setColumnCount: vi.fn(),
    onColumnGapChange: vi.fn(),
    toggleFluid: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(),
    onImportBookmarks: vi.fn(),
  };
}

describe("opening the settings panel and changing a setting", () => {
  it("renders when open and switches the theme to Dark via commit", async () => {
    const doc = seed();
    const props = baseProps(doc);
    render(SettingsPanel, { props });

    expect(screen.getByRole("dialog", { name: "Impostazioni" })).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /Scuro/ }));

    expect(props.commit).toHaveBeenCalledTimes(1);
    const next = props.commit.mock.calls[0][0] as StargateState;
    expect(next.settings.theme).toBe("dark");
  });

  it("does not render when closed", () => {
    const doc = seed();
    const props = { ...baseProps(doc), open: false };
    render(SettingsPanel, { props });

    expect(screen.queryByRole("dialog", { name: "Impostazioni" })).not.toBeInTheDocument();
  });

  it("calls onclose when the close button is clicked", async () => {
    const doc = seed();
    const props = baseProps(doc);
    render(SettingsPanel, { props });

    await fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(props.onclose).toHaveBeenCalledTimes(1);
  });
});
