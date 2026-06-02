<!--
    Camera route.

    Orchestration layer for the full camera page. Wires together:
    - media start/stop and restart flows
    - persisted preferences (PreferencesStore) and device lists (DevicesStore)
    - applyConstraints()-first quality updates with full-restart fallback
    - debug and performance overlays with their sampling loops
    - microphone level binding for MicrophoneMeter

    Heavy browser helpers live in src/lib/camera/*.
    Reactive stores live in src/lib/camera/stores/*.
    See src/lib/camera/README.md for the architecture overview.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import cameraOff from "$lib/images/camera-off.svg";
    import cameraOn from "$lib/images/camera-on.svg";
    import micOn from "$lib/images/mic-on.svg";
    import micOff from "$lib/images/mic-off.svg";
    import loading from "$lib/images/loading.svg";
    import starsIcon from "$lib/images/stars.svg";
    import CameraDebugOverlay from "$lib/components/camera/CameraDebugOverlay.svelte";
    import CameraPerformanceOverlay from "$lib/components/camera/CameraPerformanceOverlay.svelte";
    import CameraSettingsMenu from "$lib/components/camera/CameraSettingsMenu.svelte";
    import MediaControls from "$lib/components/camera/MediaControls.svelte";
    import MediaToggleButton from "$lib/components/camera/MediaToggleButton.svelte";
    import MediaPlaceholder from "$lib/components/camera/MediaPlaceholder.svelte";
    import ErrorBanner from "$lib/components/camera/ErrorBanner.svelte";
    import MicrophoneMeter from "$lib/components/camera/MicrophoneMeter.svelte";
    import { detectBrowserVersion } from "$lib/camera/devices";
    import { PreferencesStore } from "$lib/camera/stores/preferences.svelte";
    import { DevicesStore } from "$lib/camera/stores/devices.svelte";
    import { MonitorStore, type DebugInput, type PerfInput } from "$lib/camera/stores/monitor.svelte";
    import { getMediaErrorMessage } from "$lib/camera/errors";
    import {
        buildCameraConstraints,
        buildMediaConstraints,
        buildMicrophoneConstraints,
        getApplyConstraintCandidates,
    } from "$lib/camera/settings";
    import {
        startAllMedia,
        startCameraMedia,
        startMicrophoneMedia,
        stopCameraMedia,
        stopMicrophoneMedia,
    } from "$lib/camera/controller";
    import { type CameraState } from "camera-core";

    const prefs = new PreferencesStore();
    const devices = new DevicesStore();
    const monitor = new MonitorStore();

    let videoEl: HTMLVideoElement;
    let cameraStream = $state<MediaStream | null>(null);
    let microphoneStream = $state<MediaStream | null>(null);
    let cameraState = $state<CameraState>("idle");
    let microphoneState = $state<CameraState>("idle");
    let cameraEnabled = $state(false);
    let microphoneEnabled = $state(false);
    let errorMessage = $state("");
    let isApplyingQuality = $state(false);

    /** Returns the current inputs for the debug overlay loop. */
    function getDebugInput(): DebugInput {
        return { cameraStream, microphoneStream, cameraState, microphoneState };
    }

    /** Returns the current inputs for the performance loop. */
    function getPerfInput(): PerfInput {
        return { videoEl, cameraStream, cameraState, cameraEnabled, selectedQuality: prefs.selectedQuality };
    }


    /**
     * Refreshes both overlay snapshots immediately.
     * Called after any stream start, stop, or quality/device change.
     */
    function refreshOverlaySnapshots() {
        monitor.refreshDebug(getDebugInput());
        monitor.refreshPerf(getPerfInput());
    }

    /** Starts or stops the debug overlay loop based on the current toggle. */
    function syncDebugInfoLoopState() {
        if (prefs.showDebugInfo) {
            monitor.startDebugLoop(getDebugInput);
        } else {
            monitor.stopDebugLoop();
        }
    }

    /** Starts or stops the performance loops based on the current toggle. */
    function syncPerformanceLoopState() {
        if (prefs.showPerformance) {
            monitor.startPerfLoop(videoEl, getPerfInput);
        } else {
            monitor.stopPerfLoop();
        }
    }

    /** Resets rolling performance counters when the page loses/regains focus. */
    function handlePerformanceVisibilityReset() {
        monitor.resetPerfMeasurement();
        monitor.refreshPerf(getPerfInput());
    }
    /**
     * Refreshes selectable camera and microphone devices.
     *
     * Called after permission changes, stream restarts, and hardware changes
     * so the device selects stay aligned with the real device list.
     */
    async function refreshAvailableDevices() {
        const { normalizedVideoId, normalizedAudioId } = await devices.refresh(
            cameraStream,
            microphoneStream,
            prefs.selectedVideoDeviceId,
            prefs.selectedAudioDeviceId,
        );

        if (
            normalizedVideoId !== prefs.selectedVideoDeviceId ||
            normalizedAudioId !== prefs.selectedAudioDeviceId
        ) {
            prefs.selectedVideoDeviceId = normalizedVideoId;
            prefs.selectedAudioDeviceId = normalizedAudioId;
            prefs.persist(localStorage);
        }
    }

    /**
     * Soft-enables or soft-disables a track without recreating the stream.
     */
    function setTrackEnabled(
        stream: MediaStream | null,
        kind: "video" | "audio",
        enabled: boolean,
    ) {
        const track =
            kind === "video"
                ? stream?.getVideoTracks()?.[0]
                : stream?.getAudioTracks()?.[0];

        if (!track) {
            return false;
        }

        track.enabled = enabled;
        return true;
    }

    /**
     * Soft-toggle for the camera stream.
     *
     * This is preferred over a full stop/start because it avoids extra permission
     * prompts and keeps the page responsive.
     */
    function setCameraStreamEnabled(enabled: boolean) {
        const didUpdateTrack = setTrackEnabled(cameraStream, "video", enabled);

        if (!didUpdateTrack) {
            return false;
        }

        cameraEnabled = enabled;
        if (enabled) {
            void videoEl?.play().catch(() => {
                // Ignore autoplay/playback recovery errors.
            });
        }
        refreshOverlaySnapshots();
        return true;
    }

    /** Soft-toggle for the microphone stream. */
    function setMicrophoneStreamEnabled(enabled: boolean) {
        const didUpdateTrack = setTrackEnabled(
            microphoneStream,
            "audio",
            enabled,
        );

        if (!didUpdateTrack) {
            return false;
        }

        microphoneEnabled = enabled;
        refreshOverlaySnapshots();
        syncDebugInfoLoopState();
        return true;
    }


    /** Starts only the camera stream. */
    async function handleStart() {
        errorMessage = "";
        cameraState = "loading";

        try {
            cameraStream = await startCameraMedia(
                videoEl,
                buildCameraConstraints(prefs.snapshot),
            );
            cameraEnabled = true;
            cameraState = "ready";
            await refreshAvailableDevices();
            refreshOverlaySnapshots();
        } catch (error) {
            cameraState = "error";
            errorMessage = getMediaErrorMessage("camera", error);
        }
    }

    /** Starts both camera and microphone during the initial page boot path. */
    async function handleStartAll() {
        errorMessage = "";
        cameraState = "loading";
        microphoneState = "loading";

        try {
            const streams = await startAllMedia(
                videoEl,
                buildMediaConstraints(prefs.snapshot),
            );
            cameraStream = streams.cameraStream;
            microphoneStream = streams.microphoneStream;
            cameraEnabled = true;
            microphoneEnabled = true;

            cameraState = "ready";
            microphoneState = "ready";
            await refreshAvailableDevices();
            refreshOverlaySnapshots();
        } catch (error) {
            cameraState = "error";
            microphoneState = "error";
            errorMessage = getMediaErrorMessage("media", error);
        }
    }

    /** Performs a hard camera stop. Used for teardown and restart paths. */
    function handleStop() {
        stopCameraMedia(videoEl, cameraStream);

        cameraStream = null;
        cameraEnabled = false;

        cameraState = "idle";
    }

    /** User-facing camera toggle handler. */
    async function handleToggle() {
        if (cameraStream && setCameraStreamEnabled(!cameraEnabled)) {
            return;
        }

        await handleStart();
    }

    /** Starts only the microphone stream. */
    async function handleMicStart() {
        errorMessage = "";
        microphoneState = "loading";

        try {
            microphoneStream = await startMicrophoneMedia(
                buildMicrophoneConstraints(prefs.selectedAudioDeviceId),
            );
            microphoneEnabled = true;
            microphoneState = "ready";
            await refreshAvailableDevices();
            refreshOverlaySnapshots();
            syncDebugInfoLoopState();
        } catch (error) {
            microphoneState = "error";
            errorMessage = getMediaErrorMessage("microphone", error);
        }
    }

    /** Performs a hard microphone stop. Used for teardown and restart paths. */
    function handleMicStop() {
        stopMicrophoneMedia(microphoneStream);
        microphoneStream = null;
        microphoneEnabled = false;
        microphoneState = "idle";
        refreshOverlaySnapshots();
        syncDebugInfoLoopState();
    }

    /** User-facing microphone toggle handler. */
    async function handleMicToggle() {
        if (
            microphoneStream &&
            setMicrophoneStreamEnabled(!microphoneEnabled)
        ) {
            return;
        }

        await handleMicStart();
    }

    /** Persists and applies the debug overlay toggle. */
    function handleDebugInfoToggle() {
        prefs.persist(localStorage);
        syncDebugInfoLoopState();
    }

    /** Persists and applies the performance overlay toggle. */
    function handlePerformanceToggle() {
        prefs.persist(localStorage);
        syncPerformanceLoopState();
    }

    /**
     * Restarts whichever streams are currently required after device or quality changes.
     *
     * The function remembers whether camera and microphone were soft-enabled before the
     * restart and restores those flags afterwards.
     */
    async function restartActiveMedia(options: {
        restartCamera: boolean;
        restartMicrophone: boolean;
    }) {
        const shouldEnableCamera = cameraEnabled;
        const shouldEnableMicrophone = microphoneEnabled;

        if (options.restartCamera) {
            stopCameraMedia(videoEl, cameraStream);
            cameraStream = null;
            cameraEnabled = false;
        }

        if (options.restartMicrophone) {
            stopMicrophoneMedia(microphoneStream);
            microphoneStream = null;
            microphoneEnabled = false;
        }

        if (options.restartCamera && options.restartMicrophone) {
            const streams = await startAllMedia(
                videoEl,
                buildMediaConstraints(prefs.snapshot),
            );
            cameraStream = streams.cameraStream;
            microphoneStream = streams.microphoneStream;
            setCameraStreamEnabled(shouldEnableCamera);
            setMicrophoneStreamEnabled(shouldEnableMicrophone);
            await refreshAvailableDevices();
            return;
        }

        if (options.restartCamera) {
            cameraStream = await startCameraMedia(
                videoEl,
                buildCameraConstraints(prefs.snapshot),
            );
            setCameraStreamEnabled(shouldEnableCamera);
        }

        if (options.restartMicrophone) {
            microphoneStream = await startMicrophoneMedia(
                buildMicrophoneConstraints(prefs.selectedAudioDeviceId),
            );
            setMicrophoneStreamEnabled(shouldEnableMicrophone);
        }

        await refreshAvailableDevices();
    }

    /**
     * Applies new video preferences with applyConstraints() first.
     *
     * Full stream recreation is used only when applyConstraints() is unsupported or the
     * device rejects the requested constraints with an over-constrained error.
     */
    async function applyVideoPreferences(forceRestart = false) {
        if (!cameraStream || !videoEl) return;

        const hasMicrophone = Boolean(microphoneStream);
        const [videoTrack] = cameraStream.getVideoTracks();
        isApplyingQuality = true;
        errorMessage = "";
        cameraState = "loading";
        if (hasMicrophone) microphoneState = "loading";

        try {
            if (
                !forceRestart &&
                videoTrack &&
                typeof videoTrack.applyConstraints === "function"
            ) {
                let constraintApplied = false;
                let lastError: unknown = null;

                for (const constraints of getApplyConstraintCandidates(
                    prefs.snapshot,
                )) {
                    try {
                        await videoTrack.applyConstraints(constraints);
                        constraintApplied = true;
                        break;
                    } catch (err) {
                        lastError = err;
                    }
                }

                if (constraintApplied) {
                    cameraState = "ready";
                    if (hasMicrophone) microphoneState = "ready";
                    refreshOverlaySnapshots();
                    return;
                }

                // Only fall through to restart on overconstrained errors; surface others directly
                const isOverconstrained =
                    !(lastError instanceof DOMException) ||
                    lastError.name === "OverconstrainedError" ||
                    lastError.name === "ConstraintNotSatisfiedError";

                if (!isOverconstrained) {
                    cameraState = "error";
                    if (hasMicrophone) microphoneState = "error";
                    errorMessage = getMediaErrorMessage(
                        hasMicrophone ? "media" : "camera",
                        lastError,
                    );
                    return;
                }
            }

            // Full stream restart path (forceRestart or overconstrained applyConstraints)
            try {
                await restartActiveMedia({
                    restartCamera: true,
                    restartMicrophone: hasMicrophone,
                });
                cameraState = "ready";
                if (hasMicrophone) microphoneState = "ready";
                refreshOverlaySnapshots();
            } catch (restartError) {
                cameraStream = null;
                cameraEnabled = false;
                cameraState = "error";
                if (hasMicrophone) {
                    microphoneStream = null;
                    microphoneEnabled = false;
                    microphoneState = "error";
                    errorMessage = getMediaErrorMessage("media", restartError);
                } else {
                    errorMessage = getMediaErrorMessage("camera", restartError);
                }
            }
        } finally {
            isApplyingQuality = false;
        }
    }

    /** Persists and applies a new quality preset. */
    async function handleQualityChange() {
        prefs.persist(localStorage);
        await applyVideoPreferences();
    }

    /**
     * Restarts the active streams after a device change.
     *
     * The primary parameter identifies which device changed. If that device has no
     * active stream the handler skips the restart and only refreshes the device list.
     */
    async function handleDeviceChange(primary: "camera" | "microphone") {
        prefs.persist(localStorage);

        const isCameraChange = primary === "camera";
        const hasCam = Boolean(cameraStream);
        const hasMic = Boolean(microphoneStream);

        if (isCameraChange ? !hasCam : !hasMic) {
            await refreshAvailableDevices();
            return;
        }

        if (hasCam) cameraState = "loading";
        if (hasMic) microphoneState = "loading";

        try {
            await restartActiveMedia({
                restartCamera: hasCam,
                restartMicrophone: hasMic,
            });
            if (hasCam) cameraState = "ready";
            if (hasMic) microphoneState = "ready";
            refreshOverlaySnapshots();
        } catch (error) {
            if (hasCam) cameraState = "error";
            if (hasMic) microphoneState = "error";
            const kind =
                hasCam && hasMic ? "media" : hasCam ? "camera" : "microphone";
            errorMessage = getMediaErrorMessage(kind, error);
        }
    }

    /** Refreshes device lists when the browser reports a hardware change. */
    async function handleMediaDevicesChange() {
        await refreshAvailableDevices();
    }

    function handleCreateClick() {}

    function handleJoinClick() {}

    function handleStarsClick() {}

    onMount(() => {
        monitor.debug.browser = detectBrowserVersion();
        prefs.load(localStorage);

        document.addEventListener(
            "visibilitychange",
            handlePerformanceVisibilityReset,
        );
        window.addEventListener("blur", handlePerformanceVisibilityReset);
        window.addEventListener("focus", handlePerformanceVisibilityReset);
        window.addEventListener("pagehide", handlePerformanceVisibilityReset);

        if (navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener(
                "devicechange",
                handleMediaDevicesChange,
            );
        }

        // handleStartAll manages its own try/catch and updates cameraState/errorMessage.
        // We fire-and-forget here so onMount can return the cleanup function synchronously.
        handleStartAll().then(() => {
            syncDebugInfoLoopState();
            syncPerformanceLoopState();
        });

        // Cleanup runs only in the browser (onMount is browser-only),
        // so document/window/navigator are always available here.
        return () => {
            document.removeEventListener(
                "visibilitychange",
                handlePerformanceVisibilityReset,
            );
            window.removeEventListener("blur", handlePerformanceVisibilityReset);
            window.removeEventListener("focus", handlePerformanceVisibilityReset);
            window.removeEventListener("pagehide", handlePerformanceVisibilityReset);

            if (navigator.mediaDevices?.removeEventListener) {
                navigator.mediaDevices.removeEventListener(
                    "devicechange",
                    handleMediaDevicesChange,
                );
            }

            monitor.stopDebugLoop();
            monitor.stopPerfLoop();
            handleStop();
            handleMicStop();
        };
    });
