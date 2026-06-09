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
    import CameraOverlaysStack from "$lib/components/camera/CameraOverlaysStack.svelte";
    import CameraEffectsPanel from "$lib/components/camera/CameraEffectsPanel.svelte";
    import RoomParticipantsGrid from "$lib/components/camera/RoomParticipantsGrid.svelte";
    import CameraSettingsMenu from "$lib/components/camera/CameraSettingsMenu.svelte";
    import MediaControls from "$lib/components/camera/MediaControls.svelte";
    import MediaToggleButton from "$lib/components/camera/MediaToggleButton.svelte";
    import MicrophoneLevelIndicator from "$lib/components/camera/MicrophoneLevelIndicator.svelte";
    import MediaPlaceholder from "$lib/components/camera/MediaPlaceholder.svelte";
    import Banner from "$lib/components/camera/Banner.svelte";
    import ErrorBanner from "$lib/components/camera/ErrorBanner.svelte";
    import { createRoom, joinRoom } from "$lib/calls/rooms-api";
    import {
        createDefaultCameraEffectsState,
        normalizeEffectsState,
        updateEffectAsset,
    } from "$lib/camera/effects";
    import { drawCameraEffectsOverlay } from "$lib/camera/effects-renderer";
    import { ThreeMaskRenderer } from "$lib/camera/three-mask-renderer";
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
    import {
        startFaceTracking,
        type FaceLandmarkerResult,
    } from "$lib/camera/tracking";
    import {
        ConnectionQuality,
        Room,
        RoomEvent,
        Track,
        type LocalTrackPublication,
        type Participant,
        type RemoteParticipant,
        type RemoteTrack,
        type RemoteTrackPublication,
    } from "livekit-client";

    let videoEl: HTMLVideoElement;
    let backgroundCanvasEl: HTMLCanvasElement;
    let effectsCanvasEl: HTMLCanvasElement;
    let effects3dCanvasEl: HTMLCanvasElement;
    let stopFaceTracking: (() => void) | null = null;
    let threeMaskRenderer: ThreeMaskRenderer | null = null;
    let latestFaceResult: FaceLandmarkerResult | null = null;
    let cameraStream = $state<MediaStream | null>(null);
    let microphoneStream = $state<MediaStream | null>(null);
    let cameraState = $state<CameraState>("idle");
    let microphoneState = $state<CameraState>("idle");
    let cameraEnabled = $state(false);
    let microphoneEnabled = $state(false);
    let errorMessage = $state("");
    let infoMessage = $state("");
    let showDebugInfo = $state(false);
    let showPerformance = $state(false);
    let selectedQuality = $state<VideoQuality>("720p");
    let selectedVideoDeviceId = $state("");
    let selectedAudioDeviceId = $state("");
    let isApplyingQuality = $state(false);
    let availableVideoDevices = $state<DeviceOption[]>([]);
    let availableAudioDevices = $state<DeviceOption[]>([]);
    let infoBrowser = $state("Unknown");
    let infoCameraName = $state("-");
    let infoMicrophoneName = $state("-");
    let infoMicrophoneLevel = $state(0);
    let infoMicrophoneLevelSnapshot = $state(0);
    let infoMicrophoneMuted = $state(true);
    let infoCameraMuted = $state(true);
    let performanceFps = $state<number | null>(null);
    let performanceRenderFps = $state<number | null>(null);
    let performanceFrameTimeMs = $state<number | null>(null);
    let performanceTrackFrameRate = $state<number | null>(null);
    let performanceTargetFrameRate = $state<number | ConstrainULong | null>(
        null,
    );
    let performanceResolution = $state<{
        width: number | null;
        height: number | null;
    } | null>(null);
    let infoAudioContext: AudioContext | null = null;
    let infoAudioSource: MediaStreamAudioSourceNode | null = null;
    let infoAnalyser: AnalyserNode | null = null;
    let showEffectsPanel = $state(false);
    let publishMaskOnly = $state(false);
    let cameraEffects = $state(createDefaultCameraEffectsState());
    let livekitRoom: Room | null = null;
    let activeRoomName = $state<string | null>(null);
    let roomConnectionState = $state<
        "disconnected" | "connecting" | "connected" | "error"
    >("disconnected");
    let roomConnectionError = $state("");
    let lastParticipantCount = $state(0);
    let participantTiles = $state<
        {
            id: string;
            name: string;
            isLocal: boolean;
            isSpeaking: boolean;
            connectionQuality: string;
            cameraOn: boolean;
            microphoneOn: boolean;
            stream: MediaStream | null;
        }[]
    >([]);

    const participantStreams = new Map<string, MediaStream>();
    let localPreviewStream: MediaStream | null = null;
    let compositionCanvasEl: HTMLCanvasElement | null = null;
    let compositionFrameId: number | null = null;
    let compositionTrack: MediaStreamTrack | null = null;
    let publishedVideoPublication: LocalTrackPublication | null = null;
    let publishedAudioPublication: LocalTrackPublication | null = null;
    let publishedVideoTrack: MediaStreamTrack | null = null;
    let publishedAudioTrack: MediaStreamTrack | null = null;
    const ROOM_NAME_STORAGE_KEY = "amphi.room.name";
    const USER_NAME_STORAGE_KEY = "amphi.user.name";
    let infoMessageTimeoutId: number | null = null;
    let roomErrorTimeoutId: number | null = null;
    let effectsResizeObserver: ResizeObserver | null = null;
    let publishSyncChain: Promise<void> = Promise.resolve();
    let roomSessionId = 0;
    let compositionBackgroundImage: HTMLImageElement | null = null;
    let compositionBackgroundUrl: string | null = null;
    let compositionLastDrawAt = 0;

    // Tunable performance constants.
    const DEBUG_INFO_SAMPLE_INTERVAL_MS = 1500;
    const PERFORMANCE_SAMPLE_INTERVAL_MS = 1500;
    const MICROPHONE_LEVEL_SAMPLE_INTERVAL_MS = 32;
    const COMPOSITION_FPS_CONNECTED_DESKTOP = 24;
    const COMPOSITION_FPS_CONNECTED_MOBILE = 21;
    const COMPOSITION_FPS_IDLE = 8;
    const FACE_TRACKING_FPS_DESKTOP = 16;
    const FACE_TRACKING_FPS_MOBILE = 16;
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


    function getCurrentPreferences(): CameraPreferences {
        return {
            showDebugInfo,
            showPerformance,
            selectedQuality,
            selectedVideoDeviceId,
            selectedAudioDeviceId,
            publishMaskOnly,
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
        publishMaskOnly = preferences.publishMaskOnly;
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
        infoCameraName = videoTrack?.label || "-";
        infoMicrophoneName = audioTrack?.label || "-";
        infoCameraMuted =
            !cameraStream ||
            !videoTrack ||
            videoTrack.muted ||
            !videoTrack.enabled ||
            cameraState !== "ready";
        infoMicrophoneMuted =
            !microphoneStream ||
            !audioTrack ||
            audioTrack.muted ||
            !audioTrack.enabled ||
            microphoneState !== "ready";

        if (infoMicrophoneMuted) {
            infoMicrophoneLevel = 0;
        }

        if (includeMicrophoneLevelSnapshot) {
            infoMicrophoneLevelSnapshot = infoMicrophoneLevel;
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

        performanceResolution = settings
            ? {
                  width: settings.width ?? null,
                  height: settings.height ?? null,
              }
            : null;
        performanceTrackFrameRate = settings?.frameRate ?? null;
        performanceTargetFrameRate =
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
        if (
            !microphoneStream ||
            infoAudioContext ||
            infoAudioSource ||
            infoAnalyser
        )
            return;

        try {
            infoAudioContext = new AudioContext();
            infoAnalyser = infoAudioContext.createAnalyser();
            /** Smaller FFT windows make the visual meter react faster to speech attacks. */
            infoAnalyser.fftSize = 512;
            infoAnalyser.smoothingTimeConstant = 0.12;
            infoAudioSource =
                infoAudioContext.createMediaStreamSource(microphoneStream);
            infoAudioSource.connect(infoAnalyser);
            void infoAudioContext.resume();
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
        if (!infoAnalyser) return;

        const buffer = new Uint8Array(infoAnalyser.fftSize);
        infoAnalyser.getByteTimeDomainData(buffer);

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

        if (nextLevel >= infoMicrophoneLevel) {
            infoMicrophoneLevel =
                infoMicrophoneLevel * (1 - MICROPHONE_ATTACK_BLEND) +
                nextLevel * MICROPHONE_ATTACK_BLEND;
            return;
        }

        infoMicrophoneLevel = Math.max(
            nextLevel,
            infoMicrophoneLevel * MICROPHONE_DECAY_FACTOR,
        );
    }

    /**
     * Tears down the audio analysis graph used by the microphone meter.
     */
    function destroyAudioAnalysis() {
        if (infoAudioSource) {
            try {
                infoAudioSource.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            infoAudioSource = null;
        }

        if (infoAnalyser) {
            try {
                infoAnalyser.disconnect();
            } catch {
                // Ignore cleanup errors.
            }
            infoAnalyser = null;
        }

        if (infoAudioContext && infoAudioContext.state !== "closed") {
            void infoAudioContext.close();
        }

        infoAudioContext = null;
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

        infoMicrophoneLevel = 0;
        infoMicrophoneLevelSnapshot = 0;
    }

    /**
     * Stops all performance-related loops and resets the derived metrics.
     */
    function stopPerformanceLoop() {
        if (performanceLoopTimeoutId !== null) {
            clearTimeout(performanceLoopTimeoutId);
            performanceLoopTimeoutId = null;
        }

        if (
            performanceRenderLoopFrameId !== null &&
            typeof window !== "undefined"
        ) {
            window.cancelAnimationFrame(performanceRenderLoopFrameId);
        }
        performanceRenderLoopFrameId = null;

        if (videoEl) {
            cancelPerformanceFrameCallback(videoEl, performanceFrameCallbackId);
        }
        performanceFrameCallbackId = null;
        performancePresentedFrames = 0;
        performanceRenderLoopFrames = 0;
        performanceFps = null;
        performanceRenderFps = null;
        performanceFrameTimeMs = null;
        performanceTrackFrameRate = null;
        performanceTargetFrameRate =
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
        performanceFps = null;
        performanceRenderFps = null;
        performanceFrameTimeMs = null;
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

    function syncEffectsCanvasSize() {
        if (!effectsCanvasEl || !videoEl) {
            return;
        }

        const width = Math.max(1, Math.round(videoEl.clientWidth));
        const height = Math.max(1, Math.round(videoEl.clientHeight));

        if (backgroundCanvasEl) {
            if (
                backgroundCanvasEl.width !== width ||
                backgroundCanvasEl.height !== height
            ) {
                backgroundCanvasEl.width = width;
                backgroundCanvasEl.height = height;
            }
        }

        if (effectsCanvasEl.width !== width || effectsCanvasEl.height !== height) {
            effectsCanvasEl.width = width;
            effectsCanvasEl.height = height;
        }

        if (effects3dCanvasEl) {
            if (
                effects3dCanvasEl.width !== width ||
                effects3dCanvasEl.height !== height
            ) {
                effects3dCanvasEl.width = width;
                effects3dCanvasEl.height = height;
            }
        }

        if (threeMaskRenderer) {
            threeMaskRenderer.resize(width, height);
        }
    }

    function renderBackgroundOverlay() {
        if (!backgroundCanvasEl || !videoEl) {
            return;
        }

        syncEffectsCanvasSize();
        const ctx = backgroundCanvasEl.getContext("2d");
        if (!ctx) {
            return;
        }

        const width = backgroundCanvasEl.width;
        const height = backgroundCanvasEl.height;
        ctx.clearRect(0, 0, width, height);

        if (!publishMaskOnly || roomConnectionState !== "connected") {
            drawBackgroundFrame(ctx, width, height);
        }
    }

    function renderEffectsOverlay(result = latestFaceResult) {
        if (!effectsCanvasEl || !videoEl) {
            return;
        }

        syncEffectsCanvasSize();

        const ctx = effectsCanvasEl.getContext("2d");
        if (!ctx) {
            return;
        }

        drawCameraEffectsOverlay(
            ctx,
            videoEl,
            result,
            normalizeEffectsState(cameraEffects),
            { drawBackground: false },
        );

        threeMaskRenderer?.render(
            result,
            videoEl,
            normalizeEffectsState(cameraEffects),
        );
    }

    async function sync3dMaskModel() {
        if (!threeMaskRenderer) {
            return;
        }

        if (cameraEffects.mode !== "mask-3d") {
            await threeMaskRenderer.setModelUrl(null);
            return;
        }

        await threeMaskRenderer.setModelUrl(cameraEffects.mask3d.url);
    }

    function stopEffectsTracking() {
        if (stopFaceTracking) {
            stopFaceTracking();
            stopFaceTracking = null;
        }
        latestFaceResult = null;
        renderEffectsOverlay(null);
    }

    function syncEffectsTracking() {
        const shouldTrackFace =
            cameraEffects.mode !== "off" || cameraEffects.showLandmarksDebug;

        if (
            !videoEl ||
            !cameraEnabled ||
            cameraState !== "ready" ||
            !shouldTrackFace
        ) {
            stopEffectsTracking();
            return;
        }

        if (stopFaceTracking) {
            return;
        }

        const isMobileViewport =
            typeof window !== "undefined" &&
            window.matchMedia("(max-width: 900px)").matches;
        const trackingFps = isMobileViewport
            ? FACE_TRACKING_FPS_MOBILE
            : FACE_TRACKING_FPS_DESKTOP;

        stopFaceTracking = startFaceTracking(
            videoEl,
            (result) => {
                latestFaceResult = result;
                renderEffectsOverlay(result);
            },
            {
                targetFps: trackingFps,
                suspendWhenHidden: true,
            },
        );
    }

    function handleUploadFunnyMask(file: File | null) {
        cameraEffects.funnyMask = updateEffectAsset(cameraEffects.funnyMask, file);
        if (file) {
            cameraEffects.mode = "funny-mask";
        }
        renderEffectsOverlay();
    }

    async function handleUploadMask3d(file: File | null) {
        cameraEffects.mask3d = updateEffectAsset(cameraEffects.mask3d, file);
        if (file) {
            cameraEffects.mode = "mask-3d";
        }
        try {
            await sync3dMaskModel();
        } catch (error) {
            errorMessage = getMediaErrorMessage("camera", error);
        }
        renderEffectsOverlay();
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
        syncEffectsTracking();
        if (!enabled) {
            renderEffectsOverlay(null);
        }
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
        if (!enabled) {
            infoMicrophoneLevel = 0;
            infoMicrophoneLevelSnapshot = 0;
        }
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

            if (shouldSampleMicrophoneLevel() && !infoMicrophoneMuted) {
                ensureAudioAnalysis();
                updateMicrophoneLevel();
                microphoneLevelLoopTimeoutId = window.setTimeout(
                    step,
                    MICROPHONE_LEVEL_SAMPLE_INTERVAL_MS,
                );
                return;
            }

            destroyAudioAnalysis();
            infoMicrophoneLevel = 0;
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
     * This is intentionally separate from video-presented frames. The route exposes
     * both metrics because they answer different questions.
     */
    function schedulePerformanceRenderLoop() {
        if (!showPerformance || typeof window === "undefined") {
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
     * The route publishes values on a coarse interval instead of every animation frame,
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
                            performanceFps =
                                (renderedFramesDelta * 1000) / elapsed;
                        }
                    }

                    const renderLoopFramesDelta =
                        performanceRenderLoopFrames -
                        previousPerformanceRenderLoopFrames;
                    if (elapsed > 0 && renderLoopFramesDelta > 0) {
                        performanceRenderFps =
                            (renderLoopFramesDelta * 1000) / elapsed;
                        performanceFrameTimeMs = performanceRenderFps
                            ? 1000 / performanceRenderFps
                            : null;
                    }

                    previousPerformanceSampleTime = now;
                    previousPerformanceRenderLoopFrames =
                        performanceRenderLoopFrames;
                    previousPerformanceRenderedFrames =
                        renderedFrames ?? previousPerformanceRenderedFrames;
                }
            } else {
                performanceFps = null;
                performanceRenderFps = null;
                performanceFrameTimeMs = null;
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
            syncEffectsTracking();
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
            syncEffectsTracking();
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
        stopEffectsTracking();
    }

    /** User-facing camera toggle handler. */
    async function handleToggle() {
        if (cameraStream && setCameraStreamEnabled(!cameraEnabled)) {
            if (roomConnectionState === "connected") {
                void queueSyncPublishedTracks();
                rebuildParticipantTiles();
            }
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
            if (roomConnectionState === "connected") {
                void queueSyncPublishedTracks();
                rebuildParticipantTiles();
            }
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

    function handlePublishMaskOnlyToggle() {
        persistSettings();
        renderEffectsOverlay(null);
        if (roomConnectionState === "connected") {
            void queueSyncPublishedTracks();
        }
    }

    function resetMaskOnlyOutsideRoom() {
        if (activeRoomName || roomConnectionState === "connected") {
            return;
        }

        if (!publishMaskOnly) {
            return;
        }

        publishMaskOnly = false;
        persistSettings();
        renderEffectsOverlay(null);
    }

    /**
     * Restarts whichever streams are currently required after device or quality changes.
     *
     * The function remembers whether camera and microphone were soft-enabled before the
     * restart and restores those flags afterward.
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
        if (hasMicrophone) {
            microphoneState = "loading";
        }

        try {
            if (forceRestart) {
                throw new DOMException(
                    "Restart required",
                    "OverconstrainedError",
                );
            }

            if (
                !videoTrack ||
                typeof videoTrack.applyConstraints !== "function"
            ) {
                throw new Error("applyConstraints is not supported.");
            }

            let lastConstraintError: unknown = null;
            let didApplyConstraints = false;

            for (const constraints of getApplyConstraintCandidates(
                getCurrentPreferences(),
            )) {
                try {
                    await videoTrack.applyConstraints(constraints);
                    didApplyConstraints = true;
                    break;
                } catch (constraintError) {
                    lastConstraintError = constraintError;
                }
            }

            if (!didApplyConstraints) {
                throw lastConstraintError;
            }

            cameraState = "ready";
            if (hasMicrophone) {
                microphoneState = "ready";
            }
            refreshOverlaySnapshots();
            syncEffectsTracking();
        } catch (error) {
            const shouldRestart =
                !(error instanceof DOMException) ||
                error.name === "OverconstrainedError" ||
                error.name === "ConstraintNotSatisfiedError";

            if (!shouldRestart) {
                cameraState = "error";
                if (hasMicrophone) {
                    microphoneState = "error";
                    errorMessage = getMediaErrorMessage("media", error);
                } else {
                    errorMessage = getMediaErrorMessage("camera", error);
                }
                return;
            }

            try {
                if (hasMicrophone) {
                    await restartActiveMedia({
                        restartCamera: true,
                        restartMicrophone: true,
                    });
                    cameraState = "ready";
                    microphoneState = "ready";
                    refreshOverlaySnapshots();
                    syncEffectsTracking();
                    return;
                }

                await restartActiveMedia({
                    restartCamera: true,
                    restartMicrophone: false,
                });
                cameraState = "ready";
                refreshOverlaySnapshots();
                syncEffectsTracking();
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

    /** Restarts the active streams after a camera device change. */
    async function handleVideoDeviceChange() {
        persistSettings();

        if (!cameraStream) {
            await refreshAvailableDevices();
            return;
        }

        cameraState = "loading";
        if (microphoneStream) {
            microphoneState = "loading";
        }

        try {
            await restartActiveMedia({
                restartCamera: true,
                restartMicrophone: Boolean(microphoneStream),
            });
            cameraState = "ready";
            syncEffectsTracking();
            if (microphoneStream) {
                microphoneState = "ready";
            }
            refreshOverlaySnapshots();
        } catch (error) {
            cameraState = "error";
            if (microphoneStream) {
                microphoneState = "error";
                errorMessage = getMediaErrorMessage("media", error);
            } else {
                errorMessage = getMediaErrorMessage("camera", error);
            }
        }
    }

    /** Restarts the active streams after a microphone device change. */
    async function handleAudioDeviceChange() {
        persistSettings();

        if (!microphoneStream) {
            await refreshAvailableDevices();
            return;
        }

        microphoneState = "loading";
        if (cameraStream) {
            cameraState = "loading";
        }

        try {
            await restartActiveMedia({
                restartCamera: Boolean(cameraStream),
                restartMicrophone: true,
            });
            microphoneState = "ready";
            if (cameraStream) {
                cameraState = "ready";
                syncEffectsTracking();
            }
            refreshOverlaySnapshots();
        } catch (error) {
            microphoneState = "error";
            if (cameraStream) {
                cameraState = "error";
                errorMessage = getMediaErrorMessage("media", error);
            } else {
                errorMessage = getMediaErrorMessage("microphone", error);
            }
        }
    }

    /** Refreshes device lists when the browser reports a hardware change. */
    async function handleMediaDevicesChange() {
        await refreshAvailableDevices();
    }

    function handleEffectsResize() {
        syncEffectsCanvasSize();
        renderEffectsOverlay();
    }

    function showInfoBanner(message: string, durationMs = 2200) {
        if (infoMessageTimeoutId !== null) {
            clearTimeout(infoMessageTimeoutId);
            infoMessageTimeoutId = null;
        }

        infoMessage = message;
        infoMessageTimeoutId = window.setTimeout(() => {
            infoMessage = "";
            infoMessageTimeoutId = null;
        }, durationMs);
    }

    function showRoomError(message: string, durationMs = 3600) {
        if (roomErrorTimeoutId !== null) {
            clearTimeout(roomErrorTimeoutId);
            roomErrorTimeoutId = null;
        }

        roomConnectionState = "error";
        roomConnectionError = message;

        roomErrorTimeoutId = window.setTimeout(() => {
            if (roomConnectionState === "error" && roomConnectionError === message) {
                roomConnectionState = "disconnected";
                roomConnectionError = "";
            }
            roomErrorTimeoutId = null;
        }, durationMs);
    }

    function drawCoverVideoFrame(
        ctx: CanvasRenderingContext2D,
        source: CanvasImageSource,
        sourceWidth: number,
        sourceHeight: number,
        targetWidth: number,
        targetHeight: number,
    ) {
        if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
            return;
        }

        const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        const drawX = (targetWidth - drawWidth) / 2;
        const drawY = (targetHeight - drawHeight) / 2;
        ctx.drawImage(source, drawX, drawY, drawWidth, drawHeight);
    }

    function ensureCompositionCanvas() {
        if (!compositionCanvasEl) {
            compositionCanvasEl = document.createElement("canvas");
        }
        return compositionCanvasEl;
    }

    function stopCompositionLoop() {
        if (compositionFrameId !== null) {
            window.cancelAnimationFrame(compositionFrameId);
            compositionFrameId = null;
        }

        if (compositionTrack) {
            compositionTrack.stop();
            compositionTrack = null;
        }

        localPreviewStream = null;
    }

    function updateCompositionBackgroundImage(url: string | null) {
        if (!url) {
            compositionBackgroundImage = null;
            compositionBackgroundUrl = null;
            return;
        }

        if (compositionBackgroundUrl === url && compositionBackgroundImage?.complete) {
            return;
        }

        const image = new Image();
        image.src = url;
        compositionBackgroundUrl = url;
        image.onload = () => {
            if (compositionBackgroundUrl === url) {
                compositionBackgroundImage = image;
            }
        };
    }

    function drawBackgroundFrame(
        context: CanvasRenderingContext2D,
        width: number,
        height: number,
    ) {
        const background = cameraEffects.background;
        updateCompositionBackgroundImage(background.url);

        if (!compositionBackgroundImage || background.opacity <= 0) {
            return;
        }

        const imageWidth = Math.max(1, compositionBackgroundImage.naturalWidth || width);
        const imageHeight = Math.max(1, compositionBackgroundImage.naturalHeight || height);
        const coverScale = Math.max(width / imageWidth, height / imageHeight);
        const drawWidth = imageWidth * coverScale * background.scale;
        const drawHeight = imageHeight * coverScale * background.scale;
        const drawX = (width - drawWidth) / 2 + width * background.offsetX;
        const drawY = (height - drawHeight) / 2 + height * background.offsetY;

        context.save();
        context.globalAlpha = background.opacity;
        context.drawImage(compositionBackgroundImage, drawX, drawY, drawWidth, drawHeight);
        context.restore();
    }

    function startCompositionLoop() {
        if (!videoEl || !cameraStream) {
            stopCompositionLoop();
            return;
        }

        if (compositionFrameId !== null && compositionTrack) {
            return;
        }

        const canvas = ensureCompositionCanvas();
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
            return;
        }

        const stream = canvas.captureStream(COMPOSITION_FPS_CONNECTED_DESKTOP);
        const [track] = stream.getVideoTracks();
        if (track) {
            compositionTrack = track;
        }

        compositionLastDrawAt = 0;

        const step = () => {
            const now = performance.now();
            const isMobileViewport =
                typeof window !== "undefined" &&
                window.matchMedia("(max-width: 900px)").matches;
            const targetFps =
                roomConnectionState === "connected"
                    ? isMobileViewport
                        ? COMPOSITION_FPS_CONNECTED_MOBILE
                        : COMPOSITION_FPS_CONNECTED_DESKTOP
                    : COMPOSITION_FPS_IDLE;
            const minFrameInterval = 1000 / targetFps;
            if (compositionLastDrawAt && now - compositionLastDrawAt < minFrameInterval) {
                compositionFrameId = window.requestAnimationFrame(step);
                return;
            }
            compositionLastDrawAt = now;

            const width = Math.max(1, videoEl.videoWidth || 1280);
            const height = Math.max(1, videoEl.videoHeight || 720);
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            context.clearRect(0, 0, width, height);

            if (backgroundCanvasEl) {
                context.drawImage(backgroundCanvasEl, 0, 0, width, height);
            }

            if (!publishMaskOnly && cameraEnabled) {
                drawCoverVideoFrame(
                    context,
                    videoEl,
                    videoEl.videoWidth,
                    videoEl.videoHeight,
                    width,
                    height,
                );
            } else {
                context.fillStyle = "#020617";
                context.fillRect(0, 0, width, height);
            }

            if (effects3dCanvasEl) {
                context.drawImage(effects3dCanvasEl, 0, 0, width, height);
            }
            if (effectsCanvasEl) {
                context.drawImage(effectsCanvasEl, 0, 0, width, height);
            }

            compositionFrameId = window.requestAnimationFrame(step);
        };

        compositionFrameId = window.requestAnimationFrame(step);
    }

    function handleUploadBackground(file: File | null) {
        cameraEffects.background = updateEffectAsset(cameraEffects.background, file);
        renderBackgroundOverlay();
        renderEffectsOverlay();

        // Repaint once the uploaded image is actually decoded to avoid a black frame.
        if (cameraEffects.background.url) {
            const image = new Image();
            image.onload = () => {
                renderEffectsOverlay(null);
            };
            image.src = cameraEffects.background.url;
        }
    }

    function getConnectionQualityLabel(quality: ConnectionQuality | undefined) {
        if (quality === undefined) {
            return "unknown";
        }

        const qualityLabel =
            typeof quality === "number"
                ? String((ConnectionQuality as unknown as Record<number, string>)[quality] || "unknown")
                : String(quality);

        return qualityLabel.toLowerCase();
    }

    function getTrackMediaStreamTrack(track: unknown): MediaStreamTrack | null {
        if (!track || typeof track !== "object") {
            return null;
        }

        const maybeTrack = (track as { mediaStreamTrack?: MediaStreamTrack })
            .mediaStreamTrack;
        return maybeTrack instanceof MediaStreamTrack ? maybeTrack : null;
    }

    function getOrCreateParticipantStream(identity: string) {
        const existing = participantStreams.get(identity);
        if (existing) {
            return existing;
        }

        const stream = new MediaStream();
        participantStreams.set(identity, stream);
        return stream;
    }

    function buildLocalPreviewStream() {
        if (!compositionTrack && !microphoneStream) {
            localPreviewStream = null;
            return null;
        }

        const stream = localPreviewStream ?? new MediaStream();
        const videoTrack = compositionTrack ?? cameraStream?.getVideoTracks()[0] ?? null;
        const audioTrack = microphoneStream?.getAudioTracks()[0] ?? null;

        const currentVideoTrack = stream.getVideoTracks()[0] ?? null;
        const currentAudioTrack = stream.getAudioTracks()[0] ?? null;

        if (!videoTrack && currentVideoTrack) {
            stream.removeTrack(currentVideoTrack);
        }
        if (
            videoTrack &&
            (!currentVideoTrack || currentVideoTrack.id !== videoTrack.id)
        ) {
            if (currentVideoTrack) {
                stream.removeTrack(currentVideoTrack);
            }
            stream.addTrack(videoTrack);
        }

        if (!audioTrack && currentAudioTrack) {
            stream.removeTrack(currentAudioTrack);
        }
        if (
            audioTrack &&
            (!currentAudioTrack || currentAudioTrack.id !== audioTrack.id)
        ) {
            if (currentAudioTrack) {
                stream.removeTrack(currentAudioTrack);
            }
            stream.addTrack(audioTrack);
        }

        localPreviewStream = stream;
        return stream;
    }

    function rebuildParticipantTiles() {
        if (!livekitRoom || roomConnectionState !== "connected") {
            participantTiles = [];
            return;
        }

        const localParticipant = livekitRoom.localParticipant;
        const tiles = [
            {
                id: localParticipant.identity || "local",
                name: localParticipant.name || localParticipant.identity || "You",
                isLocal: true,
                isSpeaking: localParticipant.isSpeaking,
                connectionQuality: getConnectionQualityLabel(
                    localParticipant.connectionQuality,
                ),
                cameraOn: cameraEnabled,
                microphoneOn: microphoneEnabled,
                stream: buildLocalPreviewStream(),
            },
        ];

        for (const participant of livekitRoom.remoteParticipants.values()) {
            const identity = participant.identity;
            const hasRemoteCamera = [...participant.trackPublications.values()].some(
                (publication) =>
                    publication.kind === "video" &&
                    publication.source === Track.Source.Camera &&
                    Boolean(publication.track) &&
                    !publication.isMuted,
            );
            const hasRemoteMic = [...participant.trackPublications.values()].some(
                (publication) =>
                    publication.kind === "audio" &&
                    publication.source === Track.Source.Microphone &&
                    Boolean(publication.track) &&
                    !publication.isMuted,
            );
            tiles.push({
                id: identity,
                name: participant.name || identity,
                isLocal: false,
                isSpeaking: participant.isSpeaking,
                connectionQuality: getConnectionQualityLabel(
                    participant.connectionQuality,
                ),
                cameraOn: hasRemoteCamera,
                microphoneOn: hasRemoteMic,
                stream: participantStreams.get(identity) ?? null,
            });
        }

        if (roomConnectionState === "connected" && lastParticipantCount !== 0) {
            if (tiles.length > lastParticipantCount) {
                showInfoBanner("A participant joined the room.");
            } else if (tiles.length < lastParticipantCount) {
                showInfoBanner("A participant left the room.");
            }
        }
        lastParticipantCount = tiles.length;
        participantTiles = tiles;
    }

    function addTrackToParticipantStream(participant: Participant | RemoteParticipant, track: unknown) {
        const mediaTrack = getTrackMediaStreamTrack(track);
        if (!mediaTrack) {
            return;
        }

        const stream = getOrCreateParticipantStream(participant.identity);
        const existing = stream
            .getTracks()
            .find((item) => item.id === mediaTrack.id || item.kind === mediaTrack.kind);
        if (existing) {
            stream.removeTrack(existing);
        }

        stream.addTrack(mediaTrack);
        rebuildParticipantTiles();
    }

    function removeTrackFromParticipantStream(participant: Participant | RemoteParticipant, track: unknown) {
        const mediaTrack = getTrackMediaStreamTrack(track);
        if (!mediaTrack) {
            return;
        }

        const stream = participantStreams.get(participant.identity);
        if (!stream) {
            return;
        }

        stream.getTracks().forEach((item) => {
            if (item.id === mediaTrack.id || item.kind === mediaTrack.kind) {
                stream.removeTrack(item);
            }
        });

        if (stream.getTracks().length === 0) {
            participantStreams.delete(participant.identity);
        }

        rebuildParticipantTiles();
    }

    function queueSyncPublishedTracks() {
        const activeSession = roomSessionId;
        publishSyncChain = publishSyncChain
            .then(async () => {
                await syncPublishedTracks(activeSession);
            })
            .catch((error) => {
                roomConnectionError = getMediaErrorMessage("media", error);
            });
        return publishSyncChain;
    }

    function findPublishedTrackById(kind: "video" | "audio", trackId: string) {
        if (!livekitRoom) {
            return null;
        }

        for (const publication of livekitRoom.localParticipant.trackPublications.values()) {
            const mediaTrack = publication.track?.mediaStreamTrack;
            if (publication.kind === kind && mediaTrack && mediaTrack.id === trackId) {
                return publication as LocalTrackPublication;
            }
        }

        return null;
    }

    function shouldUseCompositedVideoTrack() {
        if (roomConnectionState === "connected") {
            // Keep a single stable video source in-room to avoid publish source swaps
            // when toggling effects (e.g., FunnyMask), which can freeze some clients.
            return true;
        }

        return (
            cameraEffects.mode !== "off" ||
            cameraEffects.showLandmarksDebug ||
            publishMaskOnly ||
            Boolean(cameraEffects.background.url && cameraEffects.background.opacity > 0)
        );
    }

    async function syncPublishedTracks(sessionId = roomSessionId) {
        if (!livekitRoom || roomConnectionState !== "connected" || sessionId !== roomSessionId) {
            return;
        }

        const useCompositedTrack = shouldUseCompositedVideoTrack();
        if (useCompositedTrack && !compositionTrack && cameraStream) {
            startCompositionLoop();
        }
        if (!useCompositedTrack) {
            stopCompositionLoop();
        }

        const nextVideoTrack = useCompositedTrack
            ? compositionTrack
            : (cameraStream?.getVideoTracks()[0] ?? null);
        const nextAudioTrack = microphoneStream?.getAudioTracks()[0] ?? null;

        if (publishedVideoPublication && !publishedVideoPublication.track) {
            publishedVideoPublication = null;
            publishedVideoTrack = null;
        }
        if (publishedAudioPublication && !publishedAudioPublication.track) {
            publishedAudioPublication = null;
            publishedAudioTrack = null;
        }

        // Unpublish only when the track source truly changed.
        if (publishedVideoPublication && nextVideoTrack && publishedVideoTrack !== nextVideoTrack) {
            try {
                if (publishedVideoPublication.track) {
                    await livekitRoom.localParticipant.unpublishTrack(publishedVideoPublication.track);
                }
            } catch {
                // ignore if already gone
            }
            publishedVideoPublication = null;
            publishedVideoTrack = null;
        }

        // Replace stale audio source only when the source track itself changes.
        if (publishedAudioPublication && nextAudioTrack && publishedAudioTrack !== nextAudioTrack) {
            try {
                if (publishedAudioPublication.track) {
                    await livekitRoom.localParticipant.unpublishTrack(publishedAudioPublication.track);
                }
            } catch {
                // ignore if already gone
            }
            publishedAudioPublication = null;
            publishedAudioTrack = null;
        }

        if (!nextVideoTrack && publishedVideoPublication) {
            try {
                if (publishedVideoPublication.track) {
                    await livekitRoom.localParticipant.unpublishTrack(publishedVideoPublication.track);
                }
            } catch {
                // ignore
            }
            publishedVideoPublication = null;
            publishedVideoTrack = null;
        }

        if (!nextAudioTrack && publishedAudioPublication) {
            try {
                if (publishedAudioPublication.track) {
                    await livekitRoom.localParticipant.unpublishTrack(publishedAudioPublication.track);
                }
            } catch {
                // ignore
            }
            publishedAudioPublication = null;
            publishedAudioTrack = null;
        }

        if (nextVideoTrack && !publishedVideoPublication) {
            publishedVideoPublication = findPublishedTrackById("video", nextVideoTrack.id);
            publishedVideoTrack = publishedVideoPublication
                ? nextVideoTrack
                : publishedVideoTrack;
        }

        if (nextAudioTrack && !publishedAudioPublication) {
            publishedAudioPublication = findPublishedTrackById("audio", nextAudioTrack.id);
            publishedAudioTrack = publishedAudioPublication
                ? nextAudioTrack
                : publishedAudioTrack;
        }

        // Publish current video source once.
        if (nextVideoTrack && !publishedVideoPublication) {
            const pub = await livekitRoom.localParticipant.publishTrack(nextVideoTrack, {
                source: Track.Source.Camera,
            });
            publishedVideoPublication = pub;
            publishedVideoTrack = nextVideoTrack;
        }

        // Publish current audio source once.
        if (nextAudioTrack && !publishedAudioPublication) {
            const pub = await livekitRoom.localParticipant.publishTrack(nextAudioTrack, {
                source: Track.Source.Microphone,
            });
            publishedAudioPublication = pub;
            publishedAudioTrack = nextAudioTrack;
        }

        if (publishedVideoPublication) {
            if (cameraEnabled && publishedVideoPublication.isMuted) {
                await publishedVideoPublication.unmute();
            }
            if (!cameraEnabled && !publishedVideoPublication.isMuted) {
                await publishedVideoPublication.mute();
            }
        }

        if (publishedAudioPublication) {
            if (microphoneEnabled && publishedAudioPublication.isMuted) {
                await publishedAudioPublication.unmute();
            }
            if (!microphoneEnabled && !publishedAudioPublication.isMuted) {
                await publishedAudioPublication.mute();
            }
        }

        rebuildParticipantTiles();
    }

    function registerRoomEvents(room: Room, sessionId: number) {
        const isActiveSession = () => sessionId === roomSessionId && room === livekitRoom;

        room.on(RoomEvent.ParticipantConnected, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
            if (!isActiveSession()) return;
            participantStreams.delete(participant.identity);
            rebuildParticipantTiles();
        });

        room.on(
            RoomEvent.TrackSubscribed,
            (
                track: RemoteTrack,
                _publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                if (!isActiveSession()) return;
                addTrackToParticipantStream(participant, track);
            },
        );

        room.on(
            RoomEvent.TrackUnsubscribed,
            (
                track: RemoteTrack,
                _publication: RemoteTrackPublication,
                participant: RemoteParticipant,
            ) => {
                if (!isActiveSession()) return;
                removeTrackFromParticipantStream(participant, track);
            },
        );

        // These events can fire very frequently and cause visible tile/video rebind flicker.
        // Keep the room stable first; we can reintroduce throttled updates later.
        room.on(RoomEvent.TrackMuted, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });
        room.on(RoomEvent.TrackUnmuted, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });
        room.on(RoomEvent.LocalTrackPublished, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });
        room.on(RoomEvent.LocalTrackUnpublished, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });
        room.on(RoomEvent.TrackPublished, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });
        room.on(RoomEvent.TrackUnpublished, () => {
            if (!isActiveSession()) return;
            rebuildParticipantTiles();
        });

        room.on(RoomEvent.Disconnected, () => {
            if (sessionId !== roomSessionId) return;
            roomConnectionState = "disconnected";
            showInfoBanner("You left the room.");
            participantStreams.clear();
            participantTiles = [];
            lastParticipantCount = 0;
            localPreviewStream = null;
            publishedVideoPublication = null;
            publishedAudioPublication = null;
            publishedVideoTrack = null;
            publishedAudioTrack = null;
        });
    }

    async function leaveCurrentRoom(options: { restartMedia?: boolean } = {}) {
        const { restartMedia = false } = options;
        roomSessionId += 1;
        if (!livekitRoom) {
            activeRoomName = null;
            roomConnectionState = "disconnected";
            roomConnectionError = "";
            participantTiles = [];
            participantStreams.clear();
            publishSyncChain = Promise.resolve();
            resetMaskOnlyOutsideRoom();
            return;
        }

        await Promise.race([
            Promise.resolve(livekitRoom.disconnect()),
            new Promise((resolve) => window.setTimeout(resolve, 1500)),
        ]);
        livekitRoom = null;
        activeRoomName = null;
        roomConnectionState = "disconnected";
        roomConnectionError = "";
        participantStreams.clear();
        participantTiles = [];
        lastParticipantCount = 0;
        localPreviewStream = null;
        publishedVideoPublication = null;
        publishedAudioPublication = null;
        publishedVideoTrack = null;
        publishedAudioTrack = null;
        publishSyncChain = Promise.resolve();
        resetMaskOnlyOutsideRoom();
        syncEffectsCanvasSize();
        renderEffectsOverlay();

        if (restartMedia) {
            // Optional hard restart for explicit recovery actions.
            try {
                await restartActiveMedia({
                    restartCamera: Boolean(cameraStream),
                    restartMicrophone: Boolean(microphoneStream),
                });
                refreshOverlaySnapshots();
            } catch {
                // Keep current streams if restart fails; user can still toggle manually.
            }
        }
    }

    function handleLeaveClick() {
        void leaveCurrentRoom({ restartMedia: false });
    }

    async function connectToRoom(roomName: string, username: string) {
        roomSessionId += 1;
        const activeSession = roomSessionId;
        let room: Room | null = null;
        roomConnectionError = "";
        roomConnectionState = "connecting";

        try {
            if (livekitRoom) {
                await leaveCurrentRoom({ restartMedia: false });
            }

            const joinResponse = await joinRoom(roomName, username);
            room = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            livekitRoom = room;
            registerRoomEvents(room, activeSession);
            await room.connect(joinResponse.livekitUrl, joinResponse.token);
            activeRoomName = joinResponse.room;
            roomConnectionState = "connected";
            lastParticipantCount = 0;
            localStorage.setItem(ROOM_NAME_STORAGE_KEY, joinResponse.room);
            localStorage.setItem(USER_NAME_STORAGE_KEY, joinResponse.username);

            if (joinResponse.username !== username) {
                showInfoBanner(`Your name was adjusted to ${joinResponse.username}.`);
            }

            // Seed already-subscribed tracks for participants who joined before us.
            for (const participant of room.remoteParticipants.values()) {
                for (const pub of participant.trackPublications.values()) {
                    if (pub.isSubscribed && pub.track) {
                        addTrackToParticipantStream(
                            participant,
                            pub.track,
                        );
                    }
                }
            }

            await queueSyncPublishedTracks();
            rebuildParticipantTiles();
            showInfoBanner(`Connected to room ${joinResponse.room}.`);
        } catch (error) {
            try {
                await room?.disconnect();
            } catch {
                // Ignore cleanup failures after a failed join attempt.
            }
            livekitRoom = null;
            activeRoomName = null;
            showRoomError(getMediaErrorMessage("media", error));
        }
    }

    async function ensureMediaReadyForCall() {
        if (!cameraStream && !microphoneStream) {
            await handleStartAll();
            return;
        }

        if (!cameraStream) {
            await handleStart();
        }

        if (!microphoneStream) {
            await handleMicStart();
        }

        const videoTrack = cameraStream?.getVideoTracks()[0] ?? null;
        const audioTrack = microphoneStream?.getAudioTracks()[0] ?? null;
        const shouldRestartCameraTrack = Boolean(
            cameraStream && (!videoTrack || videoTrack.readyState === "ended"),
        );
        const shouldRestartAudioTrack = Boolean(
            microphoneStream && (!audioTrack || audioTrack.readyState === "ended"),
        );

        if (shouldRestartCameraTrack || shouldRestartAudioTrack) {
            await restartActiveMedia({
                restartCamera: shouldRestartCameraTrack,
                restartMicrophone: shouldRestartAudioTrack,
            });
        }
    }

    function promptRoomName() {
        const previousRoomName = localStorage.getItem(ROOM_NAME_STORAGE_KEY) || "";
        return window.prompt("Room name", previousRoomName || "amphi-room")?.trim() || "";
    }

    function promptUsername() {
        const previousUsername = localStorage.getItem(USER_NAME_STORAGE_KEY) || "";
        return window.prompt("Your name", previousUsername || "guest")?.trim() || "";
    }

    async function handleCreateClick() {
        const requestedRoomName = promptRoomName();
        const username = promptUsername();
        if (!requestedRoomName || !username) {
            return;
        }

        try {
            await ensureMediaReadyForCall();
            const createdRoom = await createRoom(requestedRoomName, requestedRoomName);
            await connectToRoom(createdRoom.room.name, username);
        } catch (error) {
            roomConnectionState = "error";
            roomConnectionError = getMediaErrorMessage("media", error);
        }
    }

    async function handleJoinClick() {
        const roomName = promptRoomName();
        const username = promptUsername();
        if (!roomName || !username) {
            return;
        }

        try {
            await ensureMediaReadyForCall();
            await connectToRoom(roomName, username);
        } catch (error) {
            roomConnectionState = "error";
            roomConnectionError = getMediaErrorMessage("media", error);
        }
    }

    function handleStarsClick() {
        showEffectsPanel = !showEffectsPanel;
        renderEffectsOverlay();
    }

    $effect(() => {
        normalizeEffectsState(cameraEffects);
        renderBackgroundOverlay();
        renderEffectsOverlay();
        syncEffectsTracking();
        void sync3dMaskModel();
    });

    $effect(() => {
        cameraStream;
        microphoneStream;
        cameraEnabled;
        microphoneEnabled;
        publishMaskOnly;
        roomConnectionState;
        cameraEffects.mode;
        cameraEffects.showLandmarksDebug;
        cameraEffects.background.url;
        cameraEffects.background.opacity;

        if (roomConnectionState !== "connected") {
            stopCompositionLoop();
        }

        if (roomConnectionState === "connected") {
            void queueSyncPublishedTracks();
            rebuildParticipantTiles();
        }
    });

    onMount(async () => {
        infoBrowser = detectBrowserVersion();
        applyStoredPreferences(readCameraPreferences(localStorage));
        resetMaskOnlyOutsideRoom();
        await handleStartAll();
        syncDebugInfoLoopState();
        syncMicrophoneLevelLoopState();
        syncPerformanceLoopState();
        if (effects3dCanvasEl) {
            threeMaskRenderer = new ThreeMaskRenderer(effects3dCanvasEl);
        }
        syncEffectsCanvasSize();
        try {
            await sync3dMaskModel();
        } catch {
            // Model may not be present yet.
        }
        syncEffectsTracking();
        renderEffectsOverlay();

        document.addEventListener(
            "visibilitychange",
            handlePerformanceVisibilityReset,
        );
        window.addEventListener("blur", handlePerformanceVisibilityReset);
        window.addEventListener("focus", handlePerformanceVisibilityReset);
        window.addEventListener("pagehide", handlePerformanceVisibilityReset);
        window.addEventListener("resize", handleEffectsResize);
        if (typeof ResizeObserver !== "undefined") {
            effectsResizeObserver = new ResizeObserver(() => {
                syncEffectsCanvasSize();
                renderEffectsOverlay();
            });
            if (videoEl) {
                effectsResizeObserver.observe(videoEl);
            }
            if (effectsCanvasEl) {
                effectsResizeObserver.observe(effectsCanvasEl);
            }
        }

        if (navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener(
                "devicechange",
                handleMediaDevicesChange,
            );
        }
    });

    onDestroy(() => {
        void leaveCurrentRoom();
        if (typeof document !== "undefined") {
            document.removeEventListener(
                "visibilitychange",
                handlePerformanceVisibilityReset,
            );
        }

        if (typeof window !== "undefined") {
            window.removeEventListener(
                "blur",
                handlePerformanceVisibilityReset,
            );
            window.removeEventListener(
                "focus",
                handlePerformanceVisibilityReset,
            );
            window.removeEventListener(
                "pagehide",
                handlePerformanceVisibilityReset,
            );
            window.removeEventListener("resize", handleEffectsResize);
            effectsResizeObserver?.disconnect();
            effectsResizeObserver = null;
        }

        if (
            typeof navigator !== "undefined" &&
            navigator.mediaDevices?.removeEventListener
        ) {
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                handleMediaDevicesChange,
            );
        }

        stopDebugInfoLoop();
        stopMicrophoneLevelLoop();
        stopPerformanceLoop();
        stopCompositionLoop();
        stopEffectsTracking();
        cameraEffects.funnyMask = updateEffectAsset(cameraEffects.funnyMask, null);
        cameraEffects.mask3d = updateEffectAsset(cameraEffects.mask3d, null);
        cameraEffects.background = updateEffectAsset(cameraEffects.background, null);
        threeMaskRenderer?.dispose();
        threeMaskRenderer = null;
        if (infoMessageTimeoutId !== null) {
            clearTimeout(infoMessageTimeoutId);
            infoMessageTimeoutId = null;
        }
        if (roomErrorTimeoutId !== null) {
            clearTimeout(roomErrorTimeoutId);
            roomErrorTimeoutId = null;
        }
        destroyAudioAnalysis();
        handleStop();
        handleMicStop();
    });
