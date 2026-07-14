import { FACE_OVAL_INDICES } from '$lib/camera/effects/geometry/face-region-indices.ts';
import type { FaceLandmarkerResult } from '$lib/camera/effects/tracking.ts';

type Landmark2D = readonly [x: number, y: number];

function computeCoverTransform(
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number
): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
  return {
    scale,
    offsetX: (displayWidth - videoWidth * scale) / 2,
    offsetY: (displayHeight - videoHeight * scale) / 2
  };
}

function drawPath(ctx: CanvasRenderingContext2D, points: Landmark2D[]): void {
  if (!points.length) return;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  ctx.closePath();
}

/** Draw the tracked face landmarks over the composition canvas for debugging. */
export function drawLandmarksDebug(
  ctx: CanvasRenderingContext2D,
  videoEl: HTMLVideoElement,
  result: FaceLandmarkerResult | null
): void {
  const landmarks = result?.faceLandmarks[0];
  if (!landmarks?.length || !videoEl.videoWidth || !videoEl.videoHeight) return;

  const { scale, offsetX, offsetY } = computeCoverTransform(
    videoEl.videoWidth,
    videoEl.videoHeight,
    ctx.canvas.width,
    ctx.canvas.height
  );
  const points = landmarks.map(
    (point) =>
      [
        point.x * videoEl.videoWidth * scale + offsetX,
        point.y * videoEl.videoHeight * scale + offsetY
      ] as const
  );

  ctx.fillStyle = 'rgba(125, 211, 252, 0.8)';
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const faceOval = FACE_OVAL_INDICES.map((index) => points[index]).filter(
    (point): point is Landmark2D => Boolean(point)
  );
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.lineWidth = 1.2;
  drawPath(ctx, faceOval);
  ctx.stroke();
  ctx.restore();
}
