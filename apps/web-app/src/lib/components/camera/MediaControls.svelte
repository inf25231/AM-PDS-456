<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Simple layout wrapper for the bottom control row.
   *
   * The route decides what buttons live here. This component only pins the row
   * to the bottom center and keeps spacing consistent.
   */
  type Props = {
    children?: Snippet;
  };

  let { children }: Props = $props();
</script>

<div class="controls" aria-label="Media controls">
  {@render children?.()}
</div>

<style>
  .controls {
    position: absolute;
    left: 50%;
    bottom: var(--control-corner-offset);
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--control-gap);
  }

  :global(.media-toggle-group) {
    display: flex;
    align-items: center;
    gap: var(--control-gap);
  }

  :global(.leave-control) {
    position: absolute;
    right: calc(100% + var(--control-gap));
  }
</style>
