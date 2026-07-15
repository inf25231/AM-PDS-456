import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { getMediaErrorMessage } from '../src/lib/camera/shared/errors.ts';

describe('getMediaErrorMessage', () => {
  test('maps NotAllowedError to permission denied message', () => {
    const error = new DOMException('', 'NotAllowedError');
    assert.equal(getMediaErrorMessage('camera', error), 'Camera permission was denied.');
  });

  test('maps NotFoundError to device-not-found message', () => {
    const error = new DOMException('', 'NotFoundError');
    assert.equal(
      getMediaErrorMessage('microphone', error),
      'Microphone was not found on this device.'
    );
  });

  test('returns Error.message for regular Error', () => {
    const error = new Error('Something went wrong');
    assert.equal(getMediaErrorMessage('media', error), 'Something went wrong');
  });

  test('returns unknown fallback for non-Error values', () => {
    assert.equal(getMediaErrorMessage('media', 42), 'Unknown media error.');
  });
});
