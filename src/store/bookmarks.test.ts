import { describe, expect, it } from "vitest";
import {
  bookmarksFolderCounts,
  DEFAULT_BOOKMARKS_COLUMN_TITLE,
  DEFAULT_BOOKMARKS_WORKSPACE_TITLE,
  DEFAULT_UNGROUPED_BLOCK_TITLE,
  folderPathKey,
  importBookmarksFromTree,
  listBookmarkFolders,
  parseBookmarksHtml,
} from "./bookmarks";
import type { BookmarksEntry, BookmarksFolder, BookmarksLink, BookmarksTree } from "./bookmarks";
import {
  DEFAULT_BLOCK_TITLE_SIZE,
  DEFAULT_LINK_STYLE,
  DEFAULT_WORKSPACE_LAYOUT,
  addWorkspace,
  createDefaultState,
  exportState,
  importState,
} from "./core";
import type { StargateState } from "./types";

/** Builds a folder node with paths derived from the nesting, mirroring the parser's identity. */
function folder(name: string, children: BookmarksEntry[] = [], parentPath: string[] = []): BookmarksFolder {
  const path = [...parentPath, name];
  return {
    type: "folder",
    name,
    path,
    children: children.map((c) => (c.type === "folder" ? folder(c.name, c.children, path) : c)),
  };
}

function link(title: string, url: string): BookmarksLink {
  return { type: "link", title, url };
}

function tree(...entries: BookmarksEntry[]): BookmarksTree {
  return { entries };
}

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

describe("parseBookmarksHtml", () => {
  it("parses top-level folders with nested subfolders and links", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1700000001">Example</A>
        <DT><H3>Subfolder</H3>
        <DL><p>
            <DT><A HREF="https://sub.example.com">Sub</A>
        </DL><p>
    </DL><p>
</DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([
      folder("Bookmarks bar", [
        link("Example", "https://example.com"),
        folder("Subfolder", [link("Sub", "https://sub.example.com")]),
      ]),
    ]);
  });

  it("gives every folder its name path from the tree root", () => {
    const html = `<DL><p>
      <DT><H3>Top</H3>
      <DL><p>
        <DT><H3>Mid</H3><DL><p><DT><H3>Deep</H3><DL><p></DL><p></DL><p>
      </DL><p>
    </DL><p>`;
    const top = parseBookmarksHtml(html).entries[0] as BookmarksFolder;
    const mid = top.children[0] as BookmarksFolder;
    const deep = mid.children[0] as BookmarksFolder;
    expect(top.path).toEqual(["Top"]);
    expect(mid.path).toEqual(["Top", "Mid"]);
    expect(deep.path).toEqual(["Top", "Mid", "Deep"]);
  });

  it("keeps root-level loose links alongside folders", () => {
    const html = `<DL><p>
  <DT><A HREF="https://a.com">A</A>
  <DT><H3>Folder</H3>
  <DL><p><DT><A HREF="https://b.com">B</A></DL><p>
  <DT><A HREF="https://c.com">C</A>
</DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([
      link("A", "https://a.com"),
      folder("Folder", [link("B", "https://b.com")]),
      link("C", "https://c.com"),
    ]);
  });

  it("decodes HTML entities in titles and URLs", () => {
    const html = `<DL><p><DT><A HREF="https://x.com/?a=1&amp;b=2">Tom &amp; Jerry &lt;3 &#39;q&#39; &quot;x&quot;</A></DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([
      link("Tom & Jerry <3 'q' \"x\"", "https://x.com/?a=1&b=2"),
    ]);
  });

  it("ignores HR separators, comments and metadata", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- a comment that mentions <DL> and stuff -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
  <HR>
  <DT><A HREF="https://a.com">A</A>
  <HR>
</DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([link("A", "https://a.com")]);
  });

  it("parses an empty folder as a folder with no children", () => {
    const html = `<DL><p><DT><H3>Empty</H3><DL><p></DL><p></DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([folder("Empty", [])]);
  });

  it("returns an empty tree for a valid file with no bookmarks", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<DL><p>\n</DL><p>`;
    expect(parseBookmarksHtml(html).entries).toEqual([]);
  });

  it("throws on input that is not a bookmarks file", () => {
    expect(() => parseBookmarksHtml("just some text")).toThrow(/bookmarks/i);
    expect(() => parseBookmarksHtml("")).toThrow(/bookmarks/i);
  });

  it("throws on unbalanced <DL> blocks", () => {
    const html = `<DL><p><DT><A HREF="https://a.com">A</A>`;
    expect(() => parseBookmarksHtml(html)).toThrow(/DL/);
  });

  it("throws on an unexpected </DL>", () => {
    expect(() => parseBookmarksHtml("</DL>")).toThrow(/DL/);
  });
});

