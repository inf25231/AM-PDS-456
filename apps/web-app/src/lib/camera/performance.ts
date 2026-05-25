import { getVideoConstraintsByQuality, type VideoQuality } from "camera-core";

/**
 * Browser performance helpers for the camera route.
 *
 * Important distinction:
 * - track/settings values describe what the camera track negotiates
 * - frame callbacks and playback quality describe what the video element presents
 * - the route combines those values with requestAnimationFrame for UI-facing metrics
 */
type VideoWithPerformanceApis = HTMLVideoElement & {
    requestVideoFrameCallback?: (
        callback: (now: number, metadata: { presentedFrames: number }) => void,
    ) => number;
    cancelVideoFrameCallback?: (handle: number) => void;
    webkitDecodedFrameCount?: number;
};

/**
 * Reads a numeric value from a MediaTrackConstraints frameRate object.
 */
function readConstraintNumber(
    constraint?: number | ConstrainULong,
    priority: Array<"exact" | "ideal" | "max"> = ["exact", "ideal", "max"],
) {
    if (typeof constraint === "number") {
        return constraint;
    }

    if (!constraint || typeof constraint !== "object") {
        return null;
    }

    for (const key of priority) {
        const value = constraint[key];
        if (typeof value === "number") {
            return value;
        }
    }

    return null;
}

/**
 * Returns the raw target frame-rate information for a quality preset.
 */
export function getTargetFrameRateInfo(quality: VideoQuality) {
    const constraints = getVideoConstraintsByQuality(quality);
    const exactFrameRate = readConstraintNumber(constraints.frameRate, ["exact"]);
    const idealFrameRate = readConstraintNumber(constraints.frameRate, ["ideal"]);
    const maxFrameRate = readConstraintNumber(constraints.frameRate, ["max"]);

    return {
        exactFrameRate,
        idealFrameRate,
        maxFrameRate,
    };
}

/**
 * Reads the total number of frames rendered by the video element.
 *
 * Different browsers expose this through different APIs, so the helper tries
 * the standard playback quality API first and then the WebKit fallback.
 */
export function getRenderedFrameCount(video: HTMLVideoElement) {
    const playbackQuality = video.getVideoPlaybackQuality?.();

    if (
        typeof playbackQuality?.totalVideoFrames === "number" &&
        playbackQuality.totalVideoFrames > 0
    ) {
        return playbackQuality.totalVideoFrames;
    }

    const videoWithPerformanceApis = video as VideoWithPerformanceApis;
    if (
        typeof videoWithPerformanceApis.webkitDecodedFrameCount === "number" &&
        videoWithPerformanceApis.webkitDecodedFrameCount > 0
    ) {
        return videoWithPerformanceApis.webkitDecodedFrameCount;
    }

    return null;
}

/**
 * Registers a video-frame callback when the browser supports it.
 */
export function requestPerformanceFrameCallback(
    video: HTMLVideoElement,
    callback: (frame: { now: number; presentedFrames: number }) => void,
) {
    const videoWithPerformanceApis = video as VideoWithPerformanceApis;

    if (typeof videoWithPerformanceApis.requestVideoFrameCallback !== "function") {
        return null;
    }

    return videoWithPerformanceApis.requestVideoFrameCallback((now, metadata) => {
        callback({ now, presentedFrames: metadata.presentedFrames });
    });
}

/**
 * Cancels a previously registered video-frame callback.
 */
export function cancelPerformanceFrameCallback(video: HTMLVideoElement, handle: number | null) {
    if (handle === null) {
        return;
    }

    const videoWithPerformanceApis = video as VideoWithPerformanceApis;
    if (typeof videoWithPerformanceApis.cancelVideoFrameCallback === "function") {
        videoWithPerformanceApis.cancelVideoFrameCallback(handle);
    }
}

export function formatTargetFrameRate(quality: VideoQuality) {
    const { exactFrameRate, idealFrameRate, maxFrameRate } = getTargetFrameRateInfo(quality);

    if (exactFrameRate) {
        return `${Math.round(exactFrameRate)} fps exact`;
    }

    if (idealFrameRate && maxFrameRate && idealFrameRate !== maxFrameRate) {
        return `${Math.round(idealFrameRate)}-${Math.round(maxFrameRate)} fps target`;
    }

    if (maxFrameRate) {
        return `${Math.round(maxFrameRate)} fps target`;
    }

    if (idealFrameRate) {
        return `${Math.round(idealFrameRate)} fps target`;
    }

    return "-";
}

export function formatTrackFrameRate(trackFrameRate: number | null) {
    return trackFrameRate ? `${Math.round(trackFrameRate)} fps` : "-";
}