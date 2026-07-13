<!--
RoomParticipantsGrid.svelte

Borderless full-bleed grid of participants.

The LOCAL tile renders the main camera stage (passed in as a snippet):
the live <video> + effect canvas overlays. This is the exact same visual
  the user saw before joining, so they see themselves with effects with
  zero extra plumbing. Remote peers see the equivalent picture via the
  composition track (captured from an offscreen canvas).

  Remote tiles render each participant's subscribed MediaStream.

  Layout (cols = ceil(sqrt(N)), rows = ceil(N/cols), mobile transposes).
  -->
<script lang="ts">
  import cameraOffIcon from '$lib/images/camera-off.svg';
  import micOffIcon from '$lib/images/mic-off.svg';
  import signal1 from '$lib/images/signal-1.svg';
  import signal2 from '$lib/images/signal-2.svg';
  import signal3 from '$lib/images/signal-3.svg';
  import signal4 from '$lib/images/signal-4.svg';
  import signalUnknown from '$lib/images/signal-unknown.svg';

  type RoomConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

  type ParticipantTileData = {
    id: string;
    name: string;
    isLocal: boolean;
    isSpeaking: boolean;
    connectionQuality: string;
    cameraOn: boolean;
    microphoneOn: boolean;
    stream: MediaStream | null;
  };

  type Props = {
    roomName: string | null;
    connectionState: RoomConnectionState;
    participants: ParticipantTileData[];
  };

  let { roomName, connectionState, participants }: Props = $props();

  // ----------------------------------------------------------------
  // Grid sizing
  // ----------------------------------------------------------------

  const tileCount = $derived(Math.max(1, participants.length));
  const desktopCols = $derived(Math.ceil(Math.sqrt(tileCount)));
  const desktopRows = $derived(Math.ceil(tileCount / desktopCols));
  const mobileCols = $derived(desktopRows);
  const mobileRows = $derived(desktopCols);

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------

  function signalIconFor(quality: string): string {
    switch (quality) {
      case 'excellent':
        return signal4;
      case 'good':
        return signal3;
      case 'poor':
        return signal2;
      case 'lost':
        return signal1;
      default:
        return signalUnknown;
    }
  }

  /** Attach a MediaStream to a media element reactively. */
  function bindMediaStream(node: HTMLMediaElement, stream: MediaStream | null) {
    const apply = (next: MediaStream | null) => {
      if (node.srcObject === next) return;
      node.srcObject = next;
      if (next) {
        void node.play().catch(() => {
          // Autoplay restrictions are expected.
        });
      }
    };
    apply(stream);
    return {
      update(next: MediaStream | null) {
        apply(next);
      },
      destroy() {
        node.pause();
        node.srcObject = null;
      }
    };
  }
</script>

{#if roomName}
  <!-- Top-left info overlay -->
  <div class="room-info" aria-live="polite">
    <div class="room-name">Room: {roomName}</div>
    <div class="room-subtitle">
      {#if connectionState === 'connected'}
        {participants.length} participant{participants.length === 1 ? '' : 's'}
      {:else if connectionState === 'connecting'}
        Connecting…
      {:else if connectionState === 'error'}
        Connection error
      {:else}
        Disconnected
      {/if}
    </div>
  </div>

  <div
    class="grid"
    style={`
                --cols: ${desktopCols};
                --rows: ${desktopRows};
                --mobile-cols: ${mobileCols};
                --mobile-rows: ${mobileRows};
            `}
  >
    {#each participants as p (p.id)}
      <article class="tile" class:speaking={p.isSpeaking}>
        {#if p.isLocal}
          <!-- Empty cell. The camera stage (in CameraStage.svelte) is
                 positioned over this first cell via CSS. -->
        {:else if p.stream && p.cameraOn}
          <video class="tile-video" autoplay playsinline use:bindMediaStream={p.stream}></video>
        {:else}
          <div class="tile-placeholder" aria-label="Camera is off">
            <img src={cameraOffIcon} alt="" />
          </div>
        {/if}

        {#if !p.isLocal && p.stream && p.microphoneOn && !p.cameraOn}
          <audio class="tile-audio" autoplay use:bindMediaStream={p.stream}></audio>
        {/if}

        <footer class="tile-overlay">
          <span class="tile-name" class:speaking-name={p.isSpeaking}>
            {p.name}{p.isLocal ? ' (you)' : ''}
          </span>
          <span class="tile-icons" aria-label="Participant status">
            {#if !p.microphoneOn}
              <img src={micOffIcon} alt="Microphone off" class="status-icon" />
            {/if}
            <img
              src={signalIconFor(p.connectionQuality)}
              alt={`Signal: ${p.connectionQuality}`}
              class="signal-icon"
            />
          </span>
        </footer>
      </article>
    {/each}
  </div>
{/if}

<style>
  .room-info {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 14;
    color: rgba(255, 255, 255, 0.95);
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
  }

  .room-name {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .room-subtitle {
    font-size: 0.76rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .grid {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    grid-template-rows: repeat(var(--rows), minmax(0, 1fr));
    gap: 0;
    background: #000;
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: repeat(var(--mobile-cols), minmax(0, 1fr));
      grid-template-rows: repeat(var(--mobile-rows), minmax(0, 1fr));
    }
  }

  .tile {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #000;
    margin: 0;
    padding: 0;
    outline: 2px solid transparent;
    outline-offset: -2px;
    transition: outline-color 160ms ease;
  }

  .tile.speaking {
    outline-color: rgba(88, 234, 149, 0.95);
  }

  .tile-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .tile-placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: #000;
  }

  .tile-placeholder img {
    width: 48px;
    height: 48px;
    opacity: 0.7;
    filter: invert(1);
  }

  .tile-audio {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .tile-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.78rem;
    pointer-events: none;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }

  .tile-name {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: color 160ms ease;
  }

  .tile-name.speaking-name {
    color: rgba(120, 240, 170, 1);
  }

  .tile-icons {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex: 0 0 auto;
  }

  .status-icon,
  .signal-icon {
    width: 16px;
    height: 16px;
    filter: invert(1);
    opacity: 0.9;
  }
</style>
