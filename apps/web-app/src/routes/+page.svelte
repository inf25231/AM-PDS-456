<!--
  Main camera page.
  This file wires controllers to UI:
  media -> room -> effects -> publish.
  Business logic stays inside controllers; this route coordinates lifecycle
  and binds controller state/actions to Svelte components.
-->

<script lang="ts">
  import '$lib/styles/camera-page.css';
  import { onDestroy, onMount } from 'svelte';

  import { MediaController } from '$lib/camera/media';
  import { RoomController } from '$lib/camera/room';
  import { PublishController } from '$lib/camera/publish';
  import { EffectsController } from '$lib/camera/effects';
  import { BannerStore } from '$lib/camera/shared/banner-store.svelte';

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
  let roomPrompt = $state<{ kind: 'room' | 'user'; initialValue: string } | null>(null);
  let resolveRoomPrompt: ((value: string | null) => void) | null = null;

  // --- Stores / helpers ---
  const banner = new BannerStore();
  const showInfo = (message: string) => banner.showInfo(message);
  const showError = (message: string) => banner.showError(message);

  function shouldRestartComposition(reason: string): boolean {
    return reason === 'camera-started' || reason === 'video-device-changed';
  }

  function shouldSyncTracking(reason: string): boolean {
    return (
      reason === 'camera-started' ||
      reason === 'camera-stopped' ||
      reason === 'camera-toggled' ||
      reason === 'video-device-changed' ||
      reason === 'quality-changed'
    );
  }

  // RoomController awaits these values, while the Svelte prompt remains
  // non-blocking so the mobile camera render loop keeps running.
  function requestRoomPrompt(kind: 'room' | 'user', previous: string): Promise<string | null> {
    return new Promise((resolve) => {
      resolveRoomPrompt = resolve;
      roomPrompt = {
        kind,
        initialValue: previous || (kind === 'room' ? 'amphi-room' : 'guest')
      };
    });
  }

  function completeRoomPrompt(value: string | null): void {
    const resolve = resolveRoomPrompt;
    resolveRoomPrompt = null;
    roomPrompt = null;
    resolve?.(value);
  }

  // Controllers (order matters: media -> room -> effects -> publish).
  let publish: PublishController | undefined;

  const media = new MediaController({
    getVideoElement: () => videoEl,
    onError: showError,
    onMediaChanged: (reason) => {
      publish?.onMediaChanged(reason);

      if (shouldRestartComposition(reason) && room.isConnected) {
        effects?.restartCompositionIfNeeded();
      }

      if (shouldSyncTracking(reason)) {
        effects?.syncTracking();
      }
    }
  });

  const room = new RoomController({
    media,
    promptRoomName: (previous) => requestRoomPrompt('room', previous),
    promptUserName: (previous) => requestRoomPrompt('user', previous),
    onInfo: showInfo,
    onError: showError,
    onRoomChanged: (reason) => {
      publish?.onRoomChanged(reason);

      if (reason === 'connected') {
        effects?.startCompositionSession();
      }

      if (reason === 'disconnected') {
        effects?.stopCompositionSession();
      }
    }
  });

  const effects = new EffectsController({
    getCameraEnabled: () => media.cameraEnabled,
    getCameraState: () => media.cameraState,
    getIsRoomConnected: () => room.isConnected,
    onInfo: showInfo,
    onError: showError,
    onCompositionReady: () => {
      // Track exists — if we're already in a room, publish it.
      publish?.queueSync();
    }
  });

  publish = new PublishController({
    media,
    room,
    getCompositionTrack: () => effects.compositionTrack,
    onError: showError
  });

  const hasErrorBanner = $derived(
    media.cameraState === 'error' || media.microphoneState === 'error' || Boolean(banner.error)
  );

  // ------------------------------------------------------------------
  // Reactive glue
  // ------------------------------------------------------------------

  /**
   * Effects pipeline driver. Re-runs whenever any input the effects layer
   * cares about changes. The controller's syncAll() is cheap when nothing
   * meaningful has changed.
   */
  $effect(() => {
    media.cameraStream;
    media.cameraEnabled;
    media.cameraState;

    // New effects state — re-sync when any of these change
    effects.state.webcamVisibility;
    effects.state.showLandmarksDebug;
    effects.state.background.kind;
    effects.state.background.imageUrl;
    effects.state.model.enabled;
    effects.state.model.url;
    effects.state.model.scale;
    effects.state.model.offsetX;
    effects.state.model.offsetY;
    effects.state.model.rotationY;

    room.connectionState;

    effects.syncAll();
  });

  $effect(() => {
    if (room.isConnected) {
      room.rebuildParticipantTiles();
    }
  });

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  onMount(async () => {
    media.init();
    effects.init();
    await media.startAll();

    const video = videoEl;
    const previewContainer = previewContainerEl;
    if (!video || !previewContainer) {
      showError('Camera stage is not ready. Please refresh the page.');
      return;
    }

    effects.attachElements({
      video,
      previewContainer
    });
    effects.syncAll();

    // Dev-only debug handle. Never expose controllers on window in production.
    if (import.meta.env.DEV) {
      (window as any).debug = { effects, room, media, publish };
    }
  });

  onDestroy(() => {
    // Reverse construction order: tear down consumers before producers.
    publish?.dispose();
    effects.dispose();
    room.dispose();
    media.dispose();
    banner.dispose();
  });
</script>

<svelte:head>
  <title>Camera</title>
</svelte:head>

<div class="camera-view" class:in-room={room.connectionState === 'connected'}>
  {#if roomPrompt}
    <RoomPrompt
      title={roomPrompt.kind === 'room' ? 'Choose a room' : 'Choose your name'}
      label={roomPrompt.kind === 'room' ? 'Room name' : 'Display name'}
      initialValue={roomPrompt.initialValue}
      onSubmit={(value) => completeRoomPrompt(value)}
      onCancel={() => completeRoomPrompt(null)}
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
    {#if hasErrorBanner}
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