</script>

<svelte:head>
    <title>Camera</title>
</svelte:head>

<div class:camera-view={true} class:in-room={roomConnectionState === "connected"} class:mask-only-preview={publishMaskOnly && roomConnectionState !== "connected"} class:mask-3d-mode={cameraEffects.mode === "mask-3d"}>
    <video bind:this={videoEl} autoplay playsinline muted></video>
    <canvas bind:this={backgroundCanvasEl} class="background-overlay"></canvas>
    <canvas bind:this={effects3dCanvasEl} class="effects-3d-overlay"></canvas>
    <canvas bind:this={effectsCanvasEl} class="effects-overlay"></canvas>

    <RoomParticipantsGrid
        roomName={activeRoomName}
        connectionState={roomConnectionState}
        participants={participantTiles}
    />

    {#if roomConnectionState !== "connected" && roomConnectionState !== "connecting"}
        <div class="corner-actions top-right-actions" aria-label="Session actions">
            <button class="action-pill" type="button" onclick={handleCreateClick}>Create</button>
            <button class="action-pill" type="button" onclick={handleJoinClick}>Join</button>
        </div>
    {/if}

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
        onVideoDeviceChange={handleVideoDeviceChange}
        onAudioDeviceChange={handleAudioDeviceChange}
    />

    <CameraOverlaysStack
        {showPerformance}
        {showDebugInfo}
        {performanceFps}
        performanceRenderFps={performanceRenderFps}
        performanceFrameTimeMs={performanceFrameTimeMs}
        performanceResolution={performanceResolution}
        performanceTrackFrameRate={performanceTrackFrameRate}
        performanceTargetFrameRate={performanceTargetFrameRate}
        selectedQuality={selectedQuality}
        infoBrowser={infoBrowser}
        infoCameraMuted={infoCameraMuted}
        infoCameraName={infoCameraName}
        infoMicrophoneMuted={infoMicrophoneMuted}
        infoMicrophoneLevelSnapshot={infoMicrophoneLevelSnapshot}
        infoMicrophoneName={infoMicrophoneName}
    />

    <CameraEffectsPanel
        open={showEffectsPanel}
        bind:effects={cameraEffects}
        bind:publishMaskOnly
        onClose={handleStarsClick}
        onPublishMaskOnlyToggle={handlePublishMaskOnlyToggle}
        onUploadFunnyMask={handleUploadFunnyMask}
        onUploadMask3d={handleUploadMask3d}
        onUploadBackground={handleUploadBackground}
    />

    {#if (cameraState !== "ready" || !cameraEnabled) && !activeRoomName}
        <MediaPlaceholder
            loading={cameraState === "loading"}
            loadingIcon={loading}
            offIcon={cameraOff}
            loadingAlt="Camera is starting"
            offAlt="Camera is off"
        />
    {/if}

    {#if cameraState === "error" || microphoneState === "error" || roomConnectionError}
        <ErrorBanner message={roomConnectionError || errorMessage} />
    {/if}

    <Banner message={infoMessage} />

    <MediaControls>
        {#if roomConnectionState === "connected"}
            <button class="control-leave-button" type="button" onclick={handleLeaveClick}
                >Leave</button
            >
        {/if}

        <MediaToggleButton
            active={showEffectsPanel}
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

            <MicrophoneLevelIndicator
                level={infoMicrophoneLevel}
                active={shouldSampleMicrophoneLevel() && !infoMicrophoneMuted}
            />
        </div>
    </MediaControls>
</div>

<style>
    @import "$lib/styles/camera-page.css";

    .effects-3d-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 3;
        pointer-events: none;
    }

    .background-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 2;
        pointer-events: none;
    }

    .effects-overlay {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 4;
        pointer-events: none;
    }

    .camera-view.mask-3d-mode .effects-3d-overlay {
        z-index: 5;
    }

    .camera-view.mask-3d-mode .effects-overlay {
        z-index: 4;
    }

    .camera-view.in-room video,
    .camera-view.in-room .effects-3d-overlay,
    .camera-view.in-room .effects-overlay {
        opacity: 0;
    }

    .camera-view.mask-only-preview video {
        opacity: 0;
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
    }

    .action-pill {
        min-height: 48px;
        padding: 0.9rem 1.2rem;
    }

    .action-pill:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }

    .microphone-control {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }

    .control-leave-button {
        border: 0;
        border-radius: 999px;
        background: rgba(220, 38, 38, 0.92);
        color: white;
        min-height: 48px;
        padding: 0.7rem 1rem;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
    }

    @media (max-width: 640px) {
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

        .control-leave-button {
            min-height: 44px;
            padding: 0.65rem 0.9rem;
        }
    }
</style>
