import {
    enumerateMediaDeviceOptions,
    getStreamTrackDeviceId,
    normalizeSelectedDeviceId,
    type DeviceOption,
} from "$lib/camera/devices";

/**
 * Reactive store for available media input devices.
 *
 * Owns the enumerated device lists for video and audio inputs.
 * Call `refresh(...)` after permission changes, stream restarts, or hardware
 * changes so the device selects stay aligned with real hardware.
 *
 * ### Usage
 * ```ts
 * const devices = new DevicesStore();
 *
 * // After a stream starts or hardware changes:
 * const { normalizedVideoId, normalizedAudioId } = await devices.refresh(
 *     cameraStream, microphoneStream,
 *     prefs.selectedVideoDeviceId, prefs.selectedAudioDeviceId,
 * );
 *
 * // Persist normalized IDs if they changed:
 * if (normalizedVideoId !== prefs.selectedVideoDeviceId) {
 *     prefs.selectedVideoDeviceId = normalizedVideoId;
 *     prefs.persist(localStorage);
 * }
 * ```
 */
export class DevicesStore {
    videoDevices = $state<DeviceOption[]>([]);
    audioDevices = $state<DeviceOption[]>([]);

    /**
     * Enumerates available media devices and normalizes the current selection.
     *
     * Returns normalized IDs for the caller to compare against the current
     * selection. If a persisted ID disappeared (e.g., a device was unplugged),
     * the normalized value falls back to the active track's device ID or an
     * empty string for "auto".
     *
     * The caller is responsible for updating preferences and persisting if the
     * normalized values differ from the current selection.
     */
    async refresh(
        cameraStream: MediaStream | null,
        microphoneStream: MediaStream | null,
        currentVideoDeviceId: string,
        currentAudioDeviceId: string,
    ): Promise<{ normalizedVideoId: string; normalizedAudioId: string }> {
        const { videoInputs, audioInputs } = await enumerateMediaDeviceOptions();
        this.videoDevices = videoInputs;
        this.audioDevices = audioInputs;

        const activeVideoId = getStreamTrackDeviceId(cameraStream, "video");
        const activeAudioId = getStreamTrackDeviceId(microphoneStream, "audio");

        return {
            normalizedVideoId: normalizeSelectedDeviceId(
                currentVideoDeviceId,
                videoInputs,
                activeVideoId,
            ),
            normalizedAudioId: normalizeSelectedDeviceId(
                currentAudioDeviceId,
                audioInputs,
                activeAudioId,
            ),
        };
    }
}

