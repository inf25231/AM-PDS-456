import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult
} from '@mediapipe/tasks-vision';
import { computeDownscaledSize } from 'camera-core';

const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

const WASM_FILES_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';

let landmarkerPromise: Promise<FaceLandmarker> | null = null;

export function createFaceLandmarker(): Promise<FaceLandmarker> {
  return (
    landmarkerPromise ??
    (landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_FILES_URL);

      return FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_URL,
          delegate: 'GPU'
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
        minFacePresenceConfidence: 0.6
      });
    })())
  );
}

export async function waitForVideoReady(videoEl: HTMLVideoElement): Promise<void> {
  if (
    videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    videoEl.videoWidth > 0 &&
    videoEl.videoHeight > 0
  ) {
    return;
  }

  await new Promise<void>((resolve) => {
    videoEl.addEventListener('loadeddata', () => resolve(), { once: true });
  });
}

/** Longest edge, in pixels, fed to MediaPipe for face-landmark inference. */
const MAX_INFERENCE_DIMENSION = 480;

/**
 * Draws the current video frame onto a small reused offscreen canvas so
 * MediaPipe never has to preprocess a full 1080p/720p frame. Falls back to
 * the raw video element if a 2D context couldn't be created.
 */
function downscaleForInference(
  videoEl: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D | null
): HTMLVideoElement | HTMLCanvasElement {
  const videoWidth = videoEl.videoWidth;
  const videoHeight = videoEl.videoHeight;
  if (!ctx || !videoWidth || !videoHeight) {
    return videoEl;
  }

  const { width, height } = computeDownscaledSize(videoWidth, videoHeight, MAX_INFERENCE_DIMENSION);
  if (width === videoWidth && height === videoHeight) {
    // Already small enough (e.g. 360p/480p quality) -- skip the extra draw.
    return videoEl;
  }

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.drawImage(videoEl, 0, 0, width, height);
  return canvas;
}

export function startFaceTracking(
  videoEl: HTMLVideoElement,
  onResults: (result: FaceLandmarkerResult) => void,
  options: { targetFps?: number; suspendWhenHidden?: boolean } = {}
): () => void {
  let stopped = false;
  let animationFrameId = 0;
  let lastVideoTime = -1;
  let lastInferTime = 0;
  const targetFps = Math.max(1, options.targetFps ?? 12);
  const minIntervalMs = 1000 / targetFps;
  const suspendWhenHidden = options.suspendWhenHidden ?? true;

  // MediaPipe's own face-landmark model resizes its input to a small fixed
  // size internally regardless of what we feed it, so passing the raw
  // camera frame at full resolution (up to 1920x1080 for the "1080p"
  // quality preset) only adds GPU texture-upload + preprocessing cost for
  // no accuracy benefit. Downscale onto a small offscreen canvas first --
  // this decouples face-tracking cost from the selected video quality.
  // Output landmarks are normalized [0, 1] coordinates, so no remapping is
  // needed downstream regardless of the input size used here.
  const inferenceCanvas = document.createElement('canvas');
  const inferenceCtx = inferenceCanvas.getContext('2d', { willReadFrequently: false });

  void (async () => {
    const [landmarker] = await Promise.all([createFaceLandmarker(), waitForVideoReady(videoEl)]);

    const predict = (now: number) => {
      if (stopped) {
        return;
      }

      if (suspendWhenHidden && typeof document !== 'undefined' && document.hidden) {
        animationFrameId = requestAnimationFrame(predict);
        return;
      }

      if (
        videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoEl.currentTime !== lastVideoTime &&
        now - lastInferTime >= minIntervalMs
      ) {
        lastVideoTime = videoEl.currentTime;
        lastInferTime = now;

        const source = downscaleForInference(videoEl, inferenceCanvas, inferenceCtx);
        onResults(landmarker.detectForVideo(source, now));
      }

      animationFrameId = requestAnimationFrame(predict);
    };

    animationFrameId = requestAnimationFrame(predict);
  })();

  return () => {
    stopped = true;
    cancelAnimationFrame(animationFrameId);
  };
}

export type { FaceLandmarkerResult };