describe("listBookmarkFolders", () => {
  it("walks folders pre-order with depth and recursive counts, folders only", () => {
    const html = `<DL><p>
      <DT><H3>Top</H3>
      <DL><p>
        <DT><A HREF="https://a.com">A</A>
        <DT><H3>Sub</H3><DL><p>
          <DT><A HREF="https://b.com">B</A>
          <DT><H3>Deep</H3><DL><p><DT><A HREF="https://c.com">C</A></DL><p>
        </DL><p>
      </DL><p>
      <DT><H3>Sibling</H3><DL><p><DT><A HREF="https://d.com">D</A></DL><p>
    </DL><p>`;
    expect(listBookmarkFolders(parseBookmarksHtml(html))).toEqual([
      { path: ["Top"], name: "Top", depth: 0, links: 3, subfolders: 2 },
      { path: ["Top", "Sub"], name: "Sub", depth: 1, links: 2, subfolders: 1 },
      { path: ["Top", "Sub", "Deep"], name: "Deep", depth: 2, links: 1, subfolders: 0 },
      { path: ["Sibling"], name: "Sibling", depth: 0, links: 1, subfolders: 0 },
    ]);
  });

  it("lists a folder with no subfolders and no links at depth 0", () => {
    expect(listBookmarkFolders(tree(folder("Empty")))).toEqual([
      { path: ["Empty"], name: "Empty", depth: 0, links: 0, subfolders: 0 },
    ]);
  });

  it("returns an empty list when the tree has no folders", () => {
    expect(listBookmarkFolders(tree(link("A", "https://a.com")))).toEqual([]);
  });
});

