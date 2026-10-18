import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import App from "./App.svelte";

// These are smoke tests for the composed app shell (App.svelte +
// src/components/*.svelte): they drive the UI the way a user would and
// assert on rendered state, not on internals. Each test starts from a
// clean localStorage so the app boots with its seeded default state.
beforeEach(() => {
  localStorage.clear();
});

/**
 * Creates a workspace via the dock's "+" button and renames it, so its dock
 * button has a name distinct from the "Nuovo workspace" add-button's own
 * accessible name (both default to literally "Nuovo workspace" otherwise).
 */
async function createNamedWorkspace(name: string) {
  await fireEvent.click(screen.getByTitle("Nuovo workspace"));
  const nameField = screen.getByRole("textbox", { name: "Nome" }) as HTMLInputElement;
  await fireEvent.change(nameField, { target: { value: name } });
  await fireEvent.click(screen.getByRole("button", { name: "Fatto" }));
}

describe("switching workspaces", () => {
  it("creates a workspace via the dock and switches the active workspace back and forth", async () => {
    render(App);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personale");

    await createNamedWorkspace("Work");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work");

    await fireEvent.click(screen.getByRole("button", { name: "Personale" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personale");

    await fireEvent.click(screen.getByRole("button", { name: "Work" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work");
  });
});

describe("triggering and dismissing a toast", () => {
  it("shows an undo toast after deleting a workspace and dismisses it on undo", async () => {
    render(App);

    // a second workspace is required: the dock refuses to delete the last one
    await createNamedWorkspace("Work");
    await fireEvent.click(screen.getByRole("button", { name: "Work" }));
    await fireEvent.click(screen.getByTitle("Impostazioni workspace"));

    await fireEvent.click(screen.getByRole("button", { name: /Elimina workspace/ }));

    expect(await screen.findByText(/Workspace “Work” eliminato/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Annulla/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Work" })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /Annulla/ }));

    expect(screen.queryByText(/Workspace “Work” eliminato/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
  });
});
