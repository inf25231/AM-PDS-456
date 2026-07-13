<script lang="ts">
  type BannerTone = 'neutral' | 'error';

  type Props = {
    message?: string;
    tone?: BannerTone;
  };

  let { message = '', tone = 'neutral' }: Props = $props();
</script>

{#if message}
  <p
    class:banner={true}
    class:banner-neutral={tone === 'neutral'}
    class:banner-error={tone === 'error'}
  >
    {message}
  </p>
{/if}

<style>
  .banner {
    margin: 0;
    padding: 0.55rem 0.75rem;
    border-radius: 10px;
    font-weight: 600;
    max-width: min(90vw, 480px);
    text-align: center;
  }

  .banner-neutral {
    color: rgba(229, 231, 235, 0.98);
    background: rgba(55, 65, 81, 0.75);
    border: 1px solid rgba(148, 163, 184, 0.45);
  }

  .banner-error {
    color: #fecaca;
    background: rgba(127, 29, 29, 0.5);
    border: 1px solid rgba(248, 113, 113, 0.42);
  }
</style>
