<script lang="ts">
  import type { ModelState } from '$lib/camera/effects';

  type Props = {
    model: ModelState;
    showLandmarksDebug: boolean;
    onUploadModel: (file: File) => void | Promise<void>;
    onToggleModelEnabled: () => void;
    onModelScaleChange: (value: number) => void;
    onModelOffsetXChange: (value: number) => void;
    onModelOffsetYChange: (value: number) => void;
    onModelRotationYChange: (value: number) => void;
    onResetModelTransform: () => void;
    onClearModel: () => void;
    onToggleLandmarksDebug: () => void;
  };

  let {
    model,
    showLandmarksDebug,
    onUploadModel,
    onToggleModelEnabled,
    onModelScaleChange,
    onModelOffsetXChange,
    onModelOffsetYChange,
    onModelRotationYChange,
    onResetModelTransform,
    onClearModel,
    onToggleLandmarksDebug
  }: Props = $props();

  let fileInput = $state<HTMLInputElement | null>(null);
  const hasModel = $derived(model.source !== 'none');

  function uploadCustomModel(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadModel(file);
    input.value = '';
  }
</script>

<section class="model-settings" aria-label="3D model settings">
  <label class="setting-row">
    <span>
      <strong>Show landmarks</strong>
      <small>Face tracking debug overlay</small>
    </span>
    <input type="checkbox" checked={showLandmarksDebug} onchange={onToggleLandmarksDebug} />
  </label>

  <div class="model-heading">
    <strong>3D Model</strong>
    <button type="button" onclick={() => fileInput?.click()}>
      {hasModel ? 'Replace with custom' : 'Upload model (.glb)'}
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept=".glb,model/gltf-binary"
      hidden
      onchange={uploadCustomModel}
    />
  </div>

  {#if hasModel}
    <div class="model-name" title={model.name}>{model.name}</div>

    <label class="setting-row">
      <span>Show model</span>
      <input type="checkbox" checked={model.enabled} onchange={onToggleModelEnabled} />
    </label>

    <label class="slider-row">
      <span>Scale</span>
      <input
        type="range"
        min="0.1"
        max="5"
        step="0.05"
        value={model.scale}
        oninput={(event) => onModelScaleChange(+event.currentTarget.value)}
      />
      <output>{model.scale.toFixed(2)}</output>
    </label>
    <label class="slider-row">
      <span>Offset X</span>
      <input
        type="range"
        min="-1"
        max="1"
        step="0.01"
        value={model.offsetX}
        oninput={(event) => onModelOffsetXChange(+event.currentTarget.value)}
      />
      <output>{model.offsetX.toFixed(2)}</output>
    </label>
    <label class="slider-row">
      <span>Offset Y</span>
      <input
        type="range"
        min="-1"
        max="1"
        step="0.01"
        value={model.offsetY}
        oninput={(event) => onModelOffsetYChange(+event.currentTarget.value)}
      />
      <output>{model.offsetY.toFixed(2)}</output>
    </label>
    <label class="slider-row">
      <span>Yaw</span>
      <input
        type="range"
        min="-180"
        max="180"
        step="1"
        value={model.rotationY}
        oninput={(event) => onModelRotationYChange(+event.currentTarget.value)}
      />
      <output>{model.rotationY.toFixed(0)}deg</output>
    </label>

    <div class="actions">
      <button type="button" onclick={onResetModelTransform}>Reset</button>
      <button type="button" class="danger" onclick={onClearModel}>Remove</button>
    </div>
  {/if}
</section>

<style>
  .model-settings {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--surface-border);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .setting-row,
  .model-heading,
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .setting-row > span {
    display: grid;
    gap: 0.15rem;
  }

  small,
  .model-name,
  output {
    color: var(--text-secondary);
    font-size: 0.78rem;
  }

  button {
    padding: 0.4rem 0.65rem;
    border: 1px solid var(--surface-border);
    border-radius: var(--surface-radius-inner);
    background: var(--surface-bg-soft);
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
  }

  .model-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 4.5rem minmax(0, 1fr) 2.5rem;
    align-items: center;
    gap: 0.5rem;
  }

  .slider-row input {
    min-width: 0;
    width: 100%;
  }

  output {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .danger {
    color: rgb(255 120 120);
  }
</style>
