import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/svelte";
import ToastHost from "./ToastHost.svelte";
import { createDefaultState } from "../store/core";

describe("triggering and dismissing a toast", () => {
  it("renders a toast message and calls onundo when its Undo button is clicked", async () => {
    const snapshot = createDefaultState("2026-01-01T00:00:00.000Z");
    const onundo = vi.fn();
    render(ToastHost, {
      props: {
        toasts: [{ id: 1, message: "Deleted workspace “Personal”", undo: snapshot }],
        onundo,
      },
    });

    expect(screen.getByText("Deleted workspace “Personal”")).toBeInTheDocument();
    const undoButton = screen.getByRole("button", { name: /Undo/ });

    await fireEvent.click(undoButton);
    expect(onundo).toHaveBeenCalledWith(1);
  });

  it("renders no Undo button for a toast without an undo snapshot", () => {
    render(ToastHost, {
      props: {
        toasts: [{ id: 2, message: "No undo for this one", undo: null }],
        onundo: vi.fn(),
      },
    });

    expect(screen.getByText("No undo for this one")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });

  it("renders nothing once the toast list is emptied (dismissal)", () => {
    const { rerender } = render(ToastHost, {
      props: { toasts: [{ id: 3, message: "Bye", undo: null }], onundo: vi.fn() },
    });
    expect(screen.getByText("Bye")).toBeInTheDocument();

    rerender({ toasts: [], onundo: vi.fn() });
    expect(screen.queryByText("Bye")).not.toBeInTheDocument();
  });
});
