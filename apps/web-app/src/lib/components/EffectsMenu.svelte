<!-- Quick effects: image background, the fixed demo raccoon, and preview visibility. -->
<script lang="ts">
  import { scale } from 'svelte/transition';
  import type { BackgroundKind } from '$lib/camera/effects';
  import PillButton from './PillButton.svelte';
  import ToggleIcon from './ToggleIcon.svelte';

  type Props = {
    open: boolean;
    backgroundIcon: string;
    modelIcon: string;
    webcamHidden: boolean;
    eyeOpenIcon: string;
    eyeClosedIcon: string;
    onToggleWebcamVisibility: () => void;
    backgroundKind: BackgroundKind;
    onUploadBackground: (file: File) => void | Promise<void>;
    onResetBackground: () => void;
    demoModelActive: boolean;
    onToggleDemoModel: () => void;
  };

  let {
    open,
    backgroundIcon,
    modelIcon,
    webcamHidden,
    eyeOpenIcon,
    eyeClosedIcon,
    onToggleWebcamVisibility,
    backgroundKind,
    onUploadBackground,
    onResetBackground,
    demoModelActive,
    onToggleDemoModel
  }: Props = $props();

  let backgroundFileInput = $state<HTMLInputElement | null>(null);

  function handleBackgroundClick(): void {
    if (backgroundKind === 'image') {
      onResetBackground();
    } else {
      backgroundFileInput?.click();
    }
  }

  function handleBackgroundFileChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadBackground(file);
    input.value = '';
  }
</script>

{#if open}
  <div
    class="effects-menu"
    role="group"
    aria-label="Quick effects"
    transition:scale={{ duration: 220, start: 0.94 }}
  >
    <input
      bind:this={backgroundFileInput}
      type="file"
      accept="image/*"
      class="hidden-file-input"
      onchange={handleBackgroundFileChange}
    />
    <PillButton
      iconOnly
      ariaLabel={backgroundKind === 'image' ? 'Remove background image' : 'Upload background image'}
      ariaPressed={backgroundKind === 'image'}
      onclick={handleBackgroundClick}
    >
      <img class="control-icon" src={backgroundIcon} alt="" />
    </PillButton>

    <PillButton
      iconOnly
      ariaLabel={demoModelActive ? 'Remove demo raccoon model' : 'Add demo raccoon model'}
      ariaPressed={demoModelActive}
      onclick={onToggleDemoModel}
    >
      <img class="control-icon" src={modelIcon} alt="" />
    </PillButton>

    <PillButton
      iconOnly
      ariaLabel={webcamHidden ? 'Show webcam preview' : 'Hide webcam preview'}
      ariaPressed={webcamHidden}
      onclick={onToggleWebcamVisibility}
    >
      <ToggleIcon active={webcamHidden} activeSrc={eyeClosedIcon} inactiveSrc={eyeOpenIcon} />
    </PillButton>
  </div>
{/if}

<style>
  .hidden-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .effects-menu {
    position: absolute;
    bottom: calc(100% + var(--control-gap));
    left: 50%;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--control-gap);
    z-index: 25;
    transform: translateX(-50%);
    transform-origin: bottom center;
  }

  .control-icon {
    display: block;
    width: 26px;
    height: 26px;
    filter: invert(1);
  }

  @media (min-width: 641px) {
    .control-icon {
      width: 30px;
      height: 30px;
    }
  }
</style>
