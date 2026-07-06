<!--
    MediaPlaceholder.svelte

    Full-cover overlay shown when the camera is off or starting. Pure status
    indicator — not interactive. Shows a loading icon while the camera is
    initializing, and an "off" icon otherwise.
-->
<script lang="ts">
    type Props = {
        loading?: boolean;
        loadingIcon?: string;
        offIcon?: string;
        loadingAlt?: string;
        offAlt?: string;
    };

    let {
        loading = false,
        loadingIcon = "",
        offIcon = "",
        loadingAlt = "Starting",
        offAlt = "Off",
    }: Props = $props();
</script>

<div class="placeholder-overlay" role="status" aria-live="polite">
    <div class="placeholder-content">
        <img
                src={loading ? loadingIcon : offIcon}
                alt={loading ? loadingAlt : offAlt}
        />
    </div>
</div>

<style>
    .placeholder-overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.45);
        z-index: 10;
    }

    .placeholder-content {
        display: grid;
        gap: 0.75rem;
        place-items: center;
        color: white;
    }

    .placeholder-content img {
        width: 56px;
        height: 56px;
        filter: invert(1);
    }
</style>