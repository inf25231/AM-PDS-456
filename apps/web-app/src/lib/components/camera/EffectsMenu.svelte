<!--
    EffectsMenu.svelte

    Quick-actions row + category icons.

    Background has no submenu: the button IS the action — click opens the
    file picker when no image is set, or clears it when one is active.

    Model still opens a submenu (see ModelMenu.svelte).

    Layout (column-reverse — items written first land at the bottom near
    the trigger):
      - [Background] direct upload/clear toggle
      - [Model] category (submenu)
      - [Hide preview] quick toggle (top)
-->
<script lang="ts">
  import PillButton from './PillButton.svelte';
  import ToggleIcon from './ToggleIcon.svelte';
  import { scale } from 'svelte/transition';
  import type { BackgroundKind } from '$lib/camera/effects';
  import ModelMenu from './ModelMenu.svelte';

  type EffectsCategory = 'model';

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

    // Model
    modelEnabled: boolean;
    modelName: string;
    modelScale: number;
    modelOffsetX: number;
    modelOffsetY: number;
    modelRotationY: number;
    showLandmarksDebug: boolean;
    onUploadModel: (file: File) => void | Promise<void>;
    onToggleModelEnabled: () => void;
    onModelScaleChange: (value: number) => void;
    onModelOffsetXChange: (value: number) => void;
    onModelOffsetYChange: (value: number) => void;
    onModelRotationYChange: (value: number) => void;
    onResetModelTransform: () => void;
    onClearModel: () => void;

    // Cutouts
    cutoutsEnabled: boolean;
    onToggleCutouts: () => void;
    onToggleLandmarksDebug: () => void;
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

    modelEnabled,
    modelName,
    modelScale,
    modelOffsetX,
    modelOffsetY,
    modelRotationY,
    showLandmarksDebug,
    onUploadModel,
    onToggleModelEnabled,
    onModelScaleChange,
    onModelOffsetXChange,
    onModelOffsetYChange,
    onModelRotationYChange,
    onResetModelTransform,
    onClearModel,
    cutoutsEnabled,
    onToggleCutouts,
    onToggleLandmarksDebug
  }: Props = $props();

  let activeCategory = $state<EffectsCategory | null>(null);

  $effect(() => {
    if (!open) activeCategory = null;
  });

  function toggleCategory(category: EffectsCategory) {
    activeCategory = activeCategory === category ? null : category;
  }

  const items = $derived([{ key: 'model' as const, icon: modelIcon, label: 'Model' }]);

  // --- Background: no submenu, the button itself is the action ---
  let backgroundFileInput = $state<HTMLInputElement | null>(null);

  function handleBackgroundClick() {
    if (backgroundKind === 'image') {
      onResetBackground();
    } else {
      backgroundFileInput?.click();
    }
  }

  function handleBackgroundFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadBackground(file);
    // Reset so picking the same file again still fires change.
    input.value = '';
  }
</script>

{#if open}
  <div
    class="effects-menu"
    role="group"
    aria-label="Effects categories"
    transition:scale={{ duration: 220, start: 0.94 }}
  >
    <!-- Submenu — only rendered when the Model category is active -->
    {#if activeCategory === 'model'}
      <ModelMenu
        open={true}
        {modelEnabled}
        {modelName}
        scale={modelScale}
        offsetX={modelOffsetX}
        offsetY={modelOffsetY}
        rotationY={modelRotationY}
        {showLandmarksDebug}
        {onUploadModel}
        {onToggleModelEnabled}
        onScaleChange={onModelScaleChange}
        onOffsetXChange={onModelOffsetXChange}
        onOffsetYChange={onModelOffsetYChange}
        onRotationYChange={onModelRotationYChange}
        onResetTransform={onResetModelTransform}
        {onClearModel}
        {cutoutsEnabled}
        {onToggleCutouts}
        {onToggleLandmarksDebug}
      />
    {/if}

    <!--
            Background — direct action button, no submenu: click uploads
            an image when none is set, or clears the current one.
        -->
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

    <!-- Category buttons (Model — still opens a submenu) -->
    {#each items as item (item.key)}
      <PillButton
        iconOnly
        ariaLabel={item.label}
        ariaPressed={activeCategory === item.key}
        onclick={() => toggleCategory(item.key)}
      >
        <img class="control-icon" src={item.icon} alt="" />
      </PillButton>
    {/each}

    <!--
            Hide-preview quick toggle — top of the column (written last
            because of column-reverse).
        -->
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
    transform: translateX(-50%);
    transform-origin: bottom center;

    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: var(--control-gap);

    z-index: 25;
  }
</style>
