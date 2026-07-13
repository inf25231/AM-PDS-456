<!--
    CameraSettingsMenu.svelte

    Controlled settings popover for the camera page. Renders form rows for:
      - Video quality
      - Camera device
      - Microphone device

    All state changes are forwarded to the parent via `on*Change` callbacks —
    no internal mutation, no $bindable. The MediaController is the single
    source of truth.
-->
<script lang="ts">
  import type { DeviceOption } from 'camera-core';
  import MediaPopover from '$lib/components/camera/MediaPopover.svelte';
  import settingsIcon from '$lib/images/settings.svg';
  import closeIcon from '$lib/images/x-close.svg';
  import type { CameraState, VideoQuality } from 'camera-core';
  import type { ModelState } from '$lib/camera/effects';

  type Props = {
    selectedQuality: VideoQuality;
    selectedVideoDeviceId: string;
    selectedAudioDeviceId: string;
    videoDeviceOptions?: DeviceOption[];
    audioDeviceOptions?: DeviceOption[];
    isApplyingQuality?: boolean;
    cameraState?: CameraState;
    microphoneState?: CameraState;
    model: ModelState;
    showLandmarksDebug: boolean;
    onQualityChange: (q: VideoQuality) => void | Promise<void>;
    onVideoDeviceChange: (id: string) => void | Promise<void>;
    onAudioDeviceChange: (id: string) => void | Promise<void>;
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
    selectedQuality,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    videoDeviceOptions = [],
    audioDeviceOptions = [],
    isApplyingQuality = false,
    cameraState = 'idle',
    microphoneState = 'idle',
    model,
    showLandmarksDebug,
    onQualityChange,
    onVideoDeviceChange,
    onAudioDeviceChange,
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

  const VIDEO_QUALITY_LABELS: Record<VideoQuality, string> = {
    '360p': '360p',
    '480p': '480p',
    '720p': '720p',
    '1080p': '1080p'
  };

  const hasVideoDeviceOptions = $derived(videoDeviceOptions.length > 0);
  const hasAudioDeviceOptions = $derived(audioDeviceOptions.length > 0);

  const isCameraBusy = $derived(isApplyingQuality || cameraState === 'loading');
  const isMicBusy = $derived(microphoneState === 'loading');
  const hasModel = $derived(model.source !== 'none');
  let modelFileInput = $state<HTMLInputElement | null>(null);

  function uploadCustomModel(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void onUploadModel(file);
    input.value = '';
  }
</script>

<MediaPopover openIcon={settingsIcon} {closeIcon}>
  <div class="settings-menu">
    <label class="settings-row">
      <span class="settings-copy">
        <span class="settings-title">Video Quality</span>
        <span class="settings-hint">Changes quality</span>
      </span>
      <span class="select-wrap">
        <select
          value={selectedQuality}
          onchange={(e) => onQualityChange(e.currentTarget.value as VideoQuality)}
          disabled={isCameraBusy}
        >
          {#each Object.entries(VIDEO_QUALITY_LABELS) as [quality, label] (quality)}
            <option value={quality}>{label}</option>
          {/each}
        </select>
      </span>
    </label>

    <label class="settings-row">
      <span class="settings-copy">
        <span class="settings-title">Camera Device</span>
        <span class="settings-hint">Specific camera source</span>
      </span>
      <span class="select-wrap">
        <select
          value={selectedVideoDeviceId}
          onchange={(e) => onVideoDeviceChange(e.currentTarget.value)}
          disabled={isCameraBusy}
        >
          <option value="">
            {hasVideoDeviceOptions ? 'Auto' : 'No cameras found'}
          </option>
          {#each videoDeviceOptions as device (device.value)}
            <option value={device.value}>{device.label}</option>
          {/each}
        </select>
      </span>
    </label>

    <label class="settings-row">
      <span class="settings-copy">
        <span class="settings-title">Microphone Device</span>
        <span class="settings-hint">Specific input source</span>
      </span>
      <span class="select-wrap">
        <select
          value={selectedAudioDeviceId}
          onchange={(e) => onAudioDeviceChange(e.currentTarget.value)}
          disabled={isMicBusy}
        >
          <option value="">
            {hasAudioDeviceOptions ? 'System default' : 'No microphones found'}
          </option>
          {#each audioDeviceOptions as device (device.value)}
            <option value={device.value}>{device.label}</option>
          {/each}
        </select>
      </span>
    </label>

    <label class="settings-row">
      <span class="settings-copy">
        <span class="settings-title">Show landmarks</span>
        <span class="settings-hint">Face tracking debug overlay</span>
      </span>
      <input type="checkbox" checked={showLandmarksDebug} onchange={onToggleLandmarksDebug} />
    </label>

    <section class="model-settings" aria-label="3D model settings">
      <div class="model-heading">
        <span class="settings-title">3D Model</span>
        <button type="button" onclick={() => modelFileInput?.click()}>
          {hasModel ? 'Replace with custom' : 'Upload model (.glb)'}
        </button>
        <input
          bind:this={modelFileInput}
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          onchange={uploadCustomModel}
        />
      </div>

      {#if hasModel}
        <div class="model-name" title={model.name}>{model.name}</div>

        <label class="model-row">
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

        <div class="model-actions">
          <button type="button" onclick={onResetModelTransform}>Reset</button>
          <button type="button" class="danger" onclick={onClearModel}>Remove</button>
        </div>
      {/if}
    </section>
  </div>
</MediaPopover>

<style>
  .settings-menu {
    display: grid;
    gap: 0;
    min-width: 300px;
  }

  .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
  }

  .settings-row + .settings-row {
    border-top: 1px solid var(--surface-border);
  }
  .settings-copy {
    display: grid;
    gap: 0.15rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .settings-title {
    color: var(--text-primary);
    font-size: 0.9rem;
    line-height: 1.2;
  }

  .settings-hint {
    color: var(--text-secondary);
    font-size: 0.78rem;
    line-height: 1.2;
  }

  .select-wrap {
    flex: 0 0 auto;
    width: 50%;
  }

  .select-wrap select {
    appearance: none;
    width: 100%;
    min-width: 0;
    padding: 0.45rem 0.65rem;
    background: var(--surface-bg-soft);
    border: 1px solid var(--surface-border);
    border-radius: var(--surface-radius-inner);
    color: var(--text-primary);
    font-size: 0.83rem;
    line-height: 1.2;
    cursor: pointer;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    transition:
      border-color 160ms ease,
      background 160ms ease;
  }

  .select-wrap select:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.28);
  }

  .select-wrap select:focus-visible {
    outline: none;
    border-color: rgba(255, 255, 255, 0.45);
    background: rgba(255, 255, 255, 0.08);
  }

  .select-wrap select:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .model-settings {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--surface-border);
    color: var(--text-primary);
    font-size: 0.85rem;
  }

  .model-heading,
  .model-row,
  .model-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .model-settings button {
    padding: 0.4rem 0.65rem;
    border: 1px solid var(--surface-border);
    border-radius: var(--surface-radius-inner);
    background: var(--surface-bg-soft);
    color: var(--text-primary);
    cursor: pointer;
    font: inherit;
  }

  .model-name,
  .model-settings output {
    color: var(--text-secondary);
    font-size: 0.78rem;
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

  .model-settings output {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .model-settings .danger {
    color: rgb(255 120 120);
  }

  @media (max-width: 560px) {
    .select-wrap {
      width: min(6.5rem, 30vw);
    }

    .settings-title {
      font-size: 0.85rem;
    }

    .settings-hint {
      font-size: 0.74rem;
    }
  }
</style>
