import { getVideoConstraintsByQuality, type VideoQuality } from "camera-core";

/**
 * Persistent keys for camera preferences stored in localStorage.
 */
export const STORAGE_KEYS = {
    showDebugInfo: "camera-debug-info",
    showPerformance: "camera-show-performance",
    legacyDebugMode: "camera-debug-mode",
    videoQuality: "camera-video-quality",
    cameraDeviceId: "camera-video-device-id",
    microphoneDeviceId: "camera-audio-device-id",
    publishMaskOnly: "camera-publish-mask-only",
} as const;

export const VIDEO_QUALITY_OPTIONS: VideoQuality[] = ["360p", "480p", "720p", "1080p"];

/**
 * Route-level camera preferences that survive page reloads.
 */
export type CameraPreferences = {
    showDebugInfo: boolean;
    showPerformance: boolean;
    selectedQuality: VideoQuality;
    selectedVideoDeviceId: string;
    selectedAudioDeviceId: string;
    publishMaskOnly: boolean;
};

/**
 * Type guard for persisted video quality values.
 */
function isVideoQuality(value: string | null): value is VideoQuality {
    return Boolean(value && VIDEO_QUALITY_OPTIONS.includes(value as VideoQuality));
}

/**
 * Builds video track constraints from the current quality and optional device id.
 */
function buildVideoTrackConstraints(preferences: Pick<
    CameraPreferences,
    "selectedQuality" | "selectedVideoDeviceId"
>) {
    const qualityConstraints = getVideoConstraintsByQuality(preferences.selectedQuality);

    if (preferences.selectedVideoDeviceId) {
        return {
            ...qualityConstraints,
            deviceId: { exact: preferences.selectedVideoDeviceId },
        } satisfies MediaTrackConstraints;
    }

    return {
        ...qualityConstraints,
    } satisfies MediaTrackConstraints;
}

/**
 * Builds audio track constraints for a specific microphone.
 *
 * Returning true keeps the browser free to pick the default device.
 */
function buildAudioTrackConstraints(selectedAudioDeviceId: string) {
    if (!selectedAudioDeviceId) {
        return true;
    }

    return {
        deviceId: { exact: selectedAudioDeviceId },
    } satisfies MediaTrackConstraints;
}

/**
 * Reads persisted preferences and applies compatibility fallbacks for older keys.
 */
export function readCameraPreferences(storage: Storage): CameraPreferences {
    const debugValue =
        storage.getItem(STORAGE_KEYS.showDebugInfo) ?? storage.getItem(STORAGE_KEYS.legacyDebugMode);
    const performanceValue = storage.getItem(STORAGE_KEYS.showPerformance);
    const qualityValue = storage.getItem(STORAGE_KEYS.videoQuality);
    const publishMaskOnlyValue = storage.getItem(STORAGE_KEYS.publishMaskOnly);

    return {
        showDebugInfo: debugValue === "true",
        showPerformance: performanceValue === "true",
        selectedQuality: isVideoQuality(qualityValue) ? qualityValue : "480p",
        selectedVideoDeviceId: storage.getItem(STORAGE_KEYS.cameraDeviceId) ?? "",
        selectedAudioDeviceId: storage.getItem(STORAGE_KEYS.microphoneDeviceId) ?? "",
        publishMaskOnly: publishMaskOnlyValue === "true",
    };
}

/**
 * Persists the current route preferences.
 */
export function persistCameraPreferences(storage: Storage, preferences: CameraPreferences) {
    storage.setItem(STORAGE_KEYS.showDebugInfo, String(preferences.showDebugInfo));
    storage.setItem(STORAGE_KEYS.showPerformance, String(preferences.showPerformance));
    storage.setItem(STORAGE_KEYS.videoQuality, preferences.selectedQuality);
    storage.setItem(STORAGE_KEYS.cameraDeviceId, preferences.selectedVideoDeviceId);
    storage.setItem(STORAGE_KEYS.microphoneDeviceId, preferences.selectedAudioDeviceId);
    storage.setItem(STORAGE_KEYS.publishMaskOnly, String(preferences.publishMaskOnly));
}

/**
 * Builds constraints for a camera-only request.
 */
export function buildCameraConstraints(
    preferences: Pick<
        CameraPreferences,
        "selectedQuality" | "selectedVideoDeviceId"
    >,
): MediaStreamConstraints {
    return {
        video: buildVideoTrackConstraints(preferences),
        audio: false,
    };
}

/**
 * Builds constraints for a microphone-only request.
 */
export function buildMicrophoneConstraints(selectedAudioDeviceId: string): MediaStreamConstraints {
    return {
        video: false,
        audio: buildAudioTrackConstraints(selectedAudioDeviceId),
    };
}

/**
 * Builds constraints for a combined camera + microphone request.
 */
export function buildMediaConstraints(preferences: CameraPreferences): MediaStreamConstraints {
    return {
        video: buildVideoTrackConstraints(preferences),
        audio: buildAudioTrackConstraints(preferences.selectedAudioDeviceId),
    };
}

/**
 * Returns candidate video constraints for applyConstraints() updates.
 *
 * The 1080p path is intentionally more defensive:
 * - try exact 60 fps first
 * - then try the base quality constraints
 * - finally fall back to 30 fps
 *
 * This reduces the chance of a hard restart when devices reject 1080p@60.
 */
export function getApplyConstraintCandidates(
    preferences: Pick<
        CameraPreferences,
        "selectedQuality" | "selectedVideoDeviceId"
    >,
) {
    const baseConstraints = buildVideoTrackConstraints(preferences);

    if (preferences.selectedQuality !== "1080p") {
        return [baseConstraints];
    }

    return [
        {
            ...baseConstraints,
            frameRate: { exact: 60 },
        } satisfies MediaTrackConstraints,
        baseConstraints,
        {
            ...baseConstraints,
            frameRate: { ideal: 30, max: 30 },
        } satisfies MediaTrackConstraints,
    ];
}