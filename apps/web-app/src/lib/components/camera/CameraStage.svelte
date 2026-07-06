<!-- CameraStage.svelte -->
<script lang="ts">
    import RoomParticipantsGrid from "./RoomParticipantsGrid.svelte";
    import MediaPlaceholder from "./MediaPlaceholder.svelte";

    import loadingIcon from "$lib/images/loading.svg";
    import cameraOffIcon from "$lib/images/camera-off.svg";

    import type { CameraState } from "camera-core";
    import type { RoomConnectionState } from "$lib/camera/controllers/room.svelte";

    type Props = {
        videoEl?: HTMLVideoElement;
        previewContainerEl?: HTMLDivElement;

        roomName: string | null;
        connectionState: RoomConnectionState;
        participants: any[];

        cameraState: CameraState;
        cameraEnabled: boolean;
    };

    let {
        videoEl = $bindable(),
        previewContainerEl = $bindable(),

        roomName,
        connectionState,
        participants,

        cameraState,
        cameraEnabled,
    }: Props = $props();

    const inRoom = $derived(connectionState === "connected");

    const showPlaceholder = $derived(
        (cameraState !== "ready" || !cameraEnabled) && !roomName,
    );

    // Camera off while in a room → solid black tile + icon (WYSIWYG: this is
    // what remote peers see, so the local user sees it too).
    const showCameraOff = $derived(inRoom && !cameraEnabled);

    // Grid sizing mirrors RoomParticipantsGrid so the stage overlays cell 1.
    const tileCount = $derived(Math.max(1, participants.length));
    const cols = $derived(Math.ceil(Math.sqrt(tileCount)));
    const rows = $derived(Math.ceil(tileCount / cols));
</script>

<div
        class="camera-stage"
        class:in-room={inRoom}
        style={`--cols: ${cols}; --rows: ${rows};`}
>
    <video bind:this={videoEl} class="source-video" autoplay playsinline muted aria-hidden="true"></video>
    <div bind:this={previewContainerEl} class="preview-container"></div>

    {#if showCameraOff}
        <div class="stage-camera-off">
            <img src={cameraOffIcon} alt="Camera is off" />
        </div>
    {/if}

    {#if inRoom}
        <footer class="local-footer">
            <span class="local-name">You</span>
        </footer>
    {/if}
</div>

{#if inRoom}
    <RoomParticipantsGrid
            roomName={roomName}
            connectionState={connectionState}
            participants={participants}
    />
{/if}

{#if showPlaceholder}
    <MediaPlaceholder
            loading={cameraState === "loading"}
            loadingIcon={loadingIcon}
            offIcon={cameraOffIcon}
            loadingAlt="Camera is starting"
            offAlt="Camera is off"
    />
{/if}

<style>
    .camera-stage {
        position: absolute;
        inset: 0;
        z-index: 1;
        overflow: hidden;
    }

    .camera-stage.in-room {
        z-index: 13;
        inset: auto;
        top: 0;
        left: 0;
        width: calc(100% / var(--cols));
        height: calc(100% / var(--rows));
    }

    @media (max-width: 640px) {
        .camera-stage.in-room {
            width: calc(100% / var(--rows));
            height: calc(100% / var(--cols));
        }
    }

    .camera-stage .source-video {
        position: absolute;
        width: 1px;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    }

    .preview-container {
        position: absolute;
        inset: 0;
        z-index: 3;
        overflow: hidden;
    }

    .preview-container :global(.composition-preview-canvas) {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: cover;
    }

    /* Camera off: opaque black tile + icon over everything. */
    .stage-camera-off {
        position: absolute;
        inset: 0;
        z-index: 6;
        display: grid;
        place-items: center;
        background: #000;
    }

    .stage-camera-off img {
        width: 48px;
        height: 48px;
        opacity: 0.7;
        filter: invert(1);
    }

    .local-footer {
        position: absolute;
        left: 0; right: 0; bottom: 0;
        z-index: 7;
        padding: 0.4rem 0.6rem;
        color: rgba(255,255,255,0.95);
        font-size: 0.78rem;
        pointer-events: none;
        text-shadow: 0 1px 3px rgba(0,0,0,0.9);
    }
</style>