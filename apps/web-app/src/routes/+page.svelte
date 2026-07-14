<!--
  Main camera page.
  This route is mostly UI wiring.
  Camera orchestration lives in $lib/camera/controller.svelte.ts.
-->

<script lang="ts">
  import '$lib/styles/camera-page.css';
  import { onDestroy, onMount } from 'svelte';

  import { CameraController } from '$lib/camera/controller.svelte.ts';

  import cameraOff from '$lib/images/camera-off.svg';
  import cameraOn from '$lib/images/camera-on.svg';
  import micOn from '$lib/images/mic-on.svg';
  import micOff from '$lib/images/mic-off.svg';
  import starsIcon from '$lib/images/stars.svg';
  import closeIcon from '$lib/images/x-close.svg';
  import backgroundIcon from '$lib/images/background.svg';
  import modelIcon from '$lib/images/model.svg';
  import eyeOpenIcon from '$lib/images/eye-open.svg';
  import eyeClosedIcon from '$lib/images/eye-close.svg';
  import loadingIcon from '$lib/images/loading.svg';

  import EffectsMenu from '$lib/components/EffectsMenu.svelte';
  import MediaControls from '$lib/components/MediaControls.svelte';
  import PillButton from '$lib/components/PillButton.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import Actions from '$lib/components/Actions.svelte';
  import CameraStage from '$lib/components/CameraStage.svelte';
  import RoomPrompt from '$lib/components/RoomPrompt.svelte';
  import ToggleIcon from '$lib/components/ToggleIcon.svelte';

  // --- DOM refs ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let previewContainerEl = $state<HTMLDivElement | null>(null);
  const camera = new CameraController({
    getVideoElement: () => videoEl,
    getPreviewContainer: () => previewContainerEl
  });

  const media = camera.media;
  const room = camera.room;
  const effects = camera.effects;
  const banner = camera.banner;

  // ------------------------------------------------------------------
  // Reactive glue
  // ------------------------------------------------------------------

  $effect(() => {
    camera.syncEffectsReactivity();
  });

  $effect(() => {
    camera.syncParticipantTilesReactivity();
  });

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  onMount(async () => {
    await camera.mount();
  });

  onDestroy(() => {
    camera.dispose();
  });
</script>

<svelte:head>
  <title>Camera</title>
</svelte:head>

<div class="camera-view" class:in-room={room.connectionState === 'connected'}>
  {#if camera.roomPrompt}
    <RoomPrompt
      title={camera.roomPrompt.kind === 'room' ? 'Choose a room' : 'Choose your name'}
      label={camera.roomPrompt.kind === 'room' ? 'Room name' : 'Display name'}
      initialValue={camera.roomPrompt.initialValue}
      onSubmit={(value) => camera.completeRoomPrompt(value)}
      onCancel={() => camera.completeRoomPrompt(null)}
    />
  {/if}

  <CameraStage
    bind:videoEl
    bind:previewContainerEl
    roomName={room.activeRoomName}
    connectionState={room.connectionState}
    participants={room.participantTiles}
    cameraState={media.cameraState}
    cameraEnabled={media.cameraEnabled}
  />

  {#if room.connectionState === 'connecting'}
    <div class="connection-status" role="status" aria-live="polite">
      <img class="connection-spinner" src={loadingIcon} alt="Loading indicator" />
      {room.connectionStatus || 'Connecting…'}
    </div>
  {/if}

  <Actions
    connectionState={room.connectionState}
    onCreate={() => room.create()}
    onJoin={() => room.join()}
    selectedQuality={media.selectedQuality}
    selectedVideoDeviceId={media.selectedVideoDeviceId}
    selectedAudioDeviceId={media.selectedAudioDeviceId}
    videoDeviceOptions={media.availableVideoDevices}
    audioDeviceOptions={media.availableAudioDevices}
    isApplyingQuality={media.isApplyingQuality}
    cameraState={media.cameraState}
    microphoneState={media.microphoneState}
    model={effects.state.model}
    showLandmarksDebug={effects.state.showLandmarksDebug}
    onQualityChange={(q) => media.setQuality(q)}
    onVideoDeviceChange={(id) => media.setVideoDevice(id)}
    onAudioDeviceChange={(id) => media.setAudioDevice(id)}
    onUploadModel={(file) => effects.handleUploadModel(file)}
    onToggleModelEnabled={() => effects.toggleModelEnabled()}
    onModelScaleChange={(value) => effects.setModelScale(value)}
    onModelOffsetXChange={(value) => effects.setModelOffsetX(value)}
    onModelOffsetYChange={(value) => effects.setModelOffsetY(value)}
    onModelRotationYChange={(value) => effects.setModelRotationY(value)}
    onResetModelTransform={() => effects.resetModelTransform()}
    onClearModel={() => void effects.handleUploadModel(null)}
    onToggleLandmarksDebug={() => effects.toggleLandmarksDebug()}
  />

  <div class="banners">
    {#if camera.hasErrorBanner}
      <Banner message={banner.error || media.errorMessage} tone="error" />
    {/if}

    {#if banner.info}
      <Banner message={banner.info} />
    {/if}
  </div>

  <MediaControls>
    {#if room.connectionState === 'connected'}
      <div class="leave-control">
        <PillButton tone="danger" onclick={() => room.leave({ restartMedia: true })}>
          Leave
        </PillButton>
      </div>
    {/if}

    <div class="media-toggle-group">
      <!-- Effects toggle + its popover, anchored to the toggle -->
      <div class="effects-anchor">
        <EffectsMenu
          open={effects.showPanel}
          {backgroundIcon}
          {modelIcon}
          webcamHidden={effects.state.webcamVisibility === 'hidden'}
          {eyeOpenIcon}
          {eyeClosedIcon}
          onToggleWebcamVisibility={() => effects.toggleWebcamVisibility()}
          backgroundKind={effects.state.background.kind}
          onUploadBackground={(file) => effects.handleUploadBackground(file)}
          onResetBackground={() => effects.clearBackground()}
          demoModelActive={effects.state.model.source === 'demo'}
          onToggleDemoModel={() => effects.toggleDemoModel()}
        />

        <PillButton
          iconOnly
          ariaLabel={effects.showPanel ? 'Close effects panel' : 'Open effects'}
          ariaPressed={effects.showPanel}
          onclick={() => effects.togglePanel()}
        >
          <ToggleIcon active={effects.showPanel} activeSrc={closeIcon} inactiveSrc={starsIcon} />
        </PillButton>
      </div>

      <!-- Camera toggle -->
      <PillButton
        iconOnly
        disabled={media.cameraState === 'loading'}
        ariaLabel={media.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
        ariaPressed={media.cameraEnabled}
        onclick={() => media.toggleCamera()}
      >
        <ToggleIcon active={media.cameraEnabled} activeSrc={cameraOn} inactiveSrc={cameraOff} />
      </PillButton>

      <!-- Microphone toggle -->
      <PillButton
        iconOnly
        disabled={media.microphoneState === 'loading'}
        ariaLabel={media.microphoneEnabled ? 'Turn microphone off' : 'Turn microphone on'}
        ariaPressed={media.microphoneEnabled}
        onclick={() => media.toggleMicrophone()}
      >
        <ToggleIcon active={media.microphoneEnabled} activeSrc={micOn} inactiveSrc={micOff} />
      </PillButton>
    </div>
  </MediaControls>
</div>

<style>
  .effects-anchor {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .banners {
    position: absolute;
    top: 1rem;
    left: 50%;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: max-content;
    max-width: min(90vw, 480px);
    align-items: center;
    pointer-events: none;
    transform: translateX(-50%);
  }

  .banners > :global(*) {
    pointer-events: auto;
  }

  .connection-status {
    position: absolute;
    z-index: 30;
    top: 50%;
    left: 50%;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 1rem;
    border: 1px solid var(--surface-border);
    border-radius: var(--control-radius);
    background: var(--surface-bg);
    color: var(--text-primary);
    font-size: 0.9rem;
    transform: translate(-50%, -50%);
    backdrop-filter: var(--surface-blur);
    -webkit-backdrop-filter: var(--surface-blur);
  }

  .connection-spinner {
    width: 1rem;
    height: 1rem;
    color: var(--text-primary);
    flex: 0 0 auto;
    filter: invert(1);
  }

  @media (max-width: 640px) {
    .banners {
      top: calc(var(--control-corner-offset) + var(--control-size) + 0.75rem);
    }
  }
</style>
