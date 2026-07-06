import type { CameraEffectsState } from "$lib/camera/effects";
import {
    FACE_OVAL_INDICES,
    LEFT_EYE_INDICES,
    LIPS_INDICES,
    RIGHT_EYE_INDICES,
} from "camera-core";
import type { FaceLandmarkerResult } from "$lib/camera/tracking";

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

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

// ----------------------------------------------------------------------
// Fixed "cartoonish" cutout style
// ----------------------------------------------------------------------

/**
 * Baked-in style for cutouts. No per-region settings in the UI — the
 * user just toggles cutouts on/off and gets this look.
 *
 *   scale  : final cutout size on canvas (1 = natural, >1 = bigger)
 *   shape  : how much of the face is sampled into the clip (1 = native
 *            contour, >1 = wider, <1 = tighter)
 *   spread : horizontal drift used ONLY for the eyes (symmetric — left
 *            drifts left, right drifts right). Mouth ignores this.
 *   liftY  : vertical drift (negative = up, positive = down). Eyes lift
 *            slightly up, mouth drops slightly.
 *
 * All offsets are expressed in fractions of the FACE bbox (so they
 * scale with the user's face size in the frame).
 */
type CutoutStyle = {
    scale: number;
    shape: number;
    spreadX: number;
    liftY: number;
    rotation: number;
};

const CUTOUT_STYLE: { eyes: CutoutStyle; mouth: CutoutStyle } = {
    eyes: {
        scale: 1.3,
        shape: 1.5,
        spreadX: 0.03,
        liftY: -0.02,
        rotation: 0,
    },
    mouth: {
        scale: 1.4,
        shape: 1.6,
        spreadX: 0,
        liftY: 0.01,
        rotation: 0,
    },
};

// ----------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------

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

    return buildRegion(points);
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
    return buildRegion(regionPoints);
}

function buildRegion(points: readonly Landmark2D[]): Region2D {
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
        minX = 0; minY = 0; maxX = 0; maxY = 0;
    }

    return {
        points: points as Landmark2D[],
        bbox: { minX, minY, maxX, maxY },
    };
}

/**
 * Return a new copy of a region's contour points, scaled around its
 * center by `factor`. Used to widen/narrow the clip-path.
 */
function scaleRegionPoints(region: Region2D, factor: number): Landmark2D[] {
    if (factor === 1 || region.points.length === 0) {
        return region.points;
    }

    const centerX = (region.bbox.minX + region.bbox.maxX) / 2;
    const centerY = (region.bbox.minY + region.bbox.maxY) / 2;

    return region.points.map(([x, y]) => [
        centerX + (x - centerX) * factor,
        centerY + (y - centerY) * factor,
    ]);
}

// ----------------------------------------------------------------------
// Drawing primitives
// ----------------------------------------------------------------------

function drawPath(ctx: CanvasRenderingContext2D, points: Landmark2D[]) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
}

/**
 * Draw a single cutout (eye or mouth) with the cartoonish style baked in.
 *
 * Pipeline:
 *   1. Source rect on <video>: region bbox expanded by `shape`.
 *   2. Clip-path on canvas: region contour scaled by `shape` around its
 *      center, then translated to (center + offset), then rotated, then
 *      uniformly scaled by `scale`.
 *   3. The sampled pixels are drawn at the shaped size; the outer scale
 *      enlarges the entire cutout (path + content) as one unit.
 *
 * `flipSpreadX` is true for the LEFT eye so positive spread moves the
 * pair APART.
 */
