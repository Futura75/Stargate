export type DragPayload =
  | { kind: "workspace"; workspaceId: string }
  | { kind: "column"; columnId: string }
  | { kind: "block"; columnId: string; blockId: string }
  | { kind: "link"; columnId: string; blockId: string; linkId: string }
  | { kind: "kanbanColumn"; columnId: string }
  | { kind: "task"; columnId: string; taskId: string };

/** Inline add forms ("+ Add link", "+ Add block", …) are revealed one at a time. */
export type AddingKind = "link" | "block" | "column" | "task" | "kanbanColumn";
