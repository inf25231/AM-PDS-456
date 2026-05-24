<script lang="ts">
    type Props = {
        loading?: boolean;
        active?: boolean;
        disabled?: boolean;
        loadingIcon?: string;
        activeIcon?: string;
        inactiveIcon?: string;
        loadingAlt?: string;
        activeAlt?: string;
        inactiveAlt?: string;
        onToggle?: () => void | Promise<void>;
    };

    let {
        loading = false,
        active = false,
        disabled = false,
        loadingIcon = "",
        activeIcon = "",
        inactiveIcon = "",
        loadingAlt = "Loading",
        activeAlt = "Active",
        inactiveAlt = "Inactive",
        onToggle,
    }: Props = $props();
</script>

<button class="toggle" onclick={onToggle} {disabled}>
    {#if loading}
        <img class="toggle-icon" src={loadingIcon} alt={loadingAlt} />
    {:else if active}
        <img class="toggle-icon" src={activeIcon} alt={activeAlt} />
    {:else}
        <img class="toggle-icon" src={inactiveIcon} alt={inactiveAlt} />
    {/if}
</button>

<style>
    .toggle {
        border: 0;
        border-radius: 999px;
        padding: 0.9rem 1.2rem;
        background: rgba(0, 0, 0, 0.65);
        color: white;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        backdrop-filter: blur(6px);
    }

    .toggle:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .toggle-icon {
        width: 30px;
        height: 30px;
        display: block;
        filter: invert(1);
    }
</style>