function drawCutoutRegion(
    ctx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    regionVideo: Region2D,
    regionDisplay: Region2D,
    style: CutoutStyle,
    faceBboxSize: { width: number; height: number },
    flipSpreadX = false,
) {
    if (regionVideo.points.length < 2 || regionDisplay.points.length < 2) {
        return;
    }

    // --- Source rect on the <video> --------------------------------------
    const sourceWidth  = Math.max(1, regionVideo.bbox.maxX - regionVideo.bbox.minX);
    const sourceHeight = Math.max(1, regionVideo.bbox.maxY - regionVideo.bbox.minY);
    const sourceCenterX = (regionVideo.bbox.minX + regionVideo.bbox.maxX) / 2;
    const sourceCenterY = (regionVideo.bbox.minY + regionVideo.bbox.maxY) / 2;

    const sourceShapedW = sourceWidth  * style.shape;
    const sourceShapedH = sourceHeight * style.shape;

    const videoWidth  = Math.max(1, videoEl.videoWidth);
    const videoHeight = Math.max(1, videoEl.videoHeight);

    const rawSx = sourceCenterX - sourceShapedW / 2;
    const rawSy = sourceCenterY - sourceShapedH / 2;
    const sx = Math.min(videoWidth  - 1, Math.max(0, rawSx));
    const sy = Math.min(videoHeight - 1, Math.max(0, rawSy));
    const sw = Math.max(1, Math.min(sourceShapedW, videoWidth  - sx));
    const sh = Math.max(1, Math.min(sourceShapedH, videoHeight - sy));

    // --- Destination on the canvas ---------------------------------------
    const targetW = Math.max(1, regionDisplay.bbox.maxX - regionDisplay.bbox.minX);
    const targetH = Math.max(1, regionDisplay.bbox.maxY - regionDisplay.bbox.minY);
    const targetCenterX = (regionDisplay.bbox.minX + regionDisplay.bbox.maxX) / 2;
    const targetCenterY = (regionDisplay.bbox.minY + regionDisplay.bbox.maxY) / 2;

    // Spread/lift are fractions of FACE bbox, not region bbox.
    const effectiveSpread = flipSpreadX ? -style.spreadX : style.spreadX;
    const offsetPxX = faceBboxSize.width  * effectiveSpread;
    const offsetPxY = faceBboxSize.height * style.liftY;

    const shapedW = targetW * style.shape;
    const shapedH = targetH * style.shape;

    const shapedPoints = scaleRegionPoints(regionDisplay, style.shape);
    const rotation = (style.rotation * Math.PI) / 180;

    ctx.save();
    ctx.translate(targetCenterX + offsetPxX, targetCenterY + offsetPxY);
    if (rotation !== 0) ctx.rotate(rotation);
    if (style.scale !== 1) ctx.scale(style.scale, style.scale);

    // Clip-path in local (centered) coords.
    ctx.beginPath();
    const first = shapedPoints[0];
    ctx.moveTo(first[0] - targetCenterX, first[1] - targetCenterY);
    for (let i = 1; i < shapedPoints.length; i += 1) {
        const [px, py] = shapedPoints[i];
        ctx.lineTo(px - targetCenterX, py - targetCenterY);
    }
    ctx.closePath();
    ctx.clip();

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
        videoEl,
        sx, sy, sw, sh,
        -shapedW / 2, -shapedH / 2, shapedW, shapedH,
    );

    ctx.restore();
}

// ----------------------------------------------------------------------
// Landmarks debug
// ----------------------------------------------------------------------

function drawLandmarksDebug(
    ctx: CanvasRenderingContext2D,
    allPoints: Landmark2D[],
    faceOval: Region2D,
) {
    // Dots for every landmark
    ctx.fillStyle = "rgba(125, 211, 252, 0.8)";
    for (const [x, y] of allPoints) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // Face oval outline
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
    ctx.lineWidth = 1.2;
    drawPath(ctx, faceOval.points);
    ctx.stroke();
    ctx.restore();
}

// ----------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------

/**
 * Paint 2D effects (cutouts + landmarks) on the target context.
 *
 * `clear` defaults to true for standalone overlays. Composition rendering
 * passes `clear: false` so webcam/background/model layers stay intact.
 */
export function drawCameraEffectsOverlay(
    ctx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    result: FaceLandmarkerResult | null,
    effects: CameraEffectsState,
    options: { clear?: boolean } = {},
) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    if (options.clear !== false) {
        ctx.clearRect(0, 0, width, height);
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
    const leftEyeVideo  = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, LEFT_EYE_INDICES);
    const rightEyeVideo = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, RIGHT_EYE_INDICES);
    const lipsVideo     = toVideoRegion(videoFaceLandmarks, videoEl.videoWidth, videoEl.videoHeight, LIPS_INDICES);

    const leftEye  = toRegion(allPoints, LEFT_EYE_INDICES);
    const rightEye = toRegion(allPoints, RIGHT_EYE_INDICES);
    const lips     = toRegion(allPoints, LIPS_INDICES);
    const faceOval = toRegion(allPoints, FACE_OVAL_INDICES);

    // Cutouts (fixed cartoonish style).
    if (effects.cutouts.enabled) {
        const faceBboxSize = {
            width:  Math.max(1, faceOval.bbox.maxX - faceOval.bbox.minX),
            height: Math.max(1, faceOval.bbox.maxY - faceOval.bbox.minY),
        };

        // Eyes — left eye gets flipped spread so positive spread = APART.
        drawCutoutRegion(ctx, videoEl, leftEyeVideo,  leftEye,  CUTOUT_STYLE.eyes,  faceBboxSize, true);
        drawCutoutRegion(ctx, videoEl, rightEyeVideo, rightEye, CUTOUT_STYLE.eyes,  faceBboxSize, false);
        drawCutoutRegion(ctx, videoEl, lipsVideo,     lips,     CUTOUT_STYLE.mouth, faceBboxSize, false);
    }

    // Landmarks debug — always last so it sits on top.
    if (effects.showLandmarksDebug) {
        drawLandmarksDebug(ctx, allPoints, faceOval);
    }
}