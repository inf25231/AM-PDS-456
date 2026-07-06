<!--
    ModelMenu.svelte

    Submenu for the 3D model effect: upload a GLB/GLTF, toggle it on/off,
    tune scale and X/Y offset, and toggle the eye/mouth cutouts that reveal
    the real face through the model.
-->
<script lang="ts">
  type Props = {
    open: boolean;

    // Model state
    modelEnabled: boolean;
    modelName: string;
    scale: number;
    offsetX: number;
    offsetY: number;
    rotationY: number;
    showLandmarksDebug: boolean;

    // Model handlers
    onUploadModel: (file: File) => void | Promise<void>;
    onToggleModelEnabled: () => void;
    onScaleChange: (value: number) => void;
    onOffsetXChange: (value: number) => void;
    onOffsetYChange: (value: number) => void;
    onRotationYChange: (value: number) => void;
    onResetTransform: () => void;
    onClearModel: () => void;

    // Cutouts
    cutoutsEnabled: boolean;
    onToggleCutouts: () => void;
    onToggleLandmarksDebug: () => void;
  };

  let {
    open,
    modelEnabled,
    modelName,
    scale,
    offsetX,
    offsetY,
    rotationY,
    showLandmarksDebug,
    onUploadModel,
    onToggleModelEnabled,
    onScaleChange,
    onOffsetXChange,
    onOffsetYChange,
    onRotationYChange,
    onResetTransform,
    onClearModel,
    cutoutsEnabled,
    onToggleCutouts,
    onToggleLandmarksDebug
  }: Props = $props();

  let fileInput = $state<HTMLInputElement>();

  const hasModel = $derived(Boolean(modelName));

  function handleFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadModel(file);
    input.value = '';
  }
</script>

{#if open}
  <div class="model-menu" role="dialog" aria-label="Model settings">
    <!-- Upload -->
    <div class="row">
      <button class="upload-btn" onclick={() => fileInput?.click()}>
        {hasModel ? 'Replace model' : 'Upload model (.glb)'}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept=".glb,model/gltf-binary"
        onchange={handleFileChange}
        hidden
      />
    </div>

    <!-- Cutouts are independent from whether a 3D model is uploaded. -->
    <label class="toggle-row">
      <span>Eye/mouth cutouts</span>
      <input type="checkbox" checked={cutoutsEnabled} onchange={onToggleCutouts} />
    </label>

    <label class="toggle-row">
      <span>Show landmarks</span>
      <input type="checkbox" checked={showLandmarksDebug} onchange={onToggleLandmarksDebug} />
    </label>

    {#if hasModel}
      <div class="model-name" title={modelName}>{modelName}</div>

      <!-- Enabled toggle -->
      <label class="toggle-row">
        <span>Show model</span>
        <input type="checkbox" checked={modelEnabled} onchange={onToggleModelEnabled} />
      </label>

      <!-- Scale -->
      <label class="slider-row">
        <span>Scale</span>
        <input
          type="range"
          min="0.1"
          max="5"
          step="0.05"
          value={scale}
          oninput={(e) => onScaleChange(+e.currentTarget.value)}
        />
        <span class="value">{scale.toFixed(2)}</span>
      </label>

      <!-- Offset X -->
      <label class="slider-row">
        <span>Offset X</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={offsetX}
          oninput={(e) => onOffsetXChange(+e.currentTarget.value)}
        />
        <span class="value">{offsetX.toFixed(2)}</span>
      </label>

      <!-- Offset Y -->
      <label class="slider-row">
        <span>Offset Y</span>
        <input
          type="range"
          min="-1"
          max="1"
          step="0.01"
          value={offsetY}
          oninput={(e) => onOffsetYChange(+e.currentTarget.value)}
        />
        <span class="value">{offsetY.toFixed(2)}</span>
      </label>

      <label class="slider-row">
        <span>Yaw</span>
        <input
          type="range"
          min="-180"
          max="180"
          step="1"
          value={rotationY}
          oninput={(e) => onRotationYChange(+e.currentTarget.value)}
        />
        <span class="value">{rotationY.toFixed(0)}deg</span>
      </label>

      <!-- Actions -->
      <div class="actions">
        <button class="ghost" onclick={onResetTransform}>Reset</button>
        <button class="ghost danger" onclick={onClearModel}>Remove</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .model-menu {
    position: absolute;
    bottom: calc(100% + var(--control-gap));
    left: 50%;
    transform: translateX(-50%);

    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 260px;

    padding: var(--surface-padding);
    border-radius: var(--surface-radius);
    background: var(--surface-bg);
    border: 1px solid var(--surface-border);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
    color: var(--text-primary);
    font-size: 0.85rem;
    z-index: 26;
  }

  .row {
    display: flex;
  }

  .upload-btn {
    flex: 1;
    padding: 0.5rem 0.75rem;
    border-radius: var(--surface-radius-inner);
    background: var(--surface-bg-soft);
    border: 1px solid var(--surface-border);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.85rem;
  }
  .upload-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .model-name {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
  }

  .slider-row {
    display: grid;
    grid-template-columns: 4.5rem 1fr 2.5rem;
    align-items: center;
    gap: 0.5rem;
  }

  .slider-row input[type='range'] {
    width: 100%;
  }

  .value {
    text-align: right;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .ghost {
    flex: 1;
    padding: 0.4rem;
    border-radius: var(--surface-radius-inner);
    background: transparent;
    border: 1px solid var(--surface-border);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .ghost:hover {
    background: var(--surface-bg-soft);
  }
  .ghost.danger {
    color: rgba(255, 120, 120, 0.95);
  }
</style>
