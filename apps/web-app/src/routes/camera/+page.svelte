<!--
    Camera route.

    This file is the orchestration layer for the full camera page. It wires
    together four controllers and renders the visual stage. The controllers
    do the work:

      - MediaController:   camera + microphone streams, devices, quality.
      - RoomController:    LiveKit room lifecycle and participant tiles.
      - EffectsController: face tracking, overlay rendering, 3D mask,
                           uploads, and the composition pipeline.
      - PublishController: track publishing — bridges MediaController +
                           EffectsController.composition to the room.

    The heavy browser helpers live in src/lib/camera/*. This file decides
    when the controllers run and how their state affects the UI.
-->

<script lang="ts">
  import '$lib/styles/camera-page.css';
  import { onDestroy, onMount } from 'svelte';

  import { MediaController } from '$lib/camera/controllers/media.svelte';
  import { RoomController } from '$lib/camera/controllers/room.svelte';
  import { PublishController } from '$lib/camera/controllers/publish.svelte';
  import { EffectsController } from '$lib/camera/controllers/effects.svelte';
  import { BannerStore } from '$lib/camera/banner.svelte';

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

  import EffectsMenu from '$lib/components/camera/EffectsMenu.svelte';
  import MediaControls from '$lib/components/camera/MediaControls.svelte';
  import PillButton from '$lib/components/camera/PillButton.svelte';
  import Banner from '$lib/components/camera/Banner.svelte';
  import Actions from '$lib/components/camera/Actions.svelte';
  import CameraStage from '$lib/components/camera/CameraStage.svelte';
  import RoomPrompt from '$lib/components/camera/RoomPrompt.svelte';
  import ToggleIcon from '$lib/components/camera/ToggleIcon.svelte';

  // --- DOM refs ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let previewContainerEl = $state<HTMLDivElement | null>(null);
  let roomPrompt = $state<{ kind: 'room' | 'user'; initialValue: string } | null>(null);
  let resolveRoomPrompt: ((value: string | null) => void) | null = null;

  // --- Stores / inline helpers ---
  const banner = new BannerStore();

  // RoomController awaits these values, while the Svelte prompt remains
  // non-blocking so the mobile camera render loop keeps running.
  function requestRoomPrompt(
    kind: 'room' | 'user',
    previous: string
  ): Promise<string | null> {
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

  // ------------------------------------------------------------------
  // Controllers
  // ------------------------------------------------------------------
  //
  // Construction order matters because of cross-references:
  //
  //   media  → no deps
  //   room   → media
  //   effects → media, room (also owns composition)
  //   publish → media, room, effects.composition
  //
  // The onMediaChanged / onRoomChanged callbacks reach back into `publish`
  // and `effects` which are declared after — `publish` and `effects` are
  // captured by closure and are non-null by the time any callback fires.

  // ------------------------------------------------------------------
  let publish: PublishController | undefined;

  const media = new MediaController({
    getVideoElement: () => videoEl,
    onError: (message) => {
      banner.showError(message);
    },
    onMediaChanged: (reason) => {
      publish?.onMediaChanged(reason);

      if ((reason === 'camera-started' || reason === 'video-device-changed') && room?.isConnected) {
        effects?.restartCompositionIfNeeded();
      }

      if (
        reason === 'camera-started' ||
        reason === 'camera-stopped' ||
        reason === 'camera-toggled' ||
        reason === 'video-device-changed' ||
        reason === 'quality-changed'
      ) {
        effects?.syncTracking();
      }
    }
  });

  const room = new RoomController({
    media,
    promptRoomName: (previous) => requestRoomPrompt('room', previous),
    promptUserName: (previous) => requestRoomPrompt('user', previous),
    onInfo: (message) => {
      banner.showInfo(message);
    },
    onError: (message) => {
      banner.showError(message);
    },
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
    media,
    room,
    onInfo: (message) => {
      banner.showInfo(message);
    },
    onError: (message) => {
      banner.showError(message);
    },
    onCompositionReady: () => {
      // Track exists — if we're already in a room, publish it.
      publish?.queueSync();
    }
  });

  publish = new PublishController({
    media,
    room,
    getCompositionTrack: () => effects.compositionTrack,
    onError: (message) => {
      banner.showError(message);
    }
  });

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
    effects.state.cutouts.enabled;

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
    await media.startAll();

    if (!videoEl || !previewContainerEl) {
      banner.showError('Camera stage is not ready yet. Please refresh the page.');
      return;
    }

    effects.init();
    effects.attachElements({
      video: videoEl,
      previewContainer: previewContainerEl
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

<div class:camera-view={true} class:in-room={room.connectionState === 'connected'}>
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
      <span class="connection-spinner" aria-hidden="true"></span>
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
    onQualityChange={(q) => media.setQuality(q)}
    onVideoDeviceChange={(id) => media.setVideoDevice(id)}
    onAudioDeviceChange={(id) => media.setAudioDevice(id)}
  />

  <div class="banners">
    {#if media.cameraState === 'error' || media.microphoneState === 'error' || banner.error}
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
          modelEnabled={effects.state.model.enabled}
          modelName={effects.state.model.name}
          modelScale={effects.state.model.scale}
          modelOffsetX={effects.state.model.offsetX}
          modelOffsetY={effects.state.model.offsetY}
          modelRotationY={effects.state.model.rotationY}
          showLandmarksDebug={effects.state.showLandmarksDebug}
          onUploadModel={(file) => effects.handleUploadModel(file)}
          onToggleModelEnabled={() => effects.toggleModelEnabled()}
          onModelScaleChange={(v) => effects.setModelScale(v)}
          onModelOffsetXChange={(v) => effects.setModelOffsetX(v)}
          onModelOffsetYChange={(v) => effects.setModelOffsetY(v)}
          onModelRotationYChange={(v) => effects.setModelRotationY(v)}
          onResetModelTransform={() => effects.resetModelTransform()}
          onClearModel={() => {
            effects.setModelEnabled(false);
            void effects.handleUploadModel(null);
          }}
          cutoutsEnabled={effects.state.cutouts.enabled}
          onToggleCutouts={() => effects.toggleCutoutsEnabled()}
          onToggleLandmarksDebug={() => effects.toggleLandmarksDebug()}
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
    width: 0.85rem;
    height: 0.85rem;
    border: 2px solid rgb(255 255 255 / 30%);
    border-top-color: var(--text-primary);
    border-radius: 50%;
    animation: spin 800ms linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
