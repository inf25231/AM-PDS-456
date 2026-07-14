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

export function getStreamTrackDeviceId(stream: MediaStream | null, kind: TrackKind) {
  const track = kind === 'video' ? stream?.getVideoTracks()?.[0] : stream?.getAudioTracks()?.[0];
  const deviceId = track?.getSettings().deviceId;
  return typeof deviceId === 'string' ? deviceId : '';
}

export function normalizeSelectedDeviceId(
  selectedDeviceId: string,
  options: DeviceOption[],
  fallbackDeviceId = ''
) {
  // keep selected if still present
  if (options.some((option) => option.value === selectedDeviceId)) {
    return selectedDeviceId;
  }

  // otherwise try active device, else clear selection
  return options.some((option) => option.value === fallbackDeviceId) ? fallbackDeviceId : '';
}
