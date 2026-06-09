<script lang="ts">
	import type { Snippet } from "svelte";
	import { scale } from "svelte/transition";
	import triggerOpenIcon from "$lib/images/settings.svg";
	import triggerCloseIcon from "$lib/images/x-close.svg";

	type Props = {
		children?: Snippet;
		panelId?: string;
		open?: boolean;
		showToggle?: boolean;
	};

	let {
		children,
		panelId = "camera-popover-panel",
		open,
		showToggle = true,
	}: Props = $props();

	let isOpen = $state(false);
	const panelOpen = $derived(open ?? isOpen);

	function handleToggle() {
		isOpen = !isOpen;
	}
</script>

<div class="popover-anchor" data-inline={!showToggle}>
	{#if showToggle}
	<button
		class="popover-toggle"
		aria-label={panelOpen ? "Close menu" : "Open menu"}
		aria-expanded={panelOpen}
		aria-controls={panelId}
		onclick={handleToggle}
	>
		<span class:icon-layer={true} class:icon-layer-visible={!panelOpen}>
			<img class="popover-icon" src={triggerOpenIcon} alt="Open menu" />
		</span>

		<span class:icon-layer={true} class:icon-layer-visible={panelOpen}>
			<img class="popover-icon" src={triggerCloseIcon} alt="Close menu" />
		</span>
	</button>
	{/if}

	{#if panelOpen}
		{#if showToggle}
		<div
			id={panelId}
			class="popover-panel"
			transition:scale={{ duration: 220, start: 0.94 }}
		>
			{#if children}
				{@render children()}
			{:else}
				<div class="popover-placeholder">Popover menu</div>
			{/if}
		</div>
		{:else}
			{#if children}
				{@render children()}
			{:else}
				<div class="popover-placeholder">Popover menu</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	.popover-anchor {
		position: absolute;
		top: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.7rem;
		z-index: 30;
	}

	.popover-anchor[data-inline="true"] {
		position: static;
		display: contents;
	}

	.popover-toggle {
		width: 48px;
		height: 48px;
		border: 0;
		border-radius: 999px;
		padding: 0;
		background: rgba(0, 0, 0, 0.65);
		color: white;
		font: inherit;
		cursor: pointer;
		backdrop-filter: blur(6px);
		display: grid;
		place-items: center;
		position: relative;
		overflow: hidden;
	}

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

	.popover-panel {
		min-width: 260px;
		min-height: 160px;
		max-width: min(340px, calc(100vw - 2rem));
		max-height: calc(100dvh - 6.5rem);
		border-radius: 18px;
		padding: 1rem;
		box-sizing: border-box;
		background: rgba(0, 0, 0, 0.82);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(16px);
		box-shadow: 0 20px 45px rgba(0, 0, 0, 0.4);
		transform-origin: top right;
		overflow: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}

	.popover-placeholder {
		width: 100%;
		height: 100%;
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
		.popover-anchor {
			top: 0.75rem;
			right: 0.75rem;
		}

		.popover-panel {
			min-width: calc(100vw - 1.5rem);
			max-width: calc(100vw - 1.5rem);
			max-height: calc(100dvh - 4.25rem);
			padding: 0.9rem;
		}
	}
</style>
