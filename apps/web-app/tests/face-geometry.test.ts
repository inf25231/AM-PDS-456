import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeCoverTransform,
  averagePoint,
  getBBox,
  type MappedPoint
} from '../src/lib/camera/effects/geometry/face-geometry.ts';

describe('computeCoverTransform', () => {
  test('returns identity-ish defaults when any dimension is zero/missing', () => {
    assert.deepEqual(computeCoverTransform(0, 100, 200, 200), { scale: 1, offsetX: 0, offsetY: 0 });
    assert.deepEqual(computeCoverTransform(100, 0, 200, 200), { scale: 1, offsetX: 0, offsetY: 0 });
    assert.deepEqual(computeCoverTransform(100, 100, 0, 200), { scale: 1, offsetX: 0, offsetY: 0 });
    assert.deepEqual(computeCoverTransform(100, 100, 200, 0), { scale: 1, offsetX: 0, offsetY: 0 });
  });

  test('scales up to cover a wider display (crops vertically)', () => {
    // 100x100 source into a 200x50 display: must scale by 2 (covers width),
    // and crop top/bottom evenly.
    const result = computeCoverTransform(100, 100, 200, 50);
    assert.equal(result.scale, 2);
    assert.equal(result.offsetX, 0);
    assert.equal(result.offsetY, (50 - 100 * 2) / 2);
  });

  test('scales up to cover a taller display (crops horizontally)', () => {
    // 100x100 source into a 50x200 display: must scale by 2 (covers height).
    const result = computeCoverTransform(100, 100, 50, 200);
    assert.equal(result.scale, 2);
    assert.equal(result.offsetY, 0);
    assert.equal(result.offsetX, (50 - 100 * 2) / 2);
  });

  test('same aspect ratio yields no offset', () => {
    const result = computeCoverTransform(100, 100, 300, 300);
    assert.equal(result.scale, 3);
    assert.equal(result.offsetX, 0);
    assert.equal(result.offsetY, 0);
  });
});

describe('averagePoint', () => {
  const points: MappedPoint[] = [
    [0, 0, 0],
    [10, 20, 30],
    [20, 40, 60]
  ];

  test('averages the requested indices', () => {
    assert.deepEqual(averagePoint(points, [0, 1, 2]), [10, 20, 30]);
  });

  test('skips missing indices instead of treating them as zero', () => {
    // index 5 doesn't exist -- must be skipped, not counted as [0,0,0].
    assert.deepEqual(averagePoint(points, [1, 5]), [10, 20, 30]);
  });

  test('returns [0, 0, 0] when no indices resolve to a point', () => {
    assert.deepEqual(averagePoint(points, [99]), [0, 0, 0]);
  });

  test('returns [0, 0, 0] for an empty index list', () => {
    assert.deepEqual(averagePoint(points, []), [0, 0, 0]);
  });
});

describe('getBBox', () => {
  const points: MappedPoint[] = [
    [-5, 10, 0],
    [15, -2, 0],
    [3, 3, 0]
  ];

  test('computes min/max x and y across the requested indices', () => {
    assert.deepEqual(getBBox(points, [0, 1, 2]), { minX: -5, minY: -2, maxX: 15, maxY: 10 });
  });

  test('ignores points outside the requested indices', () => {
    assert.deepEqual(getBBox(points, [2]), { minX: 3, minY: 3, maxX: 3, maxY: 3 });
  });

  test('returns all-zero bbox when no indices resolve to a point', () => {
    assert.deepEqual(getBBox(points, [99]), { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
