import type { CameraEffectsState } from "$lib/camera/effects";
import {
    FACE_OVAL_INDICES,
    LEFT_EYE_INDICES,
    LIPS_INDICES,
    RIGHT_EYE_INDICES,
} from "$lib/camera/face-region-indices";
import type { FaceLandmarkerResult } from "$lib/camera/tracking";

type Landmark2D = readonly [x: number, y: number];

type Region2D = {
    points: Landmark2D[];
    bbox: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
    };
};

const imageCache = new Map<string, HTMLImageElement>();

function toVideoRegion(
    normalizedPoints: Array<{ x: number; y: number }> | undefined,
    videoWidth: number,
    videoHeight: number,
    indices: readonly number[],
): Region2D {
    const points = indices
        .map((index) => normalizedPoints?.[index])
        .filter((point): point is { x: number; y: number } => Boolean(point))
        .map((point) => [point.x * videoWidth, point.y * videoHeight] as const);

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }

    return { points, bbox: { minX, minY, maxX, maxY } };
}

function computeCoverTransform(
    videoWidth: number,
    videoHeight: number,
    displayWidth: number,
    displayHeight: number,
) {
    if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
        return { scale: 1, offsetX: 0, offsetY: 0 };
    }

    const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
    return {
        scale,
        offsetX: (displayWidth - videoWidth * scale) / 2,
        offsetY: (displayHeight - videoHeight * scale) / 2,
    };
}

function resolveImage(src: string | null) {
    if (!src) {
        return null;
    }

    const cached = imageCache.get(src);
    if (cached) {
        return cached.complete ? cached : null;
    }

    const image = new Image();
    image.src = src;
    imageCache.set(src, image);
    return null;
}

function getDisplayPoints(
    normalizedPoints: Array<{ x: number; y: number }> | undefined,
    videoWidth: number,
    videoHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number,
): Landmark2D[] {
    if (!normalizedPoints || normalizedPoints.length === 0) {
        return [];
    }

    return normalizedPoints.map((point) => [
        point.x * videoWidth * scale + offsetX,
        point.y * videoHeight * scale + offsetY,
    ]);
}

function toRegion(points: Landmark2D[], indices: readonly number[]): Region2D {
    const regionPoints = indices
        .map((index) => points[index])
        .filter((point): point is Landmark2D => Boolean(point));

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [x, y] of regionPoints) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }

    if (!Number.isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 0;
        maxY = 0;
    }

    return {
        points: regionPoints,
        bbox: { minX, minY, maxX, maxY },
    };
}

function drawPath(ctx: CanvasRenderingContext2D, points: Landmark2D[]) {
    if (!points.length) {
        return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
        ctx.lineTo(points[index][0], points[index][1]);
    }
    ctx.closePath();
}

