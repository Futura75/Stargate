import { describe, expect, it } from "vitest";
import {
  addKanbanColumn,
  addTask,
  createDefaultState,
  deleteKanbanColumn,
  deleteTask,
  moveTask,
  renameKanbanColumn,
  reorderKanbanColumn,
  updateTask,
} from "./core";
import type { StargateState } from "./types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

function wsId(s: StargateState): string {
  return s.workspaces[0].id;
}

function kanban(s: StargateState) {
  return s.workspaces[0].kanban.columns;
}

describe("kanban defaults", () => {
  it("seeds a workspace with Todo / In Progress / Done and empty tasks", () => {
    const s = seed();
    expect(kanban(s).map((c) => c.title)).toEqual(["Todo", "In Progress", "Done"]);
    for (const c of kanban(s)) expect(c.tasks).toEqual([]);
  });
});

describe("kanban columns", () => {
  it("adds a column in positional order", () => {
    const s = seed();
    const next = addKanbanColumn(s, wsId(s), "Backlog");
    expect(kanban(next).map((c) => c.title)).toEqual(["Todo", "In Progress", "Done", "Backlog"]);
    expect(kanban(next)[3].tasks).toEqual([]);
    expect(s.workspaces[0].kanban.columns).toHaveLength(3);
  });

  it("renames a column", () => {
    const s = seed();
    const id = kanban(s)[0].id;
    const next = renameKanbanColumn(s, wsId(s), id, "To Do");
    expect(kanban(next).map((c) => c.title)).toEqual(["To Do", "In Progress", "Done"]);
  });

  it("deletes a column and keeps its siblings", () => {
    const s = seed();
    const id = kanban(s)[1].id;
    const next = deleteKanbanColumn(s, wsId(s), id);
    expect(kanban(next).map((c) => c.title)).toEqual(["Todo", "Done"]);
  });

  it("keeps at least one column", () => {
    let s = seed();
    const ws = wsId(s);
    s = deleteKanbanColumn(s, ws, kanban(s)[0].id);
    s = deleteKanbanColumn(s, ws, kanban(s)[0].id);
    expect(kanban(s)).toHaveLength(1);
    expect(deleteKanbanColumn(s, ws, kanban(s)[0].id)).toBe(s);
  });

  it("reorders columns positionally", () => {
    const s = seed();
    const id = kanban(s)[2].id;
    const next = reorderKanbanColumn(s, wsId(s), id, 0);
    expect(kanban(next).map((c) => c.title)).toEqual(["Done", "Todo", "In Progress"]);
  });
});

describe("kanban tasks", () => {
  it("adds a task with empty notes and a null due date", () => {
    const s = seed();
    const col = kanban(s)[0].id;
    const next = addTask(s, wsId(s), col, "Write spec");
    expect(kanban(next)[0].tasks).toHaveLength(1);
    expect(kanban(next)[0].tasks[0]).toMatchObject({ title: "Write spec", notes: "", due: null });
  });

  it("updates task title, notes, and due date", () => {
    const s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    const withTask = addTask(s, ws, col, "Write spec");
    const taskId = kanban(withTask)[0].tasks[0].id;
    const next = updateTask(withTask, ws, col, taskId, {
      title: "Write v1 spec",
      notes: "Draft",
      due: "2026-01-10",
    });
    expect(kanban(next)[0].tasks[0]).toMatchObject({
      title: "Write v1 spec",
      notes: "Draft",
      due: "2026-01-10",
    });
  });

  it("clears a due date with null", () => {
    const s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    const withTask = addTask(s, ws, col, "T");
    const taskId = kanban(withTask)[0].tasks[0].id;
    const set = updateTask(withTask, ws, col, taskId, { due: "2026-01-10" });
    const cleared = updateTask(set, ws, col, taskId, { due: null });
    expect(kanban(cleared)[0].tasks[0].due).toBeNull();
  });

  it("deletes a task", () => {
    const s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    const withTask = addTask(s, ws, col, "A");
    const taskId = kanban(withTask)[0].tasks[0].id;
    const next = deleteTask(withTask, ws, col, taskId);
    expect(kanban(next)[0].tasks).toEqual([]);
  });
});

describe("moveTask", () => {
  it("moves a task across columns", () => {
    let s = seed();
    const ws = wsId(s);
    const todo = kanban(s)[0].id;
    const done = kanban(s)[2].id;
    s = addTask(s, ws, todo, "T1");
    const taskId = kanban(s)[0].tasks[0].id;
    const next = moveTask(s, ws, todo, done, taskId, 0);
    expect(kanban(next)[0].tasks).toEqual([]);
    expect(kanban(next)[2].tasks.map((t) => t.title)).toEqual(["T1"]);
  });

  it("inserts a moved task at a specific index in the target column", () => {
    let s = seed();
    const ws = wsId(s);
    const todo = kanban(s)[0].id;
    const done = kanban(s)[2].id;
    s = addTask(s, ws, done, "X");
    s = addTask(s, ws, done, "Y");
    s = addTask(s, ws, todo, "T1");
    const taskId = kanban(s)[0].tasks[0].id;
    const next = moveTask(s, ws, todo, done, taskId, 1);
    expect(kanban(next)[2].tasks.map((t) => t.title)).toEqual(["X", "T1", "Y"]);
    expect(kanban(next)[0].tasks).toEqual([]);
  });

  it("reorders a task within a column", () => {
    let s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    s = addTask(s, ws, col, "A");
    s = addTask(s, ws, col, "B");
    s = addTask(s, ws, col, "C");
    const ids = kanban(s)[0].tasks.map((t) => t.id);
    const next = moveTask(s, ws, col, col, ids[2], 0);
    expect(kanban(next)[0].tasks.map((t) => t.title)).toEqual(["C", "A", "B"]);
  });
});

describe("missing ids are no-ops", () => {
  it("returns the same state reference when a target id is missing", () => {
    const s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    const withTask = addTask(s, ws, col, "T");
    const taskId = kanban(withTask)[0].tasks[0].id;

    expect(addKanbanColumn(s, "x", "T")).toBe(s);
    expect(renameKanbanColumn(s, ws, "x", "T")).toBe(s);
    expect(renameKanbanColumn(s, "x", col, "T")).toBe(s);
    expect(deleteKanbanColumn(s, ws, "x")).toBe(s);
    expect(deleteKanbanColumn(s, "x", col)).toBe(s);
    expect(reorderKanbanColumn(s, ws, "x", 0)).toBe(s);
    expect(reorderKanbanColumn(s, "x", col, 0)).toBe(s);
    expect(addTask(s, ws, "x", "T")).toBe(s);
    expect(addTask(s, "x", col, "T")).toBe(s);
    expect(updateTask(s, ws, col, "x", { title: "T" })).toBe(s);
    expect(updateTask(s, ws, "x", taskId, { title: "T" })).toBe(s);
    expect(updateTask(s, "x", col, taskId, { title: "T" })).toBe(s);
    expect(deleteTask(s, ws, col, "x")).toBe(s);
    expect(deleteTask(s, ws, "x", taskId)).toBe(s);
    expect(deleteTask(s, "x", col, taskId)).toBe(s);
    expect(moveTask(s, ws, "x", col, taskId, 0)).toBe(s);
    expect(moveTask(s, ws, col, "x", taskId, 0)).toBe(s);
    expect(moveTask(s, ws, col, col, "x", 0)).toBe(s);
    expect(moveTask(s, "x", col, col, taskId, 0)).toBe(s);
  });
});

describe("due date format", () => {
  it("stores date-only YYYY-MM-DD strings and null", () => {
    const s = seed();
    const ws = wsId(s);
    const col = kanban(s)[0].id;
    const withTask = addTask(s, ws, col, "T");
    const taskId = kanban(withTask)[0].tasks[0].id;
    expect(kanban(withTask)[0].tasks[0].due).toBeNull();
    const next = updateTask(withTask, ws, col, taskId, { due: "2026-12-31" });
    expect(kanban(next)[0].tasks[0].due).toBe("2026-12-31");
    expect(kanban(next)[0].tasks[0].due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
