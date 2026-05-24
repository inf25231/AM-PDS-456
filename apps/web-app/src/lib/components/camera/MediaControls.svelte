<script lang="ts">
    type Props = {
        children?: () => unknown;
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
        display: flex;
        gap: 0.75rem;
    }
</style>
