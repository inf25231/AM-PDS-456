<script lang="ts">
  type RoomConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

  type ParticipantTile = {
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
    roomAgeSec?: number | null;
    connectionState: RoomConnectionState;
    participants: ParticipantTile[];
  };

  let {
    roomName = null,
    roomAgeSec = null,
    connectionState = 'disconnected',
    participants = []
  }: Props = $props();

  let clockNowMs = $state(Date.now());
  let startedAtMs = $state<number | null>(null);

  $effect(() => {
    if (connectionState !== 'connected' || roomAgeSec == null) {
      startedAtMs = null;
      clockNowMs = Date.now();
      return;
    }

    startedAtMs = Date.now() - Math.max(0, roomAgeSec) * 1000;
    clockNowMs = Date.now();

    const timer = window.setInterval(() => {
      clockNowMs = Date.now();
    }, 1000);

    return () => window.clearInterval(timer);
  });

  function formatRoomDuration(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return hours > 0 ? `${hours}:${mmss}` : mmss;
  }

  const tileCount = $derived(Math.max(1, participants.length));
  const gridColumns = $derived(Math.ceil(Math.sqrt(tileCount)));
  const gridRows = $derived(Math.ceil(tileCount / gridColumns));
  const mobileGridColumns = $derived(tileCount <= 2 ? 1 : 2);
  const mobileGridRows = $derived(Math.ceil(tileCount / mobileGridColumns));

  function bindMediaStream(node: HTMLMediaElement, stream: MediaStream | null) {
    const apply = (nextStream: MediaStream | null) => {
      if (node.srcObject !== nextStream) {
        node.srcObject = nextStream;
      }

      if (nextStream) {
        void node.play().catch(() => {
          // Autoplay restrictions are expected until user interaction.
        });
      }
    };

    apply(stream);
    return {
      destroy() {
        node.pause();
        node.srcObject = null;
      }
    };
  }
</script>

{#if roomName}
  <div class="room-session-panel" aria-live="polite">
    <div class="room-session-header">
      <div>
        <div class="room-session-title">Room: {roomName}</div>
        <div class="room-session-subtitle">
          {connectionState === 'connected'
            ? `${participants.length} participant(s)${startedAtMs !== null ? ` · call ${formatRoomDuration((clockNowMs - startedAtMs) / 1000)}` : ''}`
            : connectionState === 'connecting'
              ? 'Connecting...'
              : connectionState === 'error'
                ? 'Connection error'
                : 'Disconnected'}
        </div>
      </div>
    </div>

    <div
      class="participants-grid"
      style={`--participant-columns:${gridColumns};--participant-rows:${gridRows};--participant-mobile-columns:${mobileGridColumns};--participant-mobile-rows:${mobileGridRows};`}
    >
      {#each participants as participant (participant.id)}
        <article class:participant-tile={true} class:participant-speaking={participant.isSpeaking}>
          {#if participant.stream && participant.cameraOn}
            <video
              class="participant-media"
              autoplay
              playsinline
              muted={participant.isLocal}
              use:bindMediaStream={participant.stream}
            ></video>
          {:else}
            <div class="participant-placeholder participant-media">Camera off</div>
          {/if}

          {#if participant.stream && participant.microphoneOn && !participant.cameraOn}
            <audio
              class="participant-audio"
              autoplay
              muted={participant.isLocal}
              use:bindMediaStream={participant.stream}
            ></audio>
          {/if}

          <footer class="participant-meta">
            <span>{participant.name}{participant.isLocal ? ' (you)' : ''}</span>
            <span class="participant-quality">
              {participant.connectionQuality}
              · {participant.microphoneOn ? 'mic on' : 'mic off'}
            </span>
          </footer>
        </article>
      {/each}
    </div>
  </div>
{/if}

<style>
  .room-session-panel {
    position: absolute;
    z-index: 12;
    left: 1rem;
    right: 1rem;
    top: 1rem;
    bottom: 6.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .room-session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: rgba(255, 255, 255, 0.92);
  }

  .room-session-title {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .room-session-subtitle {
    font-size: 0.76rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .participants-grid {
    display: grid;
    grid-template-columns: repeat(var(--participant-columns), minmax(0, 1fr));
    grid-template-rows: repeat(var(--participant-rows), minmax(0, 1fr));
    gap: 0.8rem;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
    align-items: stretch;
  }

  .participant-tile {
    position: relative;
    border-radius: 18px;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.14);
    background: rgba(12, 12, 12, 0.85);
    height: 100%;
    min-height: 0;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.28);
    transition: border-color 180ms ease, box-shadow 180ms ease;
  }

  .participant-speaking {
    border-color: rgba(88, 234, 149, 0.95);
    box-shadow: 0 0 0 4px rgba(88, 234, 149, 0.25);
  }

  .participant-tile video,
  .participant-placeholder {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: block;
    object-fit: cover;
  }

  .participant-media {
    position: absolute;
    inset: 0;
  }

  .participant-placeholder {
    display: grid;
    place-items: center;
    padding-bottom: 0;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.78rem;
  }

  .participant-audio {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }

  .participant-meta {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.38rem 0.5rem;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.2));
    color: rgba(255, 255, 255, 0.93);
    font-size: 0.7rem;
  }

  .participant-quality {
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.72);
  }

  @media (max-width: 640px) {
    .room-session-panel {
      left: 0.75rem;
      right: 0.75rem;
      top: 0.75rem;
      bottom: 6.5rem;
    }

    .participants-grid {
      grid-template-columns: repeat(var(--participant-mobile-columns), minmax(0, 1fr));
      grid-template-rows: repeat(var(--participant-mobile-rows), minmax(0, 1fr));
      gap: 0.55rem;
    }
  }
</style>











