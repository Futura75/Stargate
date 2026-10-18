<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper, which only interpolates a
     hardcoded ICONS[name] string keyed by literal icon names; there is no
     user-controlled content reaching {@html} here. */
  import {
    addKanbanColumn,
    addTask,
    deleteKanbanColumn,
    deleteTask,
    moveTask,
    renameKanbanColumn,
    reorderKanbanColumn,
    updateTask,
  } from "../store/core";
  import type { KanbanColumn, StargateState, Task, Workspace } from "../store/types";
  import { autofocus } from "./actions";
  import { icon } from "./icons";
  import { todayISO } from "./format";
  import { i18n } from "../i18n/state.svelte";
  import type { AddingKind, DragPayload } from "./dragTypes";

  let {
    doc,
    active,
    visible,
    commit,
    commitWithUndo,
    drag = $bindable(),
    dropTarget = $bindable(),
    adding = $bindable(),
    renaming = $bindable(),
    renameDraft = $bindable(),
  }: {
    doc: StargateState;
    active: Workspace | undefined;
    visible: boolean;
    commit: (next: StargateState) => boolean;
    commitWithUndo: (next: StargateState, message: string) => void;
    drag: DragPayload | null;
    dropTarget: string | null;
    adding: { kind: AddingKind; id: string } | null;
    renaming: { kind: "column" | "kanbanColumn"; id: string } | null;
    renameDraft: string;
  } = $props();

  const t = $derived(i18n.t);

  let expandedTaskId: string | null = $state(null);
  let expandedColumnId: string | null = $state(null);
  let notesDraft: string = $state("");
  let dueDraft: string = $state("");
  let editingTaskId: string | null = $state(null);
  let editingColumnId: string | null = $state(null);
  let titleDraft: string = $state("");

  export function hasExpandedTask(): boolean {
    return expandedTaskId !== null;
  }

  export function closeOnEscape(): boolean {
    if (expandedTaskId !== null) {
      expandedTaskId = expandedColumnId = null;
      return true;
    }
    return false;
  }

  export function resetEphemeral() {
    expandedTaskId = expandedColumnId = null;
  }

  // ---------- inline add & rename (shared with LinksBoard via bound props) ----------

  function startAdding(kind: AddingKind, id: string) {
    renaming = null;
    adding = { kind, id };
  }

  function isAdding(kind: AddingKind, id: string): boolean {
    return adding?.kind === kind && adding.id === id;
  }

  function onAddBlur(e: FocusEvent) {
    const input = e.currentTarget as HTMLInputElement;
    const form = input.form;
    if (input.value.trim() || (e.relatedTarget && form?.contains(e.relatedTarget as Node))) return;
    const current = adding;
    setTimeout(() => {
      if (adding === current) adding = null;
    }, 0);
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      adding = null;
    }
  }

  function startRename(kind: "column" | "kanbanColumn", id: string, title: string) {
    adding = null;
    renaming = { kind, id };
    renameDraft = title;
  }

  function commitRename() {
    const target = renaming;
    renaming = null;
    const title = renameDraft.trim();
    if (!target || !title || !active) return;
    if (target.kind === "kanbanColumn") commit(renameKanbanColumn(doc, active.id, target.id, title));
  }

  function onRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      renaming = null;
    }
  }

  // ---------- kanban ----------

  function dueStatus(due: string | null): "overdue" | "today" | "upcoming" | null {
    if (!due) return null;
    const today = todayISO();
    if (due < today) return "overdue";
    if (due === today) return "today";
    return "upcoming";
  }

  function dueLabel(due: string): string {
    const status = dueStatus(due);
    const date = new Date(`${due}T00:00:00`).toLocaleDateString(t.locale, { month: "short", day: "numeric" });
    if (status === "today") return t.kanban.today;
    if (status === "overdue") return t.kanban.overdue(date);
    return date;
  }

  function onAddKanbanColumn(e: SubmitEvent) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addKanbanColumn(doc, active.id, title));
    adding = null;
  }

  function onAddTask(e: SubmitEvent, column: KanbanColumn) {
    e.preventDefault();
    const input = (e.currentTarget as HTMLFormElement).querySelector("input");
    const title = input?.value.trim();
    if (!title || !active) return;
    commit(addTask(doc, active.id, column.id, title));
    if (input) input.value = "";
  }

  function onDeleteKanbanColumn(column: KanbanColumn) {
    if (!active) return;
    if (active.kanban.columns.length <= 1) return;
    commitWithUndo(deleteKanbanColumn(doc, active.id, column.id), t.toast.deletedColumn(column.title));
  }

  function beginEditTitle(column: KanbanColumn, task: Task) {
    editingColumnId = column.id;
    editingTaskId = task.id;
    titleDraft = task.title;
  }

  function commitTitle() {
    if (!active || editingTaskId === null || editingColumnId === null) return;
    const columnId = editingColumnId;
    const taskId = editingTaskId;
    const title = titleDraft.trim();
    editingTaskId = null;
    editingColumnId = null;
    if (!title) return;
    commit(updateTask(doc, active.id, columnId, taskId, { title }));
  }

  function cancelTitle() {
    editingTaskId = null;
    editingColumnId = null;
  }

  function onTitleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      cancelTitle();
    }
  }

  function toggleEditor(column: KanbanColumn, task: Task) {
    if (expandedTaskId === task.id && expandedColumnId === column.id) {
      expandedTaskId = null;
      expandedColumnId = null;
    } else {
      expandedTaskId = task.id;
      expandedColumnId = column.id;
      notesDraft = task.notes;
      dueDraft = task.due ?? "";
    }
  }

  function currentExpandedTask(): Task | null {
    if (!active || expandedTaskId === null || expandedColumnId === null) return null;
    const column = active.kanban.columns.find((c) => c.id === expandedColumnId);
    return column?.tasks.find((t) => t.id === expandedTaskId) ?? null;
  }

  function commitNotes() {
    if (!active || expandedTaskId === null || expandedColumnId === null) return;
    const task = currentExpandedTask();
    if (!task || task.notes === notesDraft) return;
    commit(updateTask(doc, active.id, expandedColumnId, expandedTaskId, { notes: notesDraft }));
  }

  function onDueChange() {
    if (!active || expandedTaskId === null || expandedColumnId === null) return;
    const task = currentExpandedTask();
    const due = dueDraft || null;
    if (!task || task.due === due) return;
    commit(updateTask(doc, active.id, expandedColumnId, expandedTaskId, { due }));
  }

  function clearDue() {
    dueDraft = "";
    onDueChange();
  }

  function onDeleteTask(column: KanbanColumn, task: Task) {
    if (!active) return;
    if (expandedTaskId === task.id && expandedColumnId === column.id) {
      expandedTaskId = null;
      expandedColumnId = null;
    }
    if (editingTaskId === task.id && editingColumnId === column.id) {
      editingTaskId = null;
      editingColumnId = null;
    }
    commitWithUndo(deleteTask(doc, active.id, column.id, task.id), t.toast.deletedTask(task.title));
  }

  // ---------- drag & drop ----------

  function startDrag(e: DragEvent, payload: DragPayload) {
    drag = payload;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", payload.kind);
    }
  }

  function endDrag() {
    drag = null;
    dropTarget = null;
  }

  function markDrop(key: string) {
    if (dropTarget !== key) dropTarget = key;
  }

  function kanbanColumnDragOver(e: DragEvent, columnId: string) {
    if (!drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    markDrop(`kcol:${columnId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function kanbanTaskDragOver(e: DragEvent, taskId: string) {
    if (!drag || drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    markDrop(`task:${taskId}`);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  function dropOnKanbanColumn(e: DragEvent, column: KanbanColumn, columnIndex: number) {
    if (!active || !drag) return;
    if (drag.kind !== "kanbanColumn" && drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    if (payload.kind === "kanbanColumn") {
      commit(reorderKanbanColumn(doc, active.id, payload.columnId, columnIndex));
    } else {
      commit(moveTask(doc, active.id, payload.columnId, column.id, payload.taskId, column.tasks.length));
    }
  }

  function dropOnKanbanTask(e: DragEvent, column: KanbanColumn, taskIndex: number) {
    if (!active || !drag || drag.kind !== "task") return;
    e.preventDefault();
    e.stopPropagation();
    const payload = drag;
    endDrag();
    commit(moveTask(doc, active.id, payload.columnId, column.id, payload.taskId, taskIndex));
  }
</script>

{#if visible && active}
  <div class="kanban-board">
    {#each active.kanban.columns as column, columnIndex (column.id)}
      <section
        class="kanban-col"
        class:drop-over={dropTarget === `kcol:${column.id}`}
        role="group"
        aria-label={t.board.columnLabel(column.title)}
        ondragover={(e) => kanbanColumnDragOver(e, column.id)}
        ondrop={(e) => dropOnKanbanColumn(e, column, columnIndex)}
      >
        <header
          class="kanban-col-head"
          role="presentation"
          draggable={renaming?.id !== column.id}
          ondragstart={(e) => startDrag(e, { kind: "kanbanColumn", columnId: column.id })}
          ondragend={endDrag}
        >
          {#if renaming?.kind === "kanbanColumn" && renaming.id === column.id}
            <input
              class="inline-input"
              bind:value={renameDraft}
              onkeydown={onRenameKeydown}
              onblur={commitRename}
              aria-label={t.board.columnTitle}
              use:autofocus={true}
            />
          {:else}
            <button
              type="button"
              class="kanban-col-title"
              title={t.board.renameHint}
              onclick={() => startRename("kanbanColumn", column.id, column.title)}
            >{column.title}</button>
          {/if}
          <span class="count">{column.tasks.length}</span>
          {#if active.kanban.columns.length > 1}
            <div class="hover-tools">
              <button class="icon-btn danger" title={t.board.deleteColumn} onclick={() => onDeleteKanbanColumn(column)}>{@html icon("x")}</button>
            </div>
          {/if}
        </header>

        <div class="kanban-tasks" role="list">
          {#each column.tasks as task, taskIndex (task.id)}
            {@const open = expandedTaskId === task.id && expandedColumnId === column.id}
            {@const editing = editingTaskId === task.id && editingColumnId === column.id}
            <div
              class="kanban-task"
              class:open
              class:drop-over={dropTarget === `task:${task.id}`}
              role="listitem"
              draggable={!open && !editing}
              ondragstart={(e) => startDrag(e, { kind: "task", columnId: column.id, taskId: task.id })}
              ondragend={endDrag}
              ondragover={(e) => kanbanTaskDragOver(e, task.id)}
              ondrop={(e) => dropOnKanbanTask(e, column, taskIndex)}
            >
              <div class="kanban-task-row">
                {#if editing}
                  <input
                    class="inline-input"
                    bind:value={titleDraft}
                    onkeydown={onTitleKeydown}
                    onblur={commitTitle}
                    aria-label={t.kanban.taskTitle}
                    use:autofocus
                  />
                {:else}
                  <button class="task-title" title={t.kanban.clickToEdit} onclick={() => beginEditTitle(column, task)}>{task.title}</button>
                {/if}
                <button class="icon-btn" title={t.kanban.notesAndDue} onclick={() => toggleEditor(column, task)}>{@html icon("pencil")}</button>
              </div>

              {#if !open}
                <div class="kanban-task-meta">
                  <button class="note-preview" onclick={() => toggleEditor(column, task)}>
                    {#if task.notes.trim()}
                      {task.notes.split("\n")[0]}
                    {:else}
                      <span class="muted">{t.kanban.addNote}</span>
                    {/if}
                  </button>
                  {#if task.due}
                    {@const due = dueStatus(task.due)}
                    <span class="due-chip" class:overdue={due === "overdue"} class:today={due === "today"}>
                      {@html icon("cal")}{dueLabel(task.due)}
                    </span>
                  {/if}
                </div>
              {:else}
                <div class="kanban-task-editor">
                  <textarea
                    bind:value={notesDraft}
                    onblur={commitNotes}
                    placeholder={t.kanban.notesPlaceholder}
                    rows={3}
                    aria-label={t.kanban.notes}
                    use:autofocus
                  ></textarea>
                  <div class="editor-row">
                    <label class="due-field">
                      {@html icon("cal")}
                      <span>{t.kanban.due}</span>
                      <input type="date" bind:value={dueDraft} onchange={onDueChange} />
                    </label>
                    {#if task.due}
                      <button class="btn sm ghost" onclick={clearDue}>{t.kanban.clear}</button>
                    {/if}
                  </div>
                  <div class="editor-row">
                    <button class="btn sm danger" onclick={() => onDeleteTask(column, task)}>{@html icon("trash")} {t.kanban.deleteTask}</button>
                    <button class="btn sm push" onclick={() => toggleEditor(column, task)}>{t.kanban.done}</button>
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>

        {#if isAdding("task", column.id)}
          <form class="add-form" onsubmit={(e) => onAddTask(e, column)}>
            <input
              class="inline-input"
              placeholder={t.kanban.taskTitle}
              aria-label={t.kanban.newTask}
              onblur={onAddBlur}
              onkeydown={onAddKeydown}
              use:autofocus
            />
            <button class="icon-btn" type="submit" title={t.kanban.addTask}>{@html icon("plus")}</button>
          </form>
        {:else}
          <button class="ghost-add" onclick={() => startAdding("task", column.id)}>{@html icon("plus")} {t.kanban.addTask}</button>
        {/if}
      </section>
    {/each}

    {#if isAdding("kanbanColumn", active.id)}
      <div class="add-tile kanban-add-tile">
        <form class="add-form" onsubmit={onAddKanbanColumn}>
          <input
            class="inline-input"
            placeholder={t.board.columnTitle}
            aria-label={t.board.newColumn}
            onblur={onAddBlur}
            onkeydown={onAddKeydown}
            use:autofocus
          />
          <button class="icon-btn" type="submit" title={t.board.addColumn}>{@html icon("plus")}</button>
        </form>
      </div>
    {:else}
      <button class="add-tile kanban-add-tile" onclick={() => startAdding("kanbanColumn", active.id)}>{@html icon("plus")}<span>{t.board.newColumn}</span></button>
    {/if}
  </div>
{/if}
