<!--
    Actions.svelte

    Top-right corner group: room actions (Create / Join) and the settings
    popover. Owns the corner positioning so children stay layout-agnostic.

    Visibility rules:
      - Create / Join are shown only when the user is not in a room
        (i.e. not connected and not connecting).
      - The settings popover is always available.

    Styling:
      - Sizing / spacing come from --control-* tokens defined on .camera-view
        in camera-page.css. No magic numbers here.
-->
<script lang="ts">
  import PillButton from './PillButton.svelte';
  import CameraSettingsMenu from './CameraSettingsMenu.svelte';
  import type { CameraState, DeviceOption, VideoQuality } from '$lib/camera/core';
  import type { ModelState } from '$lib/camera/effects';

  type Props = {
    // Room state
    connectionState: string;
    onCreate: () => void;
    onJoin: () => void;

    // Camera and effects settings forwarded to CameraSettingsMenu.
    selectedQuality: VideoQuality;
    selectedVideoDeviceId: string;
    selectedAudioDeviceId: string;
    videoDeviceOptions: DeviceOption[];
    audioDeviceOptions: DeviceOption[];
    isApplyingQuality: boolean;
    cameraState: CameraState;
    microphoneState: CameraState;
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
    connectionState,
    onCreate,
    onJoin,
    selectedQuality,
    selectedVideoDeviceId,
    selectedAudioDeviceId,
    videoDeviceOptions,
    audioDeviceOptions,
    isApplyingQuality,
    cameraState,
    microphoneState,
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

  const showRoomActions = $derived(
    connectionState !== 'connected' && connectionState !== 'connecting'
  );
</script>

<div class="actions" aria-label="Session actions">
  {#if showRoomActions}
    <PillButton onclick={onCreate}>Create</PillButton>
    <PillButton onclick={onJoin}>Join</PillButton>
  {/if}

  <CameraSettingsMenu
    {selectedQuality}
    {selectedVideoDeviceId}
    {selectedAudioDeviceId}
    {videoDeviceOptions}
    {audioDeviceOptions}
    {isApplyingQuality}
    {cameraState}
    {microphoneState}
    {model}
    {showLandmarksDebug}
    {onQualityChange}
    {onVideoDeviceChange}
    {onAudioDeviceChange}
    {onUploadModel}
    {onToggleModelEnabled}
    {onModelScaleChange}
    {onModelOffsetXChange}
    {onModelOffsetYChange}
    {onModelRotationYChange}
    {onResetModelTransform}
    {onClearModel}
    {onToggleLandmarksDebug}
  />
</div>

<style>
  .actions {
    position: absolute;
    top: var(--control-corner-offset);
    right: var(--control-corner-offset);
    display: flex;
    align-items: center;
    gap: var(--control-gap);
    z-index: 30;
  }
</style>
