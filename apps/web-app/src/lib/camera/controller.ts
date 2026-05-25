/**
 * Browser-facing media controller used by the camera route.
 *
 * Responsibilities:
 * - start camera and microphone streams through camera-core
 * - attach camera streams to the current video element
 * - stop streams and clean up the DOM element state
 *
 * This file intentionally stays thin. Constraint building, device selection,
 * and fallback logic live in other modules so the route can orchestrate them
 * without duplicating browser-specific teardown code.
 */

import {
  startCamera,
  startCameraAndMicrophone,
  startMicrophone,
  stopMediaStream
} from 'camera-core';

export async function startAllMedia(
  videoEl: HTMLVideoElement,
  constraints?: MediaStreamConstraints
): Promise<{
  cameraStream: MediaStream;
  microphoneStream: MediaStream;
}> {
  const streams = await startCameraAndMicrophone(constraints);
  await attachCameraStream(videoEl, streams.cameraStream);
  return streams;
}

/**
 * Starts only the camera stream and attaches it to the provided video element.
 */
export async function startCameraMedia(
  videoEl: HTMLVideoElement,
  constraints?: MediaStreamConstraints
): Promise<MediaStream> {
  return startCamera(videoEl, constraints);
}

/**
 * Starts only the microphone stream.
 */
export async function startMicrophoneMedia(
  constraints?: MediaStreamConstraints
): Promise<MediaStream> {
  return startMicrophone(constraints);
}

/**
 * Stops the active camera stream and clears the video element state.
 *
 * The route may hand in both the remembered stream reference and the current
 * srcObject stream. Cleaning both avoids stale tracks after restart flows.
 */
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

/**
 * Stops microphone tracks and then delegates to the shared stream cleanup.
 */
export function stopMicrophoneMedia(microphoneStream: MediaStream | null) {
  if (microphoneStream) {
    microphoneStream.getAudioTracks().forEach((track) => {
      track.stop();
      microphoneStream.removeTrack(track);
    });
  }

  stopMediaStream(microphoneStream);
}

/**
 * Attaches a camera stream to the video element and starts playback.
 */
async function attachCameraStream(videoEl: HTMLVideoElement, stream: MediaStream) {
  videoEl.srcObject = stream;
  await videoEl.play();
}
