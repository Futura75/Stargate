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
 * button has a name distinct from the "New workspace" add-button's own
 * accessible name (both default to literally "New workspace" otherwise).
 */
async function createNamedWorkspace(name: string) {
  await fireEvent.click(screen.getByTitle("New workspace"));
  const nameField = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
  await fireEvent.change(nameField, { target: { value: name } });
  await fireEvent.click(screen.getByRole("button", { name: "Done" }));
}

describe("switching workspaces", () => {
  it("creates a workspace via the dock and switches the active workspace back and forth", async () => {
    render(App);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personal");

    await createNamedWorkspace("Work");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Work");

    await fireEvent.click(screen.getByRole("button", { name: "Personal" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Personal");

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
    await fireEvent.click(screen.getByTitle("Workspace settings"));

    await fireEvent.click(screen.getByRole("button", { name: /Delete workspace/ }));

    expect(await screen.findByText(/Deleted workspace/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Undo/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Work" })).not.toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /Undo/ }));

    expect(screen.queryByText(/Deleted workspace/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Work" })).toBeInTheDocument();
  });
});
