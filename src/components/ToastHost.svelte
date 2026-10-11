<script lang="ts">
  import { icon } from "./icons";
  import type { StargateState } from "../store/types";

  let {
    toasts,
    onundo,
  }: {
    toasts: { id: number; message: string; undo: StargateState | null }[];
    onundo: (id: number) => void;
  } = $props();
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast" role="status">
      <span class="toast-msg">{toast.message}</span>
      {#if toast.undo}
        <button onclick={() => onundo(toast.id)}>{@html icon("undo")} Undo</button>
      {/if}
    </div>
  {/each}
</div>
