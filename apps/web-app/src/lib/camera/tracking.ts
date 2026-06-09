import {
    FaceLandmarker,
    FilesetResolver,
    type FaceLandmarkerResult
} from '@mediapipe/tasks-vision';

const MODEL_ASSET_URL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task';

const WASM_FILES_URL =
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm';

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

export function startFaceTracking(
    videoEl: HTMLVideoElement,
    onResults: (result: FaceLandmarkerResult) => void,
    options: { targetFps?: number; suspendWhenHidden?: boolean } = {},
): () => void {
    let stopped = false;
    let animationFrameId = 0;
    let lastVideoTime = -1;
    let lastInferTime = 0;
    const targetFps = Math.max(1, options.targetFps ?? 12);
    const minIntervalMs = 1000 / targetFps;
    const suspendWhenHidden = options.suspendWhenHidden ?? true;

    void (async () => {
        const [landmarker] = await Promise.all([
            createFaceLandmarker(),
            waitForVideoReady(videoEl)
        ]);

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
                onResults(landmarker.detectForVideo(videoEl, now));
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