import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createLivekitAdmin } from '../src/livekit-admin.js';

// normalizeRoomName is a pure string function. It is exposed on the admin
// object, so we build one with a dummy config (it never touches the network
// for this function).
function getNormalize() {
  const admin = createLivekitAdmin({
    livekitUrl: 'wss://example.test',
    livekitApiKey: 'key',
    livekitApiSecret: 'secret',
    roomEmptyTtlMs: 60000
  });
  return admin.normalizeRoomName;
}

describe('livekit-admin.normalizeRoomName', () => {
  test('lowercases the name', () => {
    const normalize = getNormalize();
    assert.equal(normalize('MathRoom'), 'mathroom');
  });

  test('trims surrounding whitespace', () => {
    const normalize = getNormalize();
    assert.equal(normalize('  math  '), 'math');
  });

  test('replaces inner spaces with dashes', () => {
    const normalize = getNormalize();
    assert.equal(normalize('Math 101'), 'math-101');
  });

  test('collapses multiple spaces to one dash', () => {
    const normalize = getNormalize();
    assert.equal(normalize('a   b'), 'a-b');
  });

  test('strips disallowed characters', () => {
    const normalize = getNormalize();
    assert.equal(normalize('Math#101!'), 'math101');
    assert.equal(normalize('room_1-a'), 'room_1-a');
  });

  test('returns empty for empty/nullish input', () => {
    const normalize = getNormalize();
    assert.equal(normalize(''), '');
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
  });

  test('caps the result at 64 characters', () => {
    const normalize = getNormalize();
    const longName = 'a'.repeat(100);
    assert.equal(normalize(longName).length, 64);
  });
});
