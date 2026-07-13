<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';

  const statusCode = $derived(typeof page.status === 'number' ? page.status : 'unknown');
</script>

<svelte:head>
  <title>Error {statusCode}</title>
</svelte:head>

<main class="error-page">
  <div class="ui-center-content">
    <p class="code">{statusCode}</p>

    <div class="ui-actions">
      <a class="ui-ghost-button" href={resolve('/')}>Go home</a>
    </div>
  </div>
</main>

<style>
  .error-page {
    min-height: 100dvh;
    box-sizing: border-box;
    overflow: auto;
    display: grid;
    place-items: center;
    padding: 2rem;
    background:
      radial-gradient(1200px 500px at 20% -10%, rgba(56, 189, 248, 0.15), transparent),
      radial-gradient(900px 420px at 90% 120%, rgba(244, 63, 94, 0.12), transparent), #09090b;
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

  .ui-center-content {
    width: min(560px, 100%);
    text-align: center;
  }

  .ui-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
    margin-top: 1.6rem;
  }

  .ui-ghost-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.7rem 1rem;
    border: 1px solid rgba(212, 212, 216, 0.25);
    border-radius: 999px;
    background: transparent;
    color: #f4f4f5;
    cursor: pointer;
    font: inherit;
    line-height: 1;
    text-decoration: none;
  }
</style>
