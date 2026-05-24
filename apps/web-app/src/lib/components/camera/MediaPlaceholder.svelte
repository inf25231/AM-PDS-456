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

<div class="overlay">
    <div class="placeholder">
        <img src={loading ? loadingIcon : offIcon} alt={loading ? loadingAlt : offAlt} />
    </div>
</div>

<style>
    .overlay {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        background: rgba(0, 0, 0, 0.45);
    }

    .placeholder {
        display: grid;
        gap: 0.75rem;
        place-items: center;
        color: white;
    }

    .placeholder img {
        width: 56px;
        height: 56px;
        filter: invert(1);
    }
</style>
