import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/svelte";
import KanbanBoard from "./KanbanBoard.svelte";
import { addTask, createDefaultState } from "../store/core";
import type { StargateState } from "../store/types";

function seed(): StargateState {
  return createDefaultState("2026-01-01T00:00:00.000Z");
}

function wsId(s: StargateState): string {
  return s.workspaces[0].id;
}

function columns(s: StargateState) {
  return s.workspaces[0].kanban.columns;
}

function baseProps(doc: StargateState) {
  return {
    doc,
    active: doc.workspaces[0],
    visible: true,
    commit: vi.fn((_next: StargateState) => true),
    commitWithUndo: vi.fn(),
    drag: null,
    dropTarget: null,
    adding: null,
    renaming: null,
    renameDraft: "",
  };
}

/** Minimal dataTransfer stand-in: jsdom doesn't implement the real DataTransfer. */
function dataTransfer() {
  return { effectAllowed: "", dropEffect: "", setData: vi.fn(), getData: vi.fn() };
}

describe("adding a kanban task", () => {
  it("adds a task to the Todo column via the inline add form", async () => {
    const doc = seed();
    const props = baseProps(doc);
    render(KanbanBoard, { props });

    const todoColumn = screen.getByRole("group", { name: "Todo column" });
    await fireEvent.click(within(todoColumn).getByRole("button", { name: /Add task/ }));

    const input = within(todoColumn).getByLabelText("New task");
    await fireEvent.input(input, { target: { value: "Write spec" } });
    await fireEvent.submit(input.closest("form")!);

    expect(props.commit).toHaveBeenCalledTimes(1);
    const next = props.commit.mock.calls[0][0] as StargateState;
    expect(columns(next)[0].tasks.map((t) => t.title)).toEqual(["Write spec"]);
  });
});

describe("moving a kanban task between columns", () => {
  it("drags a task from Todo to Done", async () => {
    let doc = seed();
    const todoId = columns(doc)[0].id;
    doc = addTask(doc, wsId(doc), todoId, "T1");
    const props = baseProps(doc);
    render(KanbanBoard, { props });

    const taskRow = screen.getByText("T1").closest('[role="listitem"]') as HTMLElement;
    const doneColumn = screen.getByRole("group", { name: "Done column" });

    await fireEvent.dragStart(taskRow, { dataTransfer: dataTransfer() });
    await fireEvent.dragOver(doneColumn, { dataTransfer: dataTransfer() });
    await fireEvent.drop(doneColumn, { dataTransfer: dataTransfer() });

    expect(props.commit).toHaveBeenCalledTimes(1);
    const next = props.commit.mock.calls[0][0] as StargateState;
    expect(columns(next)[0].tasks).toEqual([]);
    expect(columns(next)[2].tasks.map((t) => t.title)).toEqual(["T1"]);
  });
});
