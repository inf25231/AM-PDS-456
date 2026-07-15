export type MediaTarget = 'camera' | 'microphone' | 'media';

const TARGET_LABEL: Record<MediaTarget, string> = {
  camera: 'Camera',
  microphone: 'Microphone',
  media: 'Media'
};

export function getMediaErrorMessage(target: MediaTarget, error: unknown): string {
  const label = TARGET_LABEL[target];

  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return `${label} permission was denied.`;
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return `${label} was not found on this device.`;
      case 'NotReadableError':
      case 'TrackStartError':
        return `${label} is already used by another app.`;
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return `${label} does not support requested constraints.`;
      case 'AbortError':
        return `${label} access was aborted.`;
      default:
        return error.message || `Unknown ${label.toLowerCase()} error.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return `Unknown ${label.toLowerCase()} error.`;
}
