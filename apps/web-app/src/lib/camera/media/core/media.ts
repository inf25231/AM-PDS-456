export type CameraState = 'idle' | 'loading' | 'ready' | 'error';
export type VideoQuality = '360p' | '480p' | '720p' | '1080p';
type TrackKind = 'video' | 'audio';

const VIDEO_QUALITY_CONSTRAINTS: Record<VideoQuality, MediaTrackConstraints> = {
  '360p': {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 360 },
    frameRate: { ideal: 30, max: 30 }
  },
  '480p': {
    facingMode: 'user',
    width: { ideal: 854 },
    height: { ideal: 480 },
    frameRate: { ideal: 30, max: 30 }
  },
  '720p': {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 }
  },
  '1080p': {
    facingMode: 'user',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 30, max: 30 }
  }
};

export function getVideoConstraintsByQuality(quality: VideoQuality): MediaTrackConstraints {
  return VIDEO_QUALITY_CONSTRAINTS[quality];
}

export async function startCameraStream(
  video: HTMLVideoElement,
  constraints: MediaStreamConstraints = {
    video: {
      facingMode: 'user'
    },
    audio: false
  }
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API is not available in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function startMicrophoneStream(
  constraints: MediaStreamConstraints = {
    video: false,
    audio: true
  }
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Microphone API is not available in this browser.');
  }

  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function startCameraAndMicrophoneStreams(
  constraints: MediaStreamConstraints = {
    video: {
      facingMode: 'user'
    },
    audio: true
  }
): Promise<{ cameraStream: MediaStream; microphoneStream: MediaStream }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Media API is not available in this browser.');
  }

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const [videoTrack] = stream.getVideoTracks();
  const [audioTrack] = stream.getAudioTracks();

  if (!videoTrack || !audioTrack) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error('Camera or microphone track is not available.');
  }

  return {
    cameraStream: new MediaStream([videoTrack]),
    microphoneStream: new MediaStream([audioTrack])
  };
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

export async function attachStreamToVideo(
  videoElement: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  videoElement.srcObject = stream;
  await videoElement.play();
}

export function stopCameraStream(
  videoElement: HTMLVideoElement | null,
  cameraStream: MediaStream | null
): void {
  const elementStream = videoElement?.srcObject;
  const hasMediaStreamApi = typeof MediaStream !== 'undefined';

  stopStream(cameraStream);
  if (hasMediaStreamApi && elementStream instanceof MediaStream) {
    stopStream(elementStream);
  }

  if (videoElement) {
    videoElement.pause();
    videoElement.srcObject = null;
    videoElement.load();
  }
}

export function stopMicrophoneStream(microphoneStream: MediaStream | null): void {
  if (microphoneStream) {
    microphoneStream.getAudioTracks().forEach((track) => {
      track.stop();
      microphoneStream.removeTrack(track);
    });
  }

  stopStream(microphoneStream);
}

export function setStreamTrackEnabled(
  stream: MediaStream | null,
  kind: TrackKind,
  enabled: boolean
): boolean {
  const track = kind === 'video' ? stream?.getVideoTracks()[0] : stream?.getAudioTracks()[0];
  if (!track) return false;
  track.enabled = enabled;
  return true;
}