function drawRegionCutout(
    ctx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    regionVideo: Region2D,
    regionDisplay: Region2D,
    alpha: number,
    scaleUp: number,
    offsetXRatio: number,
    offsetYRatio: number,
) {
    if (alpha <= 0 || regionVideo.points.length < 2 || regionDisplay.points.length < 2) {
        return;
    }

    const sourceWidth = Math.max(1, regionVideo.bbox.maxX - regionVideo.bbox.minX);
    const sourceHeight = Math.max(1, regionVideo.bbox.maxY - regionVideo.bbox.minY);
    const sourceCenterX = (regionVideo.bbox.minX + regionVideo.bbox.maxX) / 2;
    const sourceCenterY = (regionVideo.bbox.minY + regionVideo.bbox.maxY) / 2;

    const targetWidth = Math.max(1, regionDisplay.bbox.maxX - regionDisplay.bbox.minX);
    const targetHeight = Math.max(1, regionDisplay.bbox.maxY - regionDisplay.bbox.minY);
    const targetCenterX = (regionDisplay.bbox.minX + regionDisplay.bbox.maxX) / 2;
    const targetCenterY = (regionDisplay.bbox.minY + regionDisplay.bbox.maxY) / 2;

    const drawWidth = targetWidth * scaleUp;
    const drawHeight = targetHeight * scaleUp;
    const drawX = targetCenterX - drawWidth / 2 + targetWidth * offsetXRatio;
    const drawY = targetCenterY - drawHeight / 2 + targetHeight * offsetYRatio;

    const videoWidth = Math.max(1, videoEl.videoWidth);
    const videoHeight = Math.max(1, videoEl.videoHeight);
    const rawSx = sourceCenterX - sourceWidth * 0.62;
    const rawSy = sourceCenterY - sourceHeight * 0.62;
    const rawSw = sourceWidth * 1.24;
    const rawSh = sourceHeight * 1.24;
    const sx = Math.min(videoWidth - 1, Math.max(0, rawSx));
    const sy = Math.min(videoHeight - 1, Math.max(0, rawSy));
    const sw = Math.max(1, Math.min(rawSw, videoWidth - sx));
    const sh = Math.max(1, Math.min(rawSh, videoHeight - sy));

    ctx.save();
    ctx.globalAlpha = alpha;
    drawPath(ctx, regionDisplay.points);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(videoEl, sx, sy, sw, sh, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
}

function drawLandmarkDebug(ctx: CanvasRenderingContext2D, allPoints: Landmark2D[]) {
    ctx.fillStyle = "rgba(125, 211, 252, 0.8)";
    for (const [x, y] of allPoints) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBackgroundImage(
    ctx: CanvasRenderingContext2D,
    effects: CameraEffectsState,
    width: number,
    height: number,
) {
    if (!effects.background.url || effects.background.opacity <= 0) {
        return;
    }

    const backgroundImage = resolveImage(effects.background.url);
    if (!backgroundImage) {
        return;
    }

    const imageWidth = Math.max(1, backgroundImage.naturalWidth || width);
    const imageHeight = Math.max(1, backgroundImage.naturalHeight || height);
    const coverScale = Math.max(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * coverScale * effects.background.scale;
    const drawHeight = imageHeight * coverScale * effects.background.scale;
    const drawX = (width - drawWidth) / 2 + width * effects.background.offsetX;
    const drawY = (height - drawHeight) / 2 + height * effects.background.offsetY;

    ctx.save();
    ctx.globalAlpha = effects.background.opacity;
    ctx.drawImage(backgroundImage, drawX, drawY, drawWidth, drawHeight);
    ctx.restore();
}

export function drawCameraEffectsOverlay(
    ctx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    result: FaceLandmarkerResult | null,
    effects: CameraEffectsState,
    options: { drawBackground?: boolean } = {},
) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const { drawBackground = true } = options;

    ctx.clearRect(0, 0, width, height);
    if (drawBackground) {
        drawBackgroundImage(ctx, effects, width, height);
    }

    if (!result?.faceLandmarks?.length) {
        return;
    }

    const { scale, offsetX, offsetY } = computeCoverTransform(
        videoEl.videoWidth,
        videoEl.videoHeight,
        width,
        height,
    );

    const allPoints = getDisplayPoints(
        result.faceLandmarks[0],
        videoEl.videoWidth,
        videoEl.videoHeight,
        scale,
        offsetX,
        offsetY,
    );

    const videoFaceLandmarks = result.faceLandmarks[0];
    const leftEyeVideo = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, LEFT_EYE_INDICES);
    const rightEyeVideo = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, RIGHT_EYE_INDICES);
    const lipsVideo = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, LIPS_INDICES);

    const leftEye = toRegion(allPoints, LEFT_EYE_INDICES);
    const rightEye = toRegion(allPoints, RIGHT_EYE_INDICES);
    const lips = toRegion(allPoints, LIPS_INDICES);
    const faceOval = toRegion(allPoints, FACE_OVAL_INDICES);

    if (effects.overlayBackgroundAlpha > 0 && effects.mode !== "off") {
        ctx.save();
        ctx.fillStyle = `rgba(15, 23, 42, ${effects.overlayBackgroundAlpha})`;
        drawPath(ctx, faceOval.points);
        ctx.fill();
        ctx.restore();
    }

    if (effects.showLandmarksDebug) {
        drawLandmarkDebug(ctx, allPoints);
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
        ctx.lineWidth = 1.2;
        drawPath(ctx, faceOval.points);
        ctx.stroke();
        ctx.restore();
    }

    if (effects.mode === "funny-mask") {
        const funnyMaskImage = resolveImage(effects.funnyMask.url);
        if (funnyMaskImage) {
            const faceWidth = Math.max(1, faceOval.bbox.maxX - faceOval.bbox.minX);
            const faceHeight = Math.max(1, faceOval.bbox.maxY - faceOval.bbox.minY);
            const centerX = (faceOval.bbox.minX + faceOval.bbox.maxX) / 2;
            const centerY = (faceOval.bbox.minY + faceOval.bbox.maxY) / 2;

            const drawWidth = faceWidth * effects.funnyMask.scale;
            const drawHeight = faceHeight * effects.funnyMask.scale;
            const drawX =
                centerX - drawWidth / 2 + faceWidth * effects.funnyMask.offsetX;
            const drawY =
                centerY - drawHeight / 2 + faceHeight * effects.funnyMask.offsetY;

            ctx.save();
            ctx.globalAlpha = effects.funnyMask.opacity;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(funnyMaskImage, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
        }

        drawRegionCutout(
            ctx,
            videoEl,
            leftEyeVideo,
            leftEye,
            effects.eyes.alpha,
            effects.eyes.scale,
            effects.eyes.offsetX,
            effects.eyes.offsetY,
        );
        drawRegionCutout(
            ctx,
            videoEl,
            rightEyeVideo,
            rightEye,
            effects.eyes.alpha,
            effects.eyes.scale,
            effects.eyes.offsetX,
            effects.eyes.offsetY,
        );
        drawRegionCutout(
            ctx,
            videoEl,
            lipsVideo,
            lips,
            effects.mouth.alpha,
            effects.mouth.scale,
            effects.mouth.offsetX,
            effects.mouth.offsetY,
        );
    }

    if (effects.mode === "mask-3d") {
        drawRegionCutout(
            ctx,
            videoEl,
            leftEyeVideo,
            leftEye,
            effects.eyes.alpha,
            effects.eyes.scale,
            effects.eyes.offsetX,
            effects.eyes.offsetY,
        );
        drawRegionCutout(
            ctx,
            videoEl,
            rightEyeVideo,
            rightEye,
            effects.eyes.alpha,
            effects.eyes.scale,
            effects.eyes.offsetX,
            effects.eyes.offsetY,
        );
        drawRegionCutout(
            ctx,
            videoEl,
            lipsVideo,
            lips,
            effects.mouth.alpha,
            effects.mouth.scale,
            effects.mouth.offsetX,
            effects.mouth.offsetY,
        );
    }
}





