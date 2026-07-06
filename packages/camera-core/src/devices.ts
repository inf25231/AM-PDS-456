/**
 * Lightweight device helpers for the camera route.
 *
 * The route uses this module to:
 * - build select options for camera and microphone dropdowns
 * - read device ids from active tracks
 * - keep persisted device ids valid when hardware changes
 */
export type DeviceOption = {
  value: string;
  label: string;
};

type TrackKind = 'video' | 'audio';

function mapDeviceOptions(devices: MediaDeviceInfo[], labelPrefix: string): DeviceOption[] {
  return devices.map((device, index) => ({
    value: device.deviceId,
    label: device.label || `${labelPrefix} ${index + 1}`
  }));
}

/**
 * Enumerates available media devices and converts them into select options.
 *
 * Labels may still be generic until the user has granted media permissions.
 */
export async function enumerateMediaDeviceOptions() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return {
      videoInputs: [] as DeviceOption[],
      audioInputs: [] as DeviceOption[]
    };
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    videoInputs: mapDeviceOptions(
      devices.filter((device) => device.kind === 'videoinput'),
      'Camera'
    ),
    audioInputs: mapDeviceOptions(
      devices.filter((device) => device.kind === 'audioinput'),
      'Microphone'
    )
  };
}

/**
 * Reads the active device id from the current stream track settings.
 */
export function getStreamTrackDeviceId(stream: MediaStream | null, kind: TrackKind) {
  const track = kind === 'video' ? stream?.getVideoTracks()?.[0] : stream?.getAudioTracks()?.[0];
  const deviceId = track?.getSettings().deviceId;
  return typeof deviceId === 'string' ? deviceId : '';
}

/**
 * Keeps a persisted device id only when it still exists in the current option list.
 *
 * If the persisted id disappeared, the function falls back to the currently active
 * track device id when possible. This avoids broken selections after device changes.
 */
export function normalizeSelectedDeviceId(
  selectedDeviceId: string,
  options: DeviceOption[],
  fallbackDeviceId = ''
) {
  if (options.some((option) => option.value === selectedDeviceId)) {
    return selectedDeviceId;
  }

  return options.some((option) => option.value === fallbackDeviceId) ? fallbackDeviceId : '';
}
