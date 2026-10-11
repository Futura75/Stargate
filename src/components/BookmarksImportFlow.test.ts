import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import BookmarksImportFlow from "./BookmarksImportFlow.svelte";
import { createDefaultState } from "../store/core";
import type { StargateState } from "../store/types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

const BOOKMARKS_HTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Work</H3>
    <DL><p>
        <DT><A HREF="https://example.com">Example</A>
    </DL><p>
</DL><p>`;

describe("bookmarks import happy path", () => {
  it("goes file -> folder picker -> confirm and commits a new workspace", async () => {
    const doc = seed();
    const commit = vi.fn((_next: StargateState) => true);
    const showToast = vi.fn();
    const onImported = vi.fn();
    const closeSettings = vi.fn();

    const { container } = render(BookmarksImportFlow, {
      props: { doc, commit, showToast, onImported, closeSettings },
    });

    // 1. pick a bookmarks HTML file
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([BOOKMARKS_HTML], "bookmarks.html", { type: "text/html" });
    await fireEvent.change(fileInput, { target: { files: [file] } });

    // 2. the folder picker opens, showing the parsed top-level folder
    expect(await screen.findByRole("dialog", { name: "Import browser bookmarks" })).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(closeSettings).toHaveBeenCalledTimes(1);

    // 3. confirm the import with the default selection
    const confirmButton = screen.getByRole("button", { name: "Import" });
    expect(confirmButton).not.toBeDisabled();
    await fireEvent.click(confirmButton);

    expect(commit).toHaveBeenCalledTimes(1);
    const next = commit.mock.calls[0][0] as StargateState;
    expect(next.workspaces).toHaveLength(doc.workspaces.length + 1);
    const created = next.workspaces[next.workspaces.length - 1];
    expect(created.name).toBe("Work");

    expect(onImported).toHaveBeenCalledWith(created.id);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining("Added 1 workspace"));

    // the picker closes after a successful import
    expect(screen.queryByRole("dialog", { name: "Import browser bookmarks" })).not.toBeInTheDocument();
  });
});
