import { getVideoConstraintsByQuality, type VideoQuality } from './media.js';

/**
 * Persistent keys for camera preferences stored in localStorage.
 */
const STORAGE_KEYS = {
  videoQuality: 'camera-video-quality',
  cameraDeviceId: 'camera-video-device-id',
  microphoneDeviceId: 'camera-audio-device-id'
} as const;

const VIDEO_QUALITY_OPTIONS: VideoQuality[] = ['360p', '480p', '720p', '1080p'];

/**
 * Route-level camera preferences that survive page reloads.
 */
export type CameraPreferences = {
  selectedQuality: VideoQuality;
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
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
function buildVideoTrackConstraints(
  preferences: Pick<CameraPreferences, 'selectedQuality' | 'selectedVideoDeviceId'>
) {
  const qualityConstraints = getVideoConstraintsByQuality(preferences.selectedQuality);

  if (preferences.selectedVideoDeviceId) {
    return {
      ...qualityConstraints,
      deviceId: { exact: preferences.selectedVideoDeviceId }
    } satisfies MediaTrackConstraints;
  }

  return {
    ...qualityConstraints
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
    deviceId: { exact: selectedAudioDeviceId }
  } satisfies MediaTrackConstraints;
}

/**
 * Reads persisted preferences and applies compatibility fallbacks for older keys.
 */
export function readCameraPreferences(storage: Storage): CameraPreferences {
  const qualityValue = storage.getItem(STORAGE_KEYS.videoQuality);

  return {
    selectedQuality: isVideoQuality(qualityValue) ? qualityValue : '720p',
    selectedVideoDeviceId: storage.getItem(STORAGE_KEYS.cameraDeviceId) ?? '',
    selectedAudioDeviceId: storage.getItem(STORAGE_KEYS.microphoneDeviceId) ?? ''
  };
}

/**
 * Persists the current route preferences.
 */
export function persistCameraPreferences(storage: Storage, preferences: CameraPreferences) {
  storage.setItem(STORAGE_KEYS.videoQuality, preferences.selectedQuality);
  storage.setItem(STORAGE_KEYS.cameraDeviceId, preferences.selectedVideoDeviceId);
  storage.setItem(STORAGE_KEYS.microphoneDeviceId, preferences.selectedAudioDeviceId);
}

/**
 * Builds constraints for a camera-only request.
 */
export function buildCameraConstraints(
  preferences: Pick<CameraPreferences, 'selectedQuality' | 'selectedVideoDeviceId'>
): MediaStreamConstraints {
  return {
    video: buildVideoTrackConstraints(preferences),
    audio: false
  };
}

/**
 * Builds constraints for a microphone-only request.
 */
export function buildMicrophoneConstraints(selectedAudioDeviceId: string): MediaStreamConstraints {
  return {
    video: false,
    audio: buildAudioTrackConstraints(selectedAudioDeviceId)
  };
}

/**
 * Builds constraints for a combined camera + microphone request.
 */
export function buildMediaConstraints(preferences: CameraPreferences): MediaStreamConstraints {
  return {
    video: buildVideoTrackConstraints(preferences),
    audio: buildAudioTrackConstraints(preferences.selectedAudioDeviceId)
  };
}

/**
 * Returns the video constraints to try for an applyConstraints() update.
 *
 * All quality tiers now request the same 30fps capture ceiling (see
 * `VIDEO_QUALITY_CONSTRAINTS` in media.ts — nothing downstream ever renders
 * faster than that), so there's no per-quality fallback dance needed here
 * anymore: one set of constraints is always enough.
 */
export function getApplyConstraintCandidates(
  preferences: Pick<CameraPreferences, 'selectedQuality' | 'selectedVideoDeviceId'>
): MediaTrackConstraints[] {
  return [buildVideoTrackConstraints(preferences)];
}
