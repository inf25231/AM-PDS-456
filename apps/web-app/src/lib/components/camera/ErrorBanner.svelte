<script lang="ts">
	type Props = {
		message?: string;
	};

	let { message = "" }: Props = $props();
</script>

{#if message}
	<p class="error">{message}</p>
{/if}

<style>
	.error {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		color: #fecaca;
		font-weight: 600;
		background: rgba(127, 29, 29, 0.4);
		padding: 0.5rem;
		border-radius: 8px;
	}
</style>
