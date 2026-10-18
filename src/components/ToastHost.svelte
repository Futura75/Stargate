<script lang="ts">
  /* eslint-disable svelte/no-at-html-tags -- every {@html} usage in this
     file renders the static icon() helper, which only interpolates a
     hardcoded ICONS[name] string keyed by literal icon names; there is no
     user-controlled content reaching {@html} here. */
  import { icon } from "./icons";
  import { i18n } from "../i18n/state.svelte";
  import type { StargateState } from "../store/types";

  let {
    toasts,
    onundo,
  }: {
    toasts: { id: number; message: string; undo: StargateState | null }[];
    onundo: (id: number) => void;
  } = $props();

  const t = $derived(i18n.t);
</script>

<div class="toasts" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast" role="status">
      <span class="toast-msg">{toast.message}</span>
      {#if toast.undo}
        <button onclick={() => onundo(toast.id)}>{@html icon("undo")} {t.toast.undo}</button>
      {/if}
    </div>
  {/each}
</div>
