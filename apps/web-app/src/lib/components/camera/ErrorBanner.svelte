<script lang="ts">
	import Banner from "$lib/components/camera/Banner.svelte";

	type Props = {
		message?: string;
	};

	let { message = "" }: Props = $props();
</script>

<Banner {message} tone="error" />
