import { getVideoConstraintsByQuality, type VideoQuality } from './media.ts';

// localStorage keys for camera page
const STORAGE_KEYS = {
  videoQuality: 'camera-video-quality',
  cameraDeviceId: 'camera-video-device-id',
  microphoneDeviceId: 'camera-audio-device-id'
} as const;

const VIDEO_QUALITY_OPTIONS: VideoQuality[] = ['360p', '480p', '720p', '1080p'];

export type CameraPreferences = {
  selectedQuality: VideoQuality;
  selectedVideoDeviceId: string;
  selectedAudioDeviceId: string;
};

function isVideoQuality(value: string | null): value is VideoQuality {
  return Boolean(value && VIDEO_QUALITY_OPTIONS.includes(value as VideoQuality));
}

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

function buildAudioTrackConstraints(selectedAudioDeviceId: string) {
  if (!selectedAudioDeviceId) {
    // true = browser chooses default microphone
    return true;
  }

  return {
    deviceId: { exact: selectedAudioDeviceId }
  } satisfies MediaTrackConstraints;
}

export function readCameraPreferences(storage: Storage): CameraPreferences {
  const qualityValue = storage.getItem(STORAGE_KEYS.videoQuality);

  return {
    selectedQuality: isVideoQuality(qualityValue) ? qualityValue : '720p',
    selectedVideoDeviceId: storage.getItem(STORAGE_KEYS.cameraDeviceId) ?? '',
    selectedAudioDeviceId: storage.getItem(STORAGE_KEYS.microphoneDeviceId) ?? ''
  };
}

export function persistCameraPreferences(storage: Storage, preferences: CameraPreferences) {
  storage.setItem(STORAGE_KEYS.videoQuality, preferences.selectedQuality);
  storage.setItem(STORAGE_KEYS.cameraDeviceId, preferences.selectedVideoDeviceId);
  storage.setItem(STORAGE_KEYS.microphoneDeviceId, preferences.selectedAudioDeviceId);
}

export function buildCameraConstraints(
  preferences: Pick<CameraPreferences, 'selectedQuality' | 'selectedVideoDeviceId'>
): MediaStreamConstraints {
  return {
    video: buildVideoTrackConstraints(preferences),
    audio: false
  };
}

export function buildMicrophoneConstraints(selectedAudioDeviceId: string): MediaStreamConstraints {
  return {
    video: false,
    audio: buildAudioTrackConstraints(selectedAudioDeviceId)
  };
}

export function buildMediaConstraints(preferences: CameraPreferences): MediaStreamConstraints {
  return {
    video: buildVideoTrackConstraints(preferences),
    audio: buildAudioTrackConstraints(preferences.selectedAudioDeviceId)
  };
}