describe("importBookmarksFromTree", () => {
  it("imports every top-level folder as a workspace by default", () => {
    const parsed = tree(
      folder("Alpha", [folder("F", [link("A", "https://a.com")])]),
      folder("Beta", [folder("F", [link("B", "https://b.com")])]),
    );
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: [] });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Alpha", "Beta"]);
  });

  it("turns a folder into a workspace with one Links column", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Dev", [folder("Frontend", [link("React", "https://react.dev")])])),
      { excludedFolders: [] },
    );
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Dev"]);
    const dev = next.workspaces[1];
    expect(dev.columns.map((c) => c.title)).toEqual([DEFAULT_BOOKMARKS_COLUMN_TITLE]);
    expect(dev.columns[0].blocks.map((b) => b.title)).toEqual(["Frontend"]);
    expect(dev.columns[0].blocks[0].links.map((l) => l.title)).toEqual(["React"]);
    expect(dev.columns[0].blocks[0].links[0].url).toBe("https://react.dev");
    expect(dev.kanban.columns.map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
  });

  it("uses the app's default appearance, layout, block title size and link style", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Dev", [folder("F", [link("X", "https://x.com")])])),
      { excludedFolders: [] },
    );
    const dev = next.workspaces[1];
    expect(dev.layout).toEqual(DEFAULT_WORKSPACE_LAYOUT);
    expect(dev.blockTitleSize).toBe(DEFAULT_BLOCK_TITLE_SIZE);
    expect(dev.columns[0].blocks[0].linkStyle).toBe(DEFAULT_LINK_STYLE);
    expect(dev.background).toEqual({ dataUrl: null, alpha: 70 });
    expect(dev.columns[0].blocks[0].links[0].favicon).toBeUndefined();
  });

  it("groups links at the folder root into a Generali block", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Dev", [link("Loose A", "https://a.com"), link("Loose B", "https://b.com")])),
      { excludedFolders: [] },
    );
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual([DEFAULT_UNGROUPED_BLOCK_TITLE]);
    expect(blocks[0].links.map((l) => l.title)).toEqual(["Loose A", "Loose B"]);
  });

  it("orders subfolder blocks before the Generali block", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(
        folder("Dev", [
          link("Loose", "https://loose.com"),
          folder("Frontend", [link("React", "https://react.dev")]),
          link("Loose 2", "https://loose2.com"),
        ]),
      ),
      { excludedFolders: [] },
    );
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual(["Frontend", DEFAULT_UNGROUPED_BLOCK_TITLE]);
    expect(blocks[1].links.map((l) => l.title)).toEqual(["Loose", "Loose 2"]);
  });

  it("flattens nesting deeper than one level into the first-level block", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(
        folder("Dev", [
          folder("Frontend", [
            link("HTML", "https://html.com"),
            folder("Frameworks", [link("React", "https://react.dev")]),
          ]),
        ]),
      ),
      { excludedFolders: [] },
    );
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual(["Frontend"]);
    expect(blocks[0].links.map((l) => l.title)).toEqual(["HTML", "React"]);
  });

  it("skips empty folders/workspaces", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Empty folder"), folder("Only empty subfolder", [folder("Nothing")])),
      { excludedFolders: [] },
    );
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal"]);
  });

  it("skips empty subfolder blocks but keeps loose links", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Dev", [folder("Empty"), link("Loose", "https://loose.com")])),
      { excludedFolders: [] },
    );
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual([DEFAULT_UNGROUPED_BLOCK_TITLE]);
  });

  it("excluding a top-level folder skips that workspace and its whole subtree", () => {
    const parsed = tree(
      folder("Dev", [folder("Frontend", [link("React", "https://react.dev")])]),
      folder("Fun", [folder("Games", [link("Chess", "https://chess.com")])]),
    );
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: [folderPathKey(["Fun"])] });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Dev"]);
    expect(next.workspaces[1].columns[0].blocks[0].title).toBe("Frontend");
  });

  it("excluding a nested folder prunes only that subtree while siblings stay", () => {
    const parsed = tree(
      folder("Dev", [
        folder("Frontend", [link("React", "https://react.dev")]),
        folder("Backend", [link("Node", "https://nodejs.org")]),
      ]),
    );
    const next = importBookmarksFromTree(seed(), parsed, {
      excludedFolders: [folderPathKey(["Dev", "Frontend"])],
    });
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual(["Backend"]);
    expect(blocks[0].links.map((l) => l.title)).toEqual(["Node"]);
  });

  it("excluding a deep folder prunes only that subtree, flattening the rest", () => {
    const parsed = tree(
      folder("Dev", [
        folder("Frontend", [
          link("HTML", "https://html.com"),
          folder("Frameworks", [link("React", "https://react.dev")]),
        ]),
      ]),
    );
    const next = importBookmarksFromTree(seed(), parsed, {
      excludedFolders: [folderPathKey(["Dev", "Frontend", "Frameworks"])],
    });
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual(["Frontend"]);
    expect(blocks[0].links.map((l) => l.title)).toEqual(["HTML"]);
  });

  it("skips a top-level folder whose only content is excluded, leaving no workspace", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(folder("Dev", [folder("Only", [link("X", "https://x.com")])])),
      { excludedFolders: [folderPathKey(["Dev", "Only"])] },
    );
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal"]);
  });

  it("skips loose links at the folder root when includeUngroupedBlock is off", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(
        folder("Dev", [
          link("Loose", "https://loose.com"),
          folder("Frontend", [link("React", "https://react.dev")]),
        ]),
      ),
      { excludedFolders: [], includeUngroupedBlock: false },
    );
    const blocks = next.workspaces[1].columns[0].blocks;
    expect(blocks.map((b) => b.title)).toEqual(["Frontend"]);
  });

  it("drops a workspace whose only content is loose links when includeUngroupedBlock is off", () => {
    const next = importBookmarksFromTree(seed(), tree(folder("Dev", [link("Loose", "https://a.com")])), {
      excludedFolders: [],
      includeUngroupedBlock: false,
    });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal"]);
  });

  it("adds a Generali block to every workspace with loose links by default", () => {
    const parsed = tree(
      folder("Alpha", [folder("AF", [link("A", "https://a.com")]), link("Loose A", "https://la.com")]),
      folder("Beta", [folder("BF", [link("B", "https://b.com")]), link("Loose B", "https://lb.com")]),
    );
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: [] });
    expect(next.workspaces[1].columns[0].blocks.map((b) => b.title)).toEqual([
      "AF",
      DEFAULT_UNGROUPED_BLOCK_TITLE,
    ]);
    expect(next.workspaces[2].columns[0].blocks.map((b) => b.title)).toEqual([
      "BF",
      DEFAULT_UNGROUPED_BLOCK_TITLE,
    ]);
  });

  it("imports root-level loose links into a Segnalibri workspace only when requested", () => {
    const parsed = tree(link("Root A", "https://a.com"), link("Root B", "https://b.com"));

    const skipped = importBookmarksFromTree(seed(), parsed, { excludedFolders: [] });
    expect(skipped.workspaces.map((w) => w.name)).toEqual(["Personal"]);

    const imported = importBookmarksFromTree(seed(), parsed, {
      excludedFolders: [],
      includeRootLinks: true,
    });
    expect(imported.workspaces.map((w) => w.name)).toEqual([
      "Personal",
      DEFAULT_BOOKMARKS_WORKSPACE_TITLE,
    ]);
    const ws = imported.workspaces[1];
    expect(ws.columns[0].blocks.map((b) => b.title)).toEqual([DEFAULT_UNGROUPED_BLOCK_TITLE]);
    expect(ws.columns[0].blocks[0].links.map((l) => l.title)).toEqual(["Root A", "Root B"]);
  });

  it("does not create a Segnalibri workspace when there are no root-level links", () => {
    const parsed = tree(folder("Dev", [folder("F", [link("X", "https://x.com")])]));
    const next = importBookmarksFromTree(seed(), parsed, {
      excludedFolders: [],
      includeRootLinks: true,
    });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Dev"]);
  });

  it("suffixes duplicate workspace names against existing state and each other", () => {
    let state = seed();
    state = addWorkspace(state, { name: "Dev", icon: "✨", color: "#000000" });
    const parsed = tree(
      folder("Dev", [folder("F", [link("X", "https://x.com")])]),
      folder("Dev", [folder("F", [link("Y", "https://y.com")])]),
    );
    const next = importBookmarksFromTree(state, parsed, { excludedFolders: [] });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Dev", "Dev (2)", "Dev (3)"]);
  });

  it("keeps the bookmarks-file order regardless of the folder list order", () => {
    const parsed = tree(
      folder("Beta", [folder("F", [link("B", "https://b.com")])]),
      folder("Alpha", [folder("F", [link("A", "https://a.com")])]),
    );
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: [] });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Beta", "Alpha"]);
  });

  it("uses folder paths, not positions, to identify exclusions", () => {
    const parsed = tree(
      link("Root", "https://r.com"),
      folder("Dev", [folder("F", [link("X", "https://x.com")])]),
    );
    // An exclusion key that matches no folder path is ignored.
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: ["[\"Nope\"]", "[]"] });
    expect(next.workspaces.map((w) => w.name)).toEqual(["Personal", "Dev"]);
  });

  it("appends new workspaces without mutating the input state", () => {
    const state = seed();
    const before = JSON.stringify(state);
    const next = importBookmarksFromTree(
      state,
      tree(folder("Dev", [folder("F", [link("X", "https://x.com")])])),
      { excludedFolders: [] },
    );
    expect(JSON.stringify(state)).toBe(before);
    expect(next).not.toBe(state);
    expect(next.workspaces[0]).toBe(state.workspaces[0]);
    expect(next.settings).toBe(state.settings);
  });

  it("imports a parsed HTML file end to end", () => {
    const html = `<DL><p>
      <DT><H3>Bookmarks bar</H3>
      <DL><p>
        <DT><A HREF="https://a.com">A</A>
        <DT><H3>Sub</H3><DL><p><DT><A HREF="https://b.com">B</A></DL><p>
      </DL><p>
    </DL><p>`;
    const parsed = parseBookmarksHtml(html);
    const next = importBookmarksFromTree(seed(), parsed, { excludedFolders: [] });
    const ws = next.workspaces[1];
    expect(ws.name).toBe("Bookmarks bar");
    expect(ws.columns[0].blocks.map((b) => b.title)).toEqual(["Sub", DEFAULT_UNGROUPED_BLOCK_TITLE]);
    expect(ws.columns[0].blocks[0].links.map((l) => l.title)).toEqual(["B"]);
    expect(ws.columns[0].blocks[1].links.map((l) => l.title)).toEqual(["A"]);
  });

  it("round-trips imported workspaces through export/import", () => {
    const next = importBookmarksFromTree(
      seed(),
      tree(
        folder("Dev", [
          folder("Frontend", [link("React", "https://react.dev")]),
          link("Loose", "https://loose.com"),
        ]),
      ),
      { excludedFolders: [], includeRootLinks: true },
    );
    const roundTripped = importState(exportState(next, "2026-02-02T00:00:00.000Z"));
    expect(roundTripped).toEqual({ ...next, exportedAt: "2026-02-02T00:00:00.000Z" });
  });
});

describe("bookmarksFolderCounts", () => {
  it("counts links and subfolders recursively across depth", () => {
    const subject = folder("Root", [
      link("A", "https://a.com"),
      link("B", "https://b.com"),
      folder("Sub", [
        link("C", "https://c.com"),
        folder("Deep", [link("D", "https://d.com")]),
      ]),
    ]);

    expect(bookmarksFolderCounts(subject)).toEqual({ links: 4, subfolders: 2 });
  });

  it("mixes loose links and subfolders without counting the folder itself", () => {
    const subject = folder("Root", [
      folder("OnlyChildren", [folder("Leaf", [link("A", "https://a.com")])]),
      link("Loose", "https://loose.com"),
    ]);

    expect(bookmarksFolderCounts(subject)).toEqual({ links: 2, subfolders: 2 });
  });

  it("returns zeros for a folder with no children", () => {
    expect(bookmarksFolderCounts(folder("Empty"))).toEqual({ links: 0, subfolders: 0 });
  });
});
