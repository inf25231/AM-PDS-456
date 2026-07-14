import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultCameraEffectsState,
  normalizeEffectsState,
  setBackgroundImage,
  setDemoModel,
  setModelFile,
  DEMO_RACCOON_MODEL_URL,
  type BackgroundState,
  type ModelState
} from '../src/lib/camera/effects/state.ts';

describe('effects state defaults and normalization', () => {
  test('createDefaultCameraEffectsState returns expected defaults', () => {
    const state = createDefaultCameraEffectsState();
    assert.equal(state.webcamVisibility, 'visible');
    assert.equal(state.showLandmarksDebug, false);
    assert.deepEqual(state.background, {
      kind: 'none',
      imageUrl: null,
      imageName: ''
    });
    assert.deepEqual(state.model, {
      enabled: false,
      url: null,
      name: '',
      source: 'none',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationY: 0
    });
  });

  test('normalizeEffectsState clamps model transform values', () => {
    const normalized = normalizeEffectsState({
      ...createDefaultCameraEffectsState(),
      model: {
        ...createDefaultCameraEffectsState().model,
        scale: 99,
        offsetX: -5,
        offsetY: 5,
        rotationY: 720
      }
    });

    assert.equal(normalized.model.scale, 5);
    assert.equal(normalized.model.offsetX, -1);
    assert.equal(normalized.model.offsetY, 1);
    assert.equal(normalized.model.rotationY, 180);
  });
});

describe('effects state file/model helpers', () => {
  test('setBackgroundImage clears state when file is null and revokes old url', () => {
    const previous: BackgroundState = {
      kind: 'image',
      imageUrl: 'blob:old-bg',
      imageName: 'old.png'
    };

    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    try {
      const next = setBackgroundImage(previous, null);
      assert.deepEqual(next, { kind: 'none', imageUrl: null, imageName: '' });
      assert.deepEqual(revoked, ['blob:old-bg']);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test('setModelFile(null) clears model and revokes custom model URL', () => {
    const previous: ModelState = {
      enabled: true,
      url: 'blob:custom-model',
      name: 'avatar.glb',
      source: 'custom',
      scale: 1.2,
      offsetX: 0.1,
      offsetY: -0.1,
      rotationY: 15
    };

    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    try {
      const next = setModelFile(previous, null);
      assert.equal(next.enabled, false);
      assert.equal(next.url, null);
      assert.equal(next.name, '');
      assert.equal(next.source, 'none');
      assert.deepEqual(revoked, ['blob:custom-model']);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });

  test('setDemoModel switches to demo URL and revokes custom model URL', () => {
    const previous: ModelState = {
      enabled: true,
      url: 'blob:custom-model',
      name: 'avatar.glb',
      source: 'custom',
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      rotationY: 0
    };

    const revoked: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    try {
      const next = setDemoModel(previous);
      assert.equal(next.enabled, true);
      assert.equal(next.url, DEMO_RACCOON_MODEL_URL);
      assert.equal(next.name, 'Raccoon head (demo)');
      assert.equal(next.source, 'demo');
      assert.deepEqual(revoked, ['blob:custom-model']);
    } finally {
      URL.revokeObjectURL = originalRevoke;
    }
  });
});
