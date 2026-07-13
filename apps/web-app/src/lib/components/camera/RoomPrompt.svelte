<script lang="ts">
  import { onMount, tick } from 'svelte';
  import PillButton from './PillButton.svelte';

  type Props = {
    title: string;
    label: string;
    initialValue: string;
    onSubmit: (value: string) => void;
    onCancel: () => void;
  };

  let { title, label, initialValue, onSubmit, onCancel }: Props = $props();

  let dialog = $state<HTMLDialogElement | null>(null);
  let input = $state<HTMLInputElement | null>(null);
  let value = $state('');

  $effect(() => {
    value = initialValue;
    void tick().then(() => input?.focus());
  });

  // showModal() provides real modal focus/inert behavior without blocking
  // JavaScript like window.prompt(), so the camera render loop keeps running.
  onMount(() => {
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  });

  function submit(): void {
    onSubmit(value.trim());
  }
</script>

<!-- App-owned async alternative to window.prompt(), which blocks mobile video rendering. -->
<dialog
  bind:this={dialog}
  class="prompt"
  aria-labelledby="room-prompt-title"
  oncancel={(event) => {
    event.preventDefault();
    onCancel();
  }}
>
  <h2 id="room-prompt-title">{title}</h2>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      submit();
    }}
  >
    <label class="field">
      <span>{label}</span>
      <input bind:this={input} bind:value autocomplete="off" />
    </label>
    <div class="actions">
      <PillButton onclick={onCancel}>Cancel</PillButton>
      <PillButton type="submit" disabled={!value.trim()}>Continue</PillButton>
    </div>
  </form>
</dialog>

<style>
  .prompt {
    position: fixed;
    inset: 0;
    width: min(22rem, calc(100vw - 2 * var(--surface-padding)));
    height: fit-content;
    margin: auto;
    padding: var(--surface-padding);
    border: 1px solid var(--surface-border);
    border-radius: var(--surface-radius);
    background: var(--surface-bg);
    color: var(--text-primary);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
  }

  .prompt::backdrop {
    background: rgb(0 0 0 / 72%);
  }

  h2 {
    margin: 0 0 0.35rem;
    font-size: 1rem;
  }

  .field {
    display: grid;
    gap: 0.4rem;
    color: var(--text-secondary);
    font-size: 0.8rem;
  }

  input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--surface-border);
    border-radius: var(--surface-radius-inner);
    background: var(--surface-bg-soft);
    color: var(--text-primary);
    font: inherit;
  }

  input:focus-visible {
    outline: none;
    border-color: rgb(255 255 255 / 45%);
    background: rgb(255 255 255 / 8%);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--control-gap);
    margin-top: 1rem;
  }
</style>