</script>

<svelte:head>
    <title>Camera</title>
</svelte:head>

<div class="camera-view">
    <video bind:this={videoEl} autoplay playsinline muted></video>

    <div class="corner-actions top-right-actions" aria-label="Session actions">
        <button class="action-pill" type="button" onclick={handleCreateClick}
            >Create</button
        >
        <button class="action-pill" type="button" onclick={handleJoinClick}
            >Join</button
        >
    </div>

    <CameraSettingsMenu
        bind:showDebugInfo={prefs.showDebugInfo}
        bind:showPerformance={prefs.showPerformance}
        bind:selectedQuality={prefs.selectedQuality}
        bind:selectedVideoDeviceId={prefs.selectedVideoDeviceId}
        bind:selectedAudioDeviceId={prefs.selectedAudioDeviceId}
        bind:videoDeviceOptions={devices.videoDevices}
        bind:audioDeviceOptions={devices.audioDevices}
        {isApplyingQuality}
        {cameraState}
        {microphoneState}
        onDebugInfoToggle={handleDebugInfoToggle}
        onPerformanceToggle={handlePerformanceToggle}
        onQualityChange={handleQualityChange}
        onVideoDeviceChange={() => handleDeviceChange("camera")}
        onAudioDeviceChange={() => handleDeviceChange("microphone")}
    />

    {#if prefs.showPerformance || prefs.showDebugInfo}
        <div class="overlay-stack">
            {#if prefs.showPerformance}
                <CameraPerformanceOverlay
                    measuredFps={monitor.perf.fps}
                    renderFps={monitor.perf.renderFps}
                    frameTimeMs={monitor.perf.frameTimeMs}
                    resolution={monitor.perf.resolution}
                    trackFrameRate={monitor.perf.trackFrameRate}
                    targetFrameRate={monitor.perf.targetFrameRate}
                    quality={prefs.selectedQuality}
                />
            {/if}

            {#if prefs.showDebugInfo}
                <CameraDebugOverlay
                    browser={monitor.debug.browser}
                    cameraMuted={monitor.debug.cameraMuted}
                    cameraName={monitor.debug.cameraName}
                    microphoneMuted={monitor.debug.microphoneMuted}
                    microphoneLevel={monitor.debug.microphoneLevelSnapshot}
                    microphoneName={monitor.debug.microphoneName}
                />
            {/if}
        </div>
    {/if}

    {#if cameraState !== "ready" || !cameraEnabled}
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
            active={false}
            activeIcon={starsIcon}
            inactiveIcon={starsIcon}
            activeAlt="Stars action"
            inactiveAlt="Stars action"
            onToggle={handleStarsClick}
        />

        <MediaToggleButton
            active={cameraEnabled}
            disabled={cameraState === "loading"}
            activeIcon={cameraOn}
            inactiveIcon={cameraOff}
            activeAlt="Turn camera off"
            inactiveAlt="Turn camera on"
            onToggle={handleToggle}
        />

        <div class="microphone-control">
            <MediaToggleButton
                active={microphoneEnabled}
                disabled={microphoneState === "loading"}
                activeIcon={micOn}
                inactiveIcon={micOff}
                activeAlt="Turn microphone off"
                inactiveAlt="Turn microphone on"
                onToggle={handleMicToggle}
            />

            <MicrophoneMeter
                stream={microphoneStream}
                enabled={microphoneEnabled}
                ready={microphoneState === "ready"}
                bind:level={monitor.debug.microphoneLevel}
            />
        </div>
    </MediaControls>
</div>

<style>
    @import "$lib/styles/camera-page.css";

    .overlay-stack {
        position: absolute;
        top: 1rem;
        left: 1rem;
        z-index: 5;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        pointer-events: none;
        max-width: calc(100vw - 2rem);
    }

    .corner-actions {
        position: absolute;
        z-index: 15;
        display: flex;
        gap: 0.75rem;
    }

    .top-right-actions {
        top: 1.5rem;
        right: 5.25rem;
        align-items: center;
    }

    .action-pill {
        border: 0;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.65);
        color: white;
        font: inherit;
        font-weight: 600;
        backdrop-filter: blur(6px);
        cursor: pointer;
        min-height: 48px;
        padding: 0.9rem 1.2rem;
    }

    .microphone-control {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }


    @media (max-width: 640px) {
        .overlay-stack {
            top: 0.75rem;
            left: 0.75rem;
            max-width: calc(100vw - 1.5rem);
        }

        .top-right-actions {
            top: 0.75rem;
            right: 4.25rem;
            gap: 0.5rem;
        }

        .action-pill {
            min-height: 44px;
            padding: 0.8rem 1rem;
        }

        .microphone-control {
            gap: 0.45rem;
        }
    }
</style>
