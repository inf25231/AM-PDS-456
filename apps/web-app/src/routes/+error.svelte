<script lang="ts">
    import { page } from "$app/state";

    const statusCode = $derived(typeof page.status === "number" ? page.status : "unknown");
</script>

<svelte:head>
    <title>Error {statusCode}</title>
</svelte:head>

<main class="error-page">
    <div class="ui-center-content">
        <p class="code">{statusCode}</p>

        <div class="ui-actions">
            <a class="ui-ghost-button" href="/">Go home</a>
        </div>
    </div>
</main>

<style>
    @import "$lib/styles/shared-ui.css";

    .error-page {
        min-height: 100dvh;
        box-sizing: border-box;
        overflow: auto;
        display: grid;
        place-items: center;
        padding: 2rem;
        background:
            radial-gradient(1200px 500px at 20% -10%, rgba(56, 189, 248, 0.15), transparent),
            radial-gradient(900px 420px at 90% 120%, rgba(244, 63, 94, 0.12), transparent),
            #09090b;
        color: #f4f4f5;
    }

    .code {
        margin: 0;
        font-size: clamp(3rem, 12vw, 6rem);
        line-height: 0.9;
        font-weight: 800;
        letter-spacing: -0.04em;
        color: #d4d4d8;
    }
</style>
