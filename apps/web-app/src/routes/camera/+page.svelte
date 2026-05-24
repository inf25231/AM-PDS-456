<!-- by ove. 2026 -->

<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import cameraOff from "$lib/images/camera-off.svg";
    import cameraOn from "$lib/images/camera-on.svg";
    import micOn from "$lib/images/mic-on.svg";
    import micOff from "$lib/images/mic-off.svg";
    import loading from "$lib/images/loading.svg";
    import MediaControls from "$lib/components/camera/MediaControls.svelte";
    import MediaToggleButton from "$lib/components/camera/MediaToggleButton.svelte";
    import MediaPlaceholder from "$lib/components/camera/MediaPlaceholder.svelte";
    import ErrorBanner from "$lib/components/camera/ErrorBanner.svelte";
    import { getMediaErrorMessage } from "$lib/camera/errors";
    import {
        startAllMedia,
        startCameraMedia,
        startMicrophoneMedia,
        stopCameraMedia,
        stopMicrophoneMedia,
    } from "$lib/camera/controller";
    import {
        type CameraState,
    } from "$lib/camera/media";

    let videoEl: HTMLVideoElement;
    let cameraStream = $state<MediaStream | null>(null);
    let microphoneStream = $state<MediaStream | null>(null);
    let cameraState = $state<CameraState>("idle");
    let microphoneState = $state<CameraState>("idle");
    let errorMessage = $state("");

    async function handleStart() {
        errorMessage = "";
        cameraState = "loading";

        try {
            cameraStream = await startCameraMedia(videoEl);
            cameraState = "ready";
        } catch (error) {
            cameraState = "error";
            errorMessage = getMediaErrorMessage("camera", error);
        }
    }

    async function handleStartAll() {
        errorMessage = "";
        cameraState = "loading";
        microphoneState = "loading";

        try {
            const streams = await startAllMedia(videoEl);
            cameraStream = streams.cameraStream;
            microphoneStream = streams.microphoneStream;

            cameraState = "ready";
            microphoneState = "ready";
        } catch (error) {
            cameraState = "error";
            microphoneState = "error";
            errorMessage = getMediaErrorMessage("media", error);
        }
    }

    function handleStop() {
        stopCameraMedia(videoEl, cameraStream);

        cameraStream = null;

        cameraState = "idle";
    }

    async function handleToggle() {
        if (cameraStream) {
            handleStop();
            return;
        }

        await handleStart();
    }

    async function handleMicStart() {
        errorMessage = "";
        microphoneState = "loading";

        try {
            microphoneStream = await startMicrophoneMedia();
            microphoneState = "ready";
        } catch (error) {
            microphoneState = "error";
            errorMessage = getMediaErrorMessage("microphone", error);
        }
    }

    function handleMicStop() {
        stopMicrophoneMedia(microphoneStream);
        microphoneStream = null;
        microphoneState = "idle";
    }

    async function handleMicToggle() {
        if (microphoneStream) {
            handleMicStop();
            return;
        }

        await handleMicStart();
    }

    onMount(async () => {
        await handleStartAll();
    });

    onDestroy(() => {
        handleStop();
        handleMicStop();
    });
</script>

<svelte:head>
    <title>Camera</title>
</svelte:head>

<div class="camera-view">
    <video bind:this={videoEl} autoplay playsinline muted></video>

    {#if cameraState !== "ready"}
        <MediaPlaceholder
            loading={cameraState === "loading"}
            loadingIcon={loading}
            offIcon={cameraOff}
            loadingAlt="Camera is starting"
            offAlt="Camera is off"
        />
    {/if}

    {#if cameraState === "error" || microphoneState === "error"}
        <ErrorBanner message={errorMessage} />
    {/if}

    <MediaControls>
        <MediaToggleButton
            active={Boolean(cameraStream)}
            disabled={cameraState === "loading"}
            activeIcon={cameraOn}
            inactiveIcon={cameraOff}
            activeAlt="Turn camera off"
            inactiveAlt="Turn camera on"
            onToggle={handleToggle}
        />

        <MediaToggleButton
            active={Boolean(microphoneStream)}
            disabled={microphoneState === "loading"}
            activeIcon={micOn}
            inactiveIcon={micOff}
            activeAlt="Turn microphone off"
            inactiveAlt="Turn microphone on"
            onToggle={handleMicToggle}
        />
    </MediaControls>
</div>

<style>
    @import "$lib/styles/camera-page.css";
</style>
