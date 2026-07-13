// Pure 2D/3D face-landmark geometry helpers, extracted from
// three-mask-renderer.ts so they can be unit tested without a THREE.js /
// WebGL / browser environment.

export type MappedPoint = readonly [x: number, y: number, z: number];

/**
 * "Cover" fit transform (like CSS `object-fit: cover`): scale + center a
 * `videoWidth`x`videoHeight` source so it fully covers a
 * `displayWidth`x`displayHeight` area, cropping the overflow evenly on both
 * axes.
 */
export function computeCoverTransform(
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number
) {
  if (!videoWidth || !videoHeight || !displayWidth || !displayHeight) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const scale = Math.max(displayWidth / videoWidth, displayHeight / videoHeight);
  return {
    scale,
    offsetX: (displayWidth - videoWidth * scale) / 2,
    offsetY: (displayHeight - videoHeight * scale) / 2
  };
}

/** Average position of the given landmark indices (missing indices skipped). */
export function averagePoint(points: MappedPoint[], indices: readonly number[]) {
  let count = 0;
  let totalX = 0;
  let totalY = 0;
  let totalZ = 0;

  for (const index of indices) {
    const point = points[index];
    if (!point) {
      continue;
    }
    count += 1;
    totalX += point[0];
    totalY += point[1];
    totalZ += point[2];
  }

  if (count === 0) {
    return [0, 0, 0] as const;
  }

  return [totalX / count, totalY / count, totalZ / count] as const;
}

/** Axis-aligned bounding box (x/y only) of the given landmark indices. */
export function getBBox(points: MappedPoint[], indices: readonly number[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const index of indices) {
    const point = points[index];
    if (!point) {
      continue;
    }
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}
