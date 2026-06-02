import {
    cancelPerformanceFrameCallback,
    getRenderedFrameCount,
    requestPerformanceFrameCallback,
} from "$lib/camera/performance";
import {
    getVideoConstraintsByQuality,
    type CameraState,
    type VideoQuality,
} from "camera-core";

const DEBUG_INTERVAL_MS = 250;
const PERF_INTERVAL_MS = 500;

/**
 * Inputs the debug loop reads on every tick to refresh the overlay state.
 */
export type DebugInput = {
    cameraStream: MediaStream | null;
    microphoneStream: MediaStream | null;
    cameraState: CameraState;
    microphoneState: CameraState;
};

/**
 * Inputs the performance loop reads on every tick.
 */
export type PerfInput = {
    videoEl: HTMLVideoElement;
    cameraStream: MediaStream | null;
    cameraState: CameraState;
    cameraEnabled: boolean;
    selectedQuality: VideoQuality;
};

/**
 * Reactive store for the camera debug and performance overlays.
 *
 * Owns the `debug` and `perf` state objects and runs the two sampling
 * loops that keep them current.
 *
 * ### Typical usage
 * ```ts
 * const monitor = new MonitorStore();
 *
 * // Start a loop when the matching overlay becomes visible:
 * monitor.startDebugLoop(() => ({ cameraStream, microphoneStream, ... }));
 * monitor.startPerfLoop(videoEl, () => ({ videoEl, cameraStream, ... }));
 *
 * // Refresh immediately after stream changes:
 * monitor.refreshDebug({ cameraStream, microphoneStream, cameraState, microphoneState });
 * monitor.refreshPerf({ videoEl, cameraStream, cameraState, cameraEnabled, selectedQuality });
 *
 * // On page destroy:
 * monitor.stopDebugLoop();
 * monitor.stopPerfLoop();
 * ```
 */
export class MonitorStore {
    /**
     * Debug overlay data.
     *
     * `microphoneLevel` is written externally by `MicrophoneMeter` via
     * `bind:level`. The store reads it in `refreshDebug` to snapshot it
     * into `microphoneLevelSnapshot` at the slower debug-loop rate.
     */
    debug = $state({
        browser: "Unknown",
        cameraName: "-",
        microphoneName: "-",
        microphoneLevel: 0,
        microphoneLevelSnapshot: 0,
        microphoneMuted: true,
        cameraMuted: true,
    });

