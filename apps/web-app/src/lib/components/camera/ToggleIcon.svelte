<!--
    ToggleIcon.svelte

    Cross-fades between two icons with a rotation + scale animation.
    Designed to live inside a PillButton iconOnly.

    Usage:
        <PillButton iconOnly ...>
            <ToggleIcon active={isOpen} activeSrc={closeIcon} inactiveSrc={openIcon} />
        </PillButton>
-->
<script lang="ts">
    type Props = {
        active: boolean;
        activeSrc: string;
        inactiveSrc: string;
        size?: number;  // pixels
    };

    let { active, activeSrc, inactiveSrc, size = 30 }: Props = $props();
</script>

<span class="toggle-icon-stack" style="--toggle-icon-size: {size}px;">
    <span class="toggle-icon-layer" class:toggle-icon-layer-visible={!active}>
        <img src={inactiveSrc} alt="" />
    </span>
    <span class="toggle-icon-layer" class:toggle-icon-layer-visible={active}>
        <img src={activeSrc} alt="" />
    </span>
</span>

<style>
    .toggle-icon-stack {
        position: relative;
        display: inline-block;
        width: var(--toggle-icon-size);
        height: var(--toggle-icon-size);
    }

    .toggle-icon-layer {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        opacity: 0;
        transform: rotate(-90deg) scale(0.82);
        transition: transform 220ms ease, opacity 220ms ease;
    }

    .toggle-icon-layer-visible {
        opacity: 1;
        transform: rotate(0deg) scale(1);
    }

    .toggle-icon-layer img {
        width: 100%;
        height: 100%;
        display: block;
        filter: invert(1);
    }

    @media (max-width: 640px) {
        .toggle-icon-stack {
            --toggle-icon-size: 26px;
        }
    }
</style>