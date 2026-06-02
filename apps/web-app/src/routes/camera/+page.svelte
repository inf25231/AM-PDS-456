<!--
    Camera route.

    This file is the orchestration layer for the full camera page. It wires together:
    - media start/stop and restart flows
    - persisted preferences and selected devices
    - applyConstraints()-first quality updates
    - debug and performance overlays
    - microphone level sampling for the bottom control row

    The heavy browser helpers live in src/lib/camera/*.
    This file decides when they run and how their state affects the UI.
-->

<script lang="ts">
    import { onDestroy, onMount } from "svelte";
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
    import {
        detectBrowserVersion,
        enumerateMediaDeviceOptions,
        getStreamTrackDeviceId,
        normalizeSelectedDeviceId,
        type DeviceOption,
    } from "$lib/camera/devices";
    import { getMediaErrorMessage } from "$lib/camera/errors";
    import {
        cancelPerformanceFrameCallback,
        getRenderedFrameCount,
        requestPerformanceFrameCallback,
    } from "$lib/camera/performance";
    import {
        buildCameraConstraints,
        buildMediaConstraints,
        buildMicrophoneConstraints,
        getApplyConstraintCandidates,
        persistCameraPreferences,
        readCameraPreferences,
        type CameraPreferences,
    } from "$lib/camera/settings";
    import {
        startAllMedia,
        startCameraMedia,
        startMicrophoneMedia,
        stopCameraMedia,
        stopMicrophoneMedia,
    } from "$lib/camera/controller";
    import {
        getVideoConstraintsByQuality,
        type CameraState,
        type VideoQuality,
    } from "camera-core";

    let videoEl: HTMLVideoElement;
    let cameraStream = $state<MediaStream | null>(null);
    let microphoneStream = $state<MediaStream | null>(null);
    let cameraState = $state<CameraState>("idle");
    let microphoneState = $state<CameraState>("idle");
    let cameraEnabled = $state(false);
    let microphoneEnabled = $state(false);
    let errorMessage = $state("");
    let showDebugInfo = $state(false);
    let showPerformance = $state(false);
    let selectedQuality = $state<VideoQuality>("480p");
    let selectedVideoDeviceId = $state("");
    let selectedAudioDeviceId = $state("");
    let isApplyingQuality = $state(false);
    let availableVideoDevices = $state<DeviceOption[]>([]);
    let availableAudioDevices = $state<DeviceOption[]>([]);

    let debug = $state({
        browser: "Unknown",
        cameraName: "-",
        microphoneName: "-",
        microphoneLevel: 0,
        microphoneLevelSnapshot: 0,
        microphoneMuted: true,
        cameraMuted: true,
    });

    let perf = $state<{
        fps: number | null;
        renderFps: number | null;
        frameTimeMs: number | null;
        trackFrameRate: number | null;
        targetFrameRate: number | ConstrainULong | null;
        resolution: { width: number | null; height: number | null } | null;
    }>({
        fps: null,
        renderFps: null,
        frameTimeMs: null,
        trackFrameRate: null,
        targetFrameRate: null,
        resolution: null,
    });

    const DEBUG_INFO_SAMPLE_INTERVAL_MS = 250;
    const MICROPHONE_LEVEL_SAMPLE_INTERVAL_MS = 48;
    const PERFORMANCE_SAMPLE_INTERVAL_MS = 500;
    const MICROPHONE_LEVEL_GAIN = 4.4;
    const MICROPHONE_DECAY_FACTOR = 0.4;
    const MICROPHONE_ATTACK_BLEND = 0.96;

    let debugInfoLoopTimeoutId: number | null = null;
    let microphoneLevelLoopTimeoutId: number | null = null;
    let performanceLoopTimeoutId: number | null = null;
    let performanceRenderLoopFrameId: number | null = null;
    let performanceFrameCallbackId: number | null = null;
    let performancePresentedFrames = 0;
    let performanceRenderLoopFrames = 0;
    let previousPerformanceRenderLoopFrames = 0;
    let previousPerformanceSampleTime = 0;
    let previousPerformanceRenderedFrames = 0;

    let audioContext: AudioContext | null = null;
    let audioSource: MediaStreamAudioSourceNode | null = null;
    let audioAnalyser: AnalyserNode | null = null;

    /**
     * Returns whether the live microphone meter should currently sample audio.
     */
    function shouldSampleMicrophoneLevel() {
        return (
            Boolean(microphoneStream) &&
            microphoneState === "ready" &&
            microphoneEnabled
        );
    }

    function getMicrophoneLevelBars(level: number) {
        const barCount = 8;
        const activeBars = Math.max(
            0,
            Math.min(barCount, Math.round(level * barCount)),
        );

        return Array.from(
            { length: barCount },
            (_, index) => index < activeBars,
        );
    }

    function getMicrophoneLevelBarTone(index: number, barCount = 8) {
        const ratio = (index + 1) / barCount;

        if (ratio >= 0.875) {
            return "bar-red";
        }

        if (ratio >= 0.625) {
            return "bar-orange";
        }

        return "bar-green";
    }

    function getCurrentPreferences(): CameraPreferences {
        return {
            showDebugInfo,
            showPerformance,
            selectedQuality,
            selectedVideoDeviceId,
            selectedAudioDeviceId,
        };
    }

    /**
     * Restores persisted user preferences during route startup.
     */
    function applyStoredPreferences(preferences: CameraPreferences) {
        showDebugInfo = preferences.showDebugInfo;
        showPerformance = preferences.showPerformance;
        selectedQuality = preferences.selectedQuality;
        selectedVideoDeviceId = preferences.selectedVideoDeviceId;
        selectedAudioDeviceId = preferences.selectedAudioDeviceId;
    }

    /**
     * Persists the current route preferences to localStorage.
     */
    function persistSettings() {
        persistCameraPreferences(localStorage, getCurrentPreferences());
    }

    /**
     * Refreshes selectable camera and microphone devices.
     *
     * The route calls this after permission changes, stream restarts, and hardware
     * changes so selects stay aligned with the real device list.
     */
    async function refreshAvailableDevices() {
        const { videoInputs, audioInputs } =
            await enumerateMediaDeviceOptions();
        availableVideoDevices = videoInputs;
        availableAudioDevices = audioInputs;

        const activeVideoDeviceId = getStreamTrackDeviceId(
            cameraStream,
            "video",
        );
        const activeAudioDeviceId = getStreamTrackDeviceId(
            microphoneStream,
            "audio",
        );

        const normalizedVideoDeviceId = normalizeSelectedDeviceId(
            selectedVideoDeviceId,
            availableVideoDevices,
            activeVideoDeviceId,
        );
        const normalizedAudioDeviceId = normalizeSelectedDeviceId(
            selectedAudioDeviceId,
            availableAudioDevices,
            activeAudioDeviceId,
        );

        if (
            normalizedVideoDeviceId !== selectedVideoDeviceId ||
            normalizedAudioDeviceId !== selectedAudioDeviceId
        ) {
            selectedVideoDeviceId = normalizedVideoDeviceId;
            selectedAudioDeviceId = normalizedAudioDeviceId;
            persistSettings();
        }
    }

    /**
     * Captures the current debug information snapshot.
     *
     * The microphone level snapshot can be skipped because the bottom microphone
     * meter updates much faster than the debug overlay should.
     */
    function refreshDebugInfoSnapshot(includeMicrophoneLevelSnapshot = true) {
        const [videoTrack] = cameraStream?.getVideoTracks() ?? [];
        const [audioTrack] = microphoneStream?.getAudioTracks() ?? [];
        debug.cameraName = videoTrack?.label || "-";
        debug.microphoneName = audioTrack?.label || "-";
        debug.cameraMuted =
            !cameraStream ||
            !videoTrack ||
            videoTrack.muted ||
            !videoTrack.enabled ||
            cameraState !== "ready";
        debug.microphoneMuted =
            !microphoneStream ||
            !audioTrack ||
            audioTrack.muted ||
            !audioTrack.enabled ||
            microphoneState !== "ready";

        if (debug.microphoneMuted) {
            debug.microphoneLevel = 0;
        }

        if (includeMicrophoneLevelSnapshot) {
            debug.microphoneLevelSnapshot = debug.microphoneLevel;
        }
    }

    /**
     * Captures the current performance snapshot based on track settings.
     *
     * Render-loop metrics are computed elsewhere and only merged into the UI state
     * through the performance loop.
     */
    function refreshPerformanceSnapshot() {
        const [videoTrack] = cameraStream?.getVideoTracks() ?? [];
        const settings = videoTrack?.getSettings();

        perf.resolution = settings
            ? {
                  width: settings.width ?? null,
                  height: settings.height ?? null,
              }
            : null;
        perf.trackFrameRate = settings?.frameRate ?? null;
        perf.targetFrameRate =
            getVideoConstraintsByQuality(selectedQuality).frameRate ?? null;
    }

    function refreshOverlaySnapshots() {
        refreshDebugInfoSnapshot();
        refreshPerformanceSnapshot();
    }

    /**
     * Ensures that Web Audio analysis nodes exist for the live microphone meter.
     */
    function ensureAudioAnalysis() {
        if (!microphoneStream || audioContext || audioSource || audioAnalyser)
            return;

        try {
            audioContext = new AudioContext();
            audioAnalyser = audioContext.createAnalyser();
            /** Smaller FFT windows make the visual meter react faster to speech attacks. */
            audioAnalyser.fftSize = 512;
            audioAnalyser.smoothingTimeConstant = 0.12;
            audioSource = audioContext.createMediaStreamSource(microphoneStream);
            audioSource.connect(audioAnalyser);
            void audioContext.resume();
        } catch {
            destroyAudioAnalysis();
        }
    }

    /**
     * Updates the live microphone level used by the bottom meter.
     *
     * The meter intentionally uses a weighted peak + RMS model:
     * - peak keeps speech onset responsive
     * - RMS prevents the meter from becoming too twitchy
     */
    function updateMicrophoneLevel() {
        if (!audioAnalyser) return;

        const buffer = new Uint8Array(audioAnalyser.fftSize);
        audioAnalyser.getByteTimeDomainData(buffer);

        let sumSquares = 0;
        let peak = 0;
        for (let index = 0; index < buffer.length; index += 1) {
            const normalized = (buffer[index] - 128) / 128;
            sumSquares += normalized * normalized;
            peak = Math.max(peak, Math.abs(normalized));
        }

        const rms = Math.sqrt(sumSquares / buffer.length);
        const weightedLevel = peak * 0.72 + rms * 0.28;
        const nextLevel = Math.max(
            0,
            Math.min(1, weightedLevel * MICROPHONE_LEVEL_GAIN),
        );

        if (nextLevel >= debug.microphoneLevel) {
            debug.microphoneLevel =
                debug.microphoneLevel * (1 - MICROPHONE_ATTACK_BLEND) +
                nextLevel * MICROPHONE_ATTACK_BLEND;
            return;
        }

        debug.microphoneLevel = Math.max(
            nextLevel,
            debug.microphoneLevel * MICROPHONE_DECAY_FACTOR,
        );
    }

    /**
     * Tears down the audio analysis graph used by the microphone meter.
     */
    function destroyAudioAnalysis() {
        if (audioSource) {
            try {
                audioSource.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            audioSource = null;
        }

        if (audioAnalyser) {
            try {
                audioAnalyser.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            audioAnalyser = null;
        }

        if (audioContext && audioContext.state !== "closed") {
            void audioContext.close();
        }

        audioContext = null;
    }

    /** Stops the slow debug overlay loop. */
    function stopDebugInfoLoop() {
        if (debugInfoLoopTimeoutId !== null) {
            clearTimeout(debugInfoLoopTimeoutId);
            debugInfoLoopTimeoutId = null;
        }
    }

    /** Stops the fast microphone level loop and clears its visible values. */
    function stopMicrophoneLevelLoop() {
        if (microphoneLevelLoopTimeoutId !== null) {
            clearTimeout(microphoneLevelLoopTimeoutId);
            microphoneLevelLoopTimeoutId = null;
        }

        debug.microphoneLevel = 0;
        debug.microphoneLevelSnapshot = 0;
    }

    /**
     * Stops all performance-related loops and resets the derived metrics.
     */
    function stopPerformanceLoop() {
        if (performanceLoopTimeoutId !== null) {
            clearTimeout(performanceLoopTimeoutId);
            performanceLoopTimeoutId = null;
        }

        if (performanceRenderLoopFrameId !== null) {
            window.cancelAnimationFrame(performanceRenderLoopFrameId);
        }
        performanceRenderLoopFrameId = null;

        if (videoEl) {
            cancelPerformanceFrameCallback(videoEl, performanceFrameCallbackId);
        }
        performanceFrameCallbackId = null;
        performancePresentedFrames = 0;
        performanceRenderLoopFrames = 0;
        perf.fps = null;
        perf.renderFps = null;
        perf.frameTimeMs = null;
        perf.trackFrameRate = null;
        perf.targetFrameRate =
            getVideoConstraintsByQuality(selectedQuality).frameRate ?? null;
        previousPerformanceRenderLoopFrames = 0;
        previousPerformanceSampleTime = 0;
        previousPerformanceRenderedFrames = 0;
    }

    /**
     * Clears only the rolling performance measurements while keeping the current mode active.
     */
    function resetPerformanceMeasurement() {
        previousPerformanceRenderLoopFrames = 0;
        previousPerformanceSampleTime = 0;
        previousPerformanceRenderedFrames = 0;
        performancePresentedFrames = 0;
        performanceRenderLoopFrames = 0;
        perf.fps = null;
        perf.renderFps = null;
        perf.frameTimeMs = null;
    }

    /** Enables or disables the slow debug loop depending on the current toggle. */
    function syncDebugInfoLoopState() {
        if (showDebugInfo) {
            refreshDebugInfoSnapshot();
            startDebugInfoLoop();
            return;
        }

        stopDebugInfoLoop();
    }

    /** Enables or disables the fast microphone level loop. */
    function syncMicrophoneLevelLoopState() {
        if (shouldSampleMicrophoneLevel()) {
            refreshDebugInfoSnapshot(false);
            startMicrophoneLevelLoop();
            return;
        }

        stopMicrophoneLevelLoop();
        destroyAudioAnalysis();
    }

    /** Enables or disables the performance measurement loops. */
    function syncPerformanceLoopState() {
        if (showPerformance) {
            refreshPerformanceSnapshot();
            startPerformanceLoop();
            return;
        }

        stopPerformanceLoop();
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
        syncMicrophoneLevelLoopState();
        return true;
    }

    /** Starts the slower debug overlay loop. */
    function startDebugInfoLoop() {
        stopDebugInfoLoop();

        const step = () => {
            refreshDebugInfoSnapshot();
            debugInfoLoopTimeoutId = window.setTimeout(
                step,
                DEBUG_INFO_SAMPLE_INTERVAL_MS,
            );
        };

        step();
    }

    /** Starts the faster microphone meter loop used by the bottom controls. */
    function startMicrophoneLevelLoop() {
        stopMicrophoneLevelLoop();

        const step = () => {
            refreshDebugInfoSnapshot(false);

            if (shouldSampleMicrophoneLevel() && !debug.microphoneMuted) {
                ensureAudioAnalysis();
                updateMicrophoneLevel();
                microphoneLevelLoopTimeoutId = window.setTimeout(
                    step,
                    MICROPHONE_LEVEL_SAMPLE_INTERVAL_MS,
                );
                return;
            }

            destroyAudioAnalysis();
            debug.microphoneLevel = 0;
            microphoneLevelLoopTimeoutId = null;
        };

        step();
    }

    /**
     * Tracks video-element frame presentation when the browser supports video frame callbacks.
     */
    function schedulePerformanceFrameCallback() {
        if (!showPerformance || !videoEl) {
            return;
        }

        performanceFrameCallbackId = requestPerformanceFrameCallback(
            videoEl,
            ({ presentedFrames }) => {
                performancePresentedFrames = presentedFrames;

                schedulePerformanceFrameCallback();
            },
        );
    }

    /**
     * Tracks the browser render loop through requestAnimationFrame.
     *
     * This is intentionally separate from video presented frames. The route exposes
     * both metrics because they answer different questions.
     */
    function schedulePerformanceRenderLoop() {
        if (!showPerformance) {
            return;
        }

        performanceRenderLoopFrameId = window.requestAnimationFrame(() => {
            performanceRenderLoopFrames += 1;
            schedulePerformanceRenderLoop();
        });
    }

    /**
     * Starts the rolling performance measurements.
     *
     * The route publishes values on a coarse interval instead of every animation frame
     * so the debug UI stays readable and does not create unnecessary reactive churn.
     */
    function startPerformanceLoop() {
        stopPerformanceLoop();
        schedulePerformanceFrameCallback();
        schedulePerformanceRenderLoop();

        const step = () => {
            if (videoEl && cameraState === "ready" && cameraEnabled) {
                const now = performance.now();
                const renderedFrames =
                    performancePresentedFrames ||
                    getRenderedFrameCount(videoEl);

                if (!previousPerformanceSampleTime) {
                    previousPerformanceSampleTime = now;
                    previousPerformanceRenderedFrames = renderedFrames ?? 0;
                    previousPerformanceRenderLoopFrames =
                        performanceRenderLoopFrames;
                } else {
                    const elapsed = now - previousPerformanceSampleTime;
                    if (elapsed > 0 && renderedFrames !== null) {
                        const renderedFramesDelta =
                            renderedFrames - previousPerformanceRenderedFrames;
                        if (renderedFramesDelta >= 0) {
                            perf.fps = (renderedFramesDelta * 1000) / elapsed;
                        }
                    }

                    const renderLoopFramesDelta =
                        performanceRenderLoopFrames -
                        previousPerformanceRenderLoopFrames;
                    if (elapsed > 0 && renderLoopFramesDelta > 0) {
                        perf.renderFps =
                            (renderLoopFramesDelta * 1000) / elapsed;
                        perf.frameTimeMs = elapsed / renderLoopFramesDelta;
                    }

                    previousPerformanceSampleTime = now;
                    previousPerformanceRenderLoopFrames =
                        performanceRenderLoopFrames;
                    previousPerformanceRenderedFrames =
                        renderedFrames ?? previousPerformanceRenderedFrames;
                }
            } else {
                perf.fps = null;
                perf.renderFps = null;
                perf.frameTimeMs = null;
                performanceRenderLoopFrames = 0;
                previousPerformanceRenderLoopFrames = 0;
                previousPerformanceSampleTime = 0;
                previousPerformanceRenderedFrames = 0;
            }

            refreshPerformanceSnapshot();
            performanceLoopTimeoutId = window.setTimeout(
                step,
                PERFORMANCE_SAMPLE_INTERVAL_MS,
            );
        };

        step();
    }

    /** Resets performance measurements when the page focus/visibility changes. */
    function handlePerformanceVisibilityReset() {
        resetPerformanceMeasurement();
        refreshPerformanceSnapshot();
    }

    /** Starts only the camera stream. */
    async function handleStart() {
        errorMessage = "";
        cameraState = "loading";

        try {
            cameraStream = await startCameraMedia(
                videoEl,
                buildCameraConstraints(getCurrentPreferences()),
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
                buildMediaConstraints(getCurrentPreferences()),
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
                buildMicrophoneConstraints(selectedAudioDeviceId),
            );
            microphoneEnabled = true;
            microphoneState = "ready";
            await refreshAvailableDevices();
            refreshOverlaySnapshots();
            syncDebugInfoLoopState();
            syncMicrophoneLevelLoopState();
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
        syncMicrophoneLevelLoopState();
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
        persistSettings();
        syncDebugInfoLoopState();
    }

    /** Persists and applies the performance overlay toggle. */
    function handlePerformanceToggle() {
        persistSettings();
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
                buildMediaConstraints(getCurrentPreferences()),
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
                buildCameraConstraints(getCurrentPreferences()),
            );
            setCameraStreamEnabled(shouldEnableCamera);
        }

        if (options.restartMicrophone) {
            microphoneStream = await startMicrophoneMedia(
                buildMicrophoneConstraints(selectedAudioDeviceId),
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
                    getCurrentPreferences(),
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
        persistSettings();
        await applyVideoPreferences();
    }

    /**
     * Restarts the active streams after a device change.
     *
     * The primary parameter identifies which device changed. If that device has no
     * active stream the handler skips the restart and only refreshes the device list.
     */
    async function handleDeviceChange(primary: "camera" | "microphone") {
        persistSettings();

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

    onMount(async () => {
        debug.browser = detectBrowserVersion();
        applyStoredPreferences(readCameraPreferences(localStorage));
        await handleStartAll();
        syncDebugInfoLoopState();
        syncMicrophoneLevelLoopState();
        syncPerformanceLoopState();

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
    });

    onDestroy(() => {
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

        stopDebugInfoLoop();
        stopMicrophoneLevelLoop();
        stopPerformanceLoop();
        destroyAudioAnalysis();
        handleStop();
        handleMicStop();
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
        bind:showDebugInfo
        bind:showPerformance
        bind:selectedQuality
        bind:selectedVideoDeviceId
        bind:selectedAudioDeviceId
        bind:videoDeviceOptions={availableVideoDevices}
        bind:audioDeviceOptions={availableAudioDevices}
        {isApplyingQuality}
        {cameraState}
        {microphoneState}
        onDebugInfoToggle={handleDebugInfoToggle}
        onPerformanceToggle={handlePerformanceToggle}
        onQualityChange={handleQualityChange}
        onVideoDeviceChange={() => handleDeviceChange("camera")}
        onAudioDeviceChange={() => handleDeviceChange("microphone")}
    />

    {#if showPerformance || showDebugInfo}
        <div class="overlay-stack">
            {#if showPerformance}
                <CameraPerformanceOverlay
                    measuredFps={perf.fps}
                    renderFps={perf.renderFps}
                    frameTimeMs={perf.frameTimeMs}
                    resolution={perf.resolution}
                    trackFrameRate={perf.trackFrameRate}
                    targetFrameRate={perf.targetFrameRate}
                    quality={selectedQuality}
                />
            {/if}

            {#if showDebugInfo}
                <CameraDebugOverlay
                    browser={debug.browser}
                    cameraMuted={debug.cameraMuted}
                    cameraName={debug.cameraName}
                    microphoneMuted={debug.microphoneMuted}
                    microphoneLevel={debug.microphoneLevelSnapshot}
                    microphoneName={debug.microphoneName}
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

            <div
                class="microphone-level-indicator"
                aria-hidden="true"
                data-active={shouldSampleMicrophoneLevel() &&
                    !debug.microphoneMuted}
            >
                {#each getMicrophoneLevelBars(debug.microphoneLevel) as isActive, index}
                    <span
                        class={`microphone-level-bar ${isActive ? getMicrophoneLevelBarTone(index) : ""}`}
                        class:microphone-level-bar-active={isActive}
                        style={`height: ${0.4 + index * 0.12}rem;`}
                    ></span>
                {/each}
            </div>
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

    .microphone-level-indicator {
        display: inline-flex;
        align-items: flex-end;
        gap: 0.16rem;
        min-width: 3rem;
        height: 1.5rem;
        padding: 0 0.1rem;
    }

    .microphone-level-bar {
        width: 0.22rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        opacity: 0.28;
        transition:
            opacity 140ms ease,
            background-color 140ms ease,
            transform 140ms ease;
    }

    .microphone-level-bar-active {
        opacity: 1;
        transform: translateY(-0.02rem);
    }

    .microphone-level-bar-active.bar-green {
        background: #7cff7c;
        box-shadow: 0 0 0.35rem rgba(124, 255, 124, 0.35);
    }

    .microphone-level-bar-active.bar-orange {
        background: #ffb347;
        box-shadow: 0 0 0.35rem rgba(255, 179, 71, 0.35);
    }

    .microphone-level-bar-active.bar-red {
        background: #ff5b5b;
        box-shadow: 0 0 0.35rem rgba(255, 91, 91, 0.35);
    }

    .microphone-level-indicator[data-active="false"]
        .microphone-level-bar-active,
    .microphone-level-indicator[data-active="false"] .microphone-level-bar {
        background: rgba(255, 255, 255, 0.22);
        opacity: 0.28;
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

        .microphone-level-indicator {
            min-width: 2.6rem;
        }
    }
</style>
