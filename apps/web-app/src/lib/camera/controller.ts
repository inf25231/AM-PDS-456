/**
 * by ove. 2026
 */

import {
  startCamera,
  startCameraAndMicrophone,
  startMicrophone,
  stopMediaStream
} from './media';

export async function startAllMedia(videoEl: HTMLVideoElement): Promise<{
  cameraStream: MediaStream;
  microphoneStream: MediaStream;
}> {
  const streams = await startCameraAndMicrophone();
  await attachCameraStream(videoEl, streams.cameraStream);
  return streams;
}

export async function startCameraMedia(videoEl: HTMLVideoElement): Promise<MediaStream> {
  return startCamera(videoEl);
}

export async function startMicrophoneMedia(): Promise<MediaStream> {
  return startMicrophone();
}

export function stopCameraMedia(videoEl: HTMLVideoElement | undefined, cameraStream: MediaStream | null) {
  const elementStream = videoEl?.srcObject;
  const hasMediaStreamApi = typeof MediaStream !== 'undefined';

  stopMediaStream(cameraStream);
  if (hasMediaStreamApi && elementStream instanceof MediaStream) {
    stopMediaStream(elementStream);
  }

  if (videoEl) {
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.load();
  }
}

export function stopMicrophoneMedia(microphoneStream: MediaStream | null) {
  if (microphoneStream) {
    microphoneStream.getAudioTracks().forEach((track) => {
      track.stop();
      microphoneStream.removeTrack(track);
    });
  }

  stopMediaStream(microphoneStream);
}

async function attachCameraStream(videoEl: HTMLVideoElement, stream: MediaStream) {
  videoEl.srcObject = stream;
  await videoEl.play();
}
