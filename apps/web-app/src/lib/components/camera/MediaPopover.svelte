<!--
    MediaPopover.svelte

    Minimal popover primitive: a pill toggle button + a floating panel
    positioned relative to it.

    Knows nothing about where it sits on the page — the parent is responsible
    for placement (e.g. Actions.svelte positions it in the top-right corner).

    Use `showToggle={false}` to render only the panel and drive its visibility
    externally via the `open` prop.
-->
<script lang="ts">
	import type { Snippet } from "svelte";
	import { scale } from "svelte/transition";
	import PillButton from "./PillButton.svelte";
	import ToggleIcon from "./ToggleIcon.svelte";

	type Props = {
		children?: Snippet;
		panelId?: string;
		open?: boolean;
		showToggle?: boolean;
		panelClass?: string;
		openIcon?: string;
		closeIcon?: string;
	};

	let {
		children,
		panelId = "camera-popover-panel",
		open,
		showToggle = true,
		panelClass = "",
		openIcon = "",
		closeIcon = "",
	}: Props = $props();

	let isOpen = $state(false);
	const panelOpen = $derived(open ?? isOpen);

	function handleToggle() {
		isOpen = !isOpen;
	}
</script>

<div class="popover-anchor">
	{#if showToggle}
		<PillButton
				iconOnly
				ariaLabel={panelOpen ? "Close menu" : "Open menu"}
				ariaExpanded={panelOpen}
				ariaControls={panelId}
				onclick={handleToggle}
		>
			<ToggleIcon
					active={panelOpen}
					activeSrc={closeIcon}
					inactiveSrc={openIcon}
			/>
		</PillButton>
	{/if}

	{#if panelOpen}
		<div
				id={panelId}
				class={`popover-panel ${panelClass}`.trim()}
				transition:scale={{ duration: 220, start: 0.94 }}
		>
			{#if children}
				{@render children()}
			{:else}
				<div class="popover-placeholder">Popover menu</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Anchor: relative — so the panel can position itself against the trigger.
       Owns no page-level positioning. */
	.popover-anchor {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	/* Cross-fade between open / close icons inside the toggle */
	.icon-layer {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		opacity: 0;
		transform: rotate(-90deg) scale(0.82);
		transition: transform 220ms ease, opacity 220ms ease;
	}

	.icon-layer-visible {
		opacity: 1;
		transform: rotate(0deg) scale(1);
	}

	.popover-icon {
		width: 30px;
		height: 30px;
		display: block;
		filter: invert(1);
	}

	/* Floating panel — anchored to the trigger via the .popover-anchor */
	.popover-panel {
		position: absolute;
		top: calc(100% + 0.7rem);
		right: 0;
		min-width: 320px;
		max-width: min(440px, calc(100vw - 2rem));
		max-height: calc(100dvh - 6.5rem);
		border-radius: var(--surface-radius);
		padding: var(--surface-padding);
		background: var(--surface-bg);
		border: 1px solid var(--surface-border);
		color: var(--text-primary);
		backdrop-filter: var(--surface-blur);
		-webkit-backdrop-filter: var(--surface-blur);
		box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
		transform-origin: top right;
		overflow: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		z-index: 30;
		box-sizing: border-box;
	}

	.popover-placeholder {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 12px;
		border: 1px dashed rgba(255, 255, 255, 0.2);
		min-height: 128px;
		font-size: 0.95rem;
		letter-spacing: 0.02em;
		color: rgba(255, 255, 255, 0.72);
	}

	@media (max-width: 640px) {
		.popover-icon {
			width: 26px;
			height: 26px;
		}

		.popover-panel {
			min-width: calc(100vw - 1.5rem);
			max-width: calc(100vw - 1.5rem);
			max-height: calc(100dvh - 4.25rem);
			padding: 0.9rem;
		}
	}
</style>