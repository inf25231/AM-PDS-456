<script lang="ts">
    import type { Snippet } from "svelte";

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

<div class="controls">
    {@render children?.()}
</div>

<style>
    .controls {
        position: absolute;
        left: 50%;
        bottom: 1.5rem;
        transform: translateX(-50%);
        z-index: 20;
        display: flex;
        gap: 0.75rem;
    }
</style>