    /** Performance overlay data. */
    perf = $state<{
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

    // Loop active flags — checked inside loop steps to avoid stale callbacks
    // firing after stop() has been called.
    private _debugActive = false;
    private _perfActive = false;

    // Loop handles and frame counters (plain, non-reactive)
    private _debugTimeout: number | null = null;
    private _perfTimeout: number | null = null;
    private _rafId: number | null = null;
    private _frameCallbackId: number | null = null;
    private _videoEl: HTMLVideoElement | null = null;

    private _presentedFrames = 0;
    private _rafFrames = 0;
    private _prevRafFrames = 0;
    private _prevSampleTime = 0;
    private _prevRenderedFrames = 0;

    // -----------------------------------------------------------------
    // Snapshot helpers — call these for immediate one-shot updates
    // -----------------------------------------------------------------

    /**
     * Updates the debug overlay state from current streams and track flags.
     *
     * Also snapshots `microphoneLevel` → `microphoneLevelSnapshot` so the
     * overlay shows a stable value that does not flicker with the live meter.
     */
    refreshDebug(input: DebugInput) {
        const [videoTrack] = input.cameraStream?.getVideoTracks() ?? [];
        const [audioTrack] = input.microphoneStream?.getAudioTracks() ?? [];

        this.debug.cameraName = videoTrack?.label || "-";
        this.debug.microphoneName = audioTrack?.label || "-";
        this.debug.cameraMuted =
            !input.cameraStream ||
            !videoTrack ||
            videoTrack.muted ||
            !videoTrack.enabled ||
            input.cameraState !== "ready";
        this.debug.microphoneMuted =
            !input.microphoneStream ||
            !audioTrack ||
            audioTrack.muted ||
            !audioTrack.enabled ||
            input.microphoneState !== "ready";

        this.debug.microphoneLevelSnapshot = this.debug.microphoneLevel;
    }

    /**
     * Updates the perf overlay's resolution and frame-rate fields from the
     * current video track settings.
     *
     * Rolling FPS metrics (fps, renderFps, frameTimeMs) are updated by the
     * performance loop and are not touched here.
     */
    refreshPerf(input: PerfInput) {
        const [videoTrack] = input.cameraStream?.getVideoTracks() ?? [];
        const settings = videoTrack?.getSettings();

        this.perf.resolution = settings
            ? { width: settings.width ?? null, height: settings.height ?? null }
            : null;
        this.perf.trackFrameRate = settings?.frameRate ?? null;
        this.perf.targetFrameRate =
            getVideoConstraintsByQuality(input.selectedQuality).frameRate ?? null;
    }

    // -----------------------------------------------------------------
    // Debug loop
    // -----------------------------------------------------------------

    /**
     * Starts the debug overlay sampling loop (every 250 ms).
     *
     * `getInput` is called on every tick to read the current stream and
     * state values — it should be a simple closure over the page's reactive
     * variables, e.g. `() => ({ cameraStream, microphoneStream, ... })`.
     */
    startDebugLoop(getInput: () => DebugInput) {
        this.stopDebugLoop();
        this._debugActive = true;

        const step = () => {
            if (!this._debugActive) return;
            this.refreshDebug(getInput());
            this._debugTimeout = window.setTimeout(step, DEBUG_INTERVAL_MS);
        };

        step();
    }

    /** Stops the debug overlay loop. */
    stopDebugLoop() {
        this._debugActive = false;
        if (this._debugTimeout !== null) {
            clearTimeout(this._debugTimeout);
            this._debugTimeout = null;
        }
    }

    // -----------------------------------------------------------------
    // Performance loop
    // -----------------------------------------------------------------

    /**
     * Starts all performance measurement loops.
     *
     * Three sub-loops work together:
     * - **videoFrameCallback** — counts frames the video element actually presented
     *   (high accuracy; only available in Chrome/Edge)
     * - **requestAnimationFrame** — counts browser render frames (universal)
     * - **setInterval at 500 ms** — reads the frame counters and publishes FPS to `perf`
     *
     * `getInput` works the same as in `startDebugLoop`.
     */
    startPerfLoop(videoEl: HTMLVideoElement, getInput: () => PerfInput) {
        this.stopPerfLoop();
        this._perfActive = true;
        this._videoEl = videoEl;

        this._scheduleFrameCallback(videoEl);
        this._scheduleRaf();

        const step = () => {
            if (!this._perfActive) return;

            const input = getInput();

            if (input.videoEl && input.cameraState === "ready" && input.cameraEnabled) {
                const now = performance.now();
                const renderedFrames =
                    this._presentedFrames || getRenderedFrameCount(input.videoEl);

                if (!this._prevSampleTime) {
                    // First sample — just record the baseline
                    this._prevSampleTime = now;
                    this._prevRenderedFrames = renderedFrames ?? 0;
                    this._prevRafFrames = this._rafFrames;
                } else {
                    const elapsed = now - this._prevSampleTime;

                    if (elapsed > 0 && renderedFrames !== null) {
                        const delta = renderedFrames - this._prevRenderedFrames;
                        if (delta >= 0) {
                            this.perf.fps = (delta * 1000) / elapsed;
                        }
                    }

                    const rafDelta = this._rafFrames - this._prevRafFrames;
                    if (elapsed > 0 && rafDelta > 0) {
                        this.perf.renderFps = (rafDelta * 1000) / elapsed;
                        this.perf.frameTimeMs = elapsed / rafDelta;
                    }

                    this._prevSampleTime = now;
                    this._prevRafFrames = this._rafFrames;
                    this._prevRenderedFrames =
                        renderedFrames ?? this._prevRenderedFrames;
                }
            } else {
                this.perf.fps = null;
                this.perf.renderFps = null;
                this.perf.frameTimeMs = null;
                this._rafFrames = 0;
                this._prevRafFrames = 0;
                this._prevSampleTime = 0;
                this._prevRenderedFrames = 0;
            }

            this.refreshPerf(input);
            this._perfTimeout = window.setTimeout(step, PERF_INTERVAL_MS);
        };

        step();
    }

    /** Stops all performance loops and clears the derived metrics. */
    stopPerfLoop() {
        this._perfActive = false;

        if (this._perfTimeout !== null) {
            clearTimeout(this._perfTimeout);
            this._perfTimeout = null;
        }

        if (this._rafId !== null) {
            window.cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        if (this._videoEl) {
            cancelPerformanceFrameCallback(this._videoEl, this._frameCallbackId);
        }
        this._frameCallbackId = null;
        this._videoEl = null;
        this._presentedFrames = 0;
        this._rafFrames = 0;
        this.perf.fps = null;
        this.perf.renderFps = null;
        this.perf.frameTimeMs = null;
        this.perf.trackFrameRate = null;
        this.perf.targetFrameRate = null;
        this._prevRafFrames = 0;
        this._prevSampleTime = 0;
        this._prevRenderedFrames = 0;
    }

    /**
     * Resets only the rolling frame counters without stopping the loop.
     *
     * Call this when the page loses focus so the next FPS sample starts
     * from a clean baseline instead of a stale measurement window.
     */
    resetPerfMeasurement() {
        this._prevRafFrames = 0;
        this._prevSampleTime = 0;
        this._prevRenderedFrames = 0;
        this._presentedFrames = 0;
        this._rafFrames = 0;
        this.perf.fps = null;
        this.perf.renderFps = null;
        this.perf.frameTimeMs = null;
    }

    // -----------------------------------------------------------------
    // Private sub-loop helpers
    // -----------------------------------------------------------------

    private _scheduleFrameCallback(videoEl: HTMLVideoElement) {
        if (!this._perfActive) return;

        this._frameCallbackId = requestPerformanceFrameCallback(
            videoEl,
            ({ presentedFrames }) => {
                this._presentedFrames = presentedFrames;
                this._scheduleFrameCallback(videoEl);
            },
        );
    }

    private _scheduleRaf() {
        if (!this._perfActive) return;

        this._rafId = window.requestAnimationFrame(() => {
            this._rafFrames += 1;
            this._scheduleRaf();
        });
    }
}

