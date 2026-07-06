<!--
    PillButton.svelte

    Unified pill-shaped button used across the camera UI.

    Variants:
      - tone="default" — black translucent (Create, Join, Settings toggle, etc.)
      - tone="danger"  — red (Leave room)

    Shape:
      - default                 → pill (auto width, horizontal padding)
      - iconOnly                → perfect circle (square × full radius)

    All sizing / colors / radii come from CSS custom properties defined on
    .camera-view in camera-page.css. This component owns no magic numbers.
-->
<script lang="ts">
    import type { Snippet } from "svelte";

    type Props = {
        children?: Snippet;
        type?: "button" | "submit" | "reset";
        tone?: "default" | "danger";
        iconOnly?: boolean;
        disabled?: boolean;
        ariaLabel?: string;
        ariaExpanded?: boolean;
        ariaPressed?: boolean;
        ariaControls?: string;
        onclick?: (e: MouseEvent) => void;
    };

    let {
        children,
        type = "button",
        tone = "default",
        iconOnly = false,
        disabled = false,
        ariaLabel,
        ariaExpanded,
        ariaPressed,
        ariaControls,
        onclick,
    }: Props = $props();
</script>

<button
        {type}
        {disabled}
        {onclick}
        class="pill"
        class:pill-danger={tone === "danger"}
        class:pill-icon={iconOnly}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-pressed={ariaPressed}
        aria-controls={ariaControls}
>
    {#if children}{@render children()}{/if}
</button>

<style>
    .pill {
        /* Sizing — driven by tokens from .camera-view */
        height: var(--control-size);
        padding: 0 var(--control-padding-x);
        border-radius: var(--control-radius);

        /* Look */
        border: 0;
        background: var(--control-bg);
        color: var(--control-color);
        backdrop-filter: var(--control-blur);
        -webkit-backdrop-filter: var(--control-blur);

        /* Typography */
        font: inherit;
        font-weight: 600;

        /* Layout */
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        flex: 0 0 auto;

        /* Behavior */
        position: relative;
        overflow: hidden;
        cursor: pointer;
    }

    .pill:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .pill:not(:disabled):active {
        transform: scale(0.97);
    }

    /* Icon-only: square → circle (because border-radius is 999px) */
    .pill-icon {
        width: var(--control-size);
        padding: 0;
    }

    /* Danger variant: red background, bolder text */
    .pill-danger {
        background: var(--control-bg-danger);
        font-weight: 700;
    }
</style>