/**
 * by ove. 2026
 */

export type CameraState = 'idle' | 'loading' | 'ready' | 'error';

export async function startCamera(
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

export async function startMicrophone(
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

export async function startCameraAndMicrophone(
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

export function stopMediaStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}