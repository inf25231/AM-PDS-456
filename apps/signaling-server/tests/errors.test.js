import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {isRoomMissingError} from '../src/errors.js';

// isRoomMissingError decides whether a thrown error means "the room is already
// gone on LiveKit". The cleanup loop relies on this to deregister rooms safely.
describe('isRoomMissingError', () => {
    test('is true for known "missing room" messages', () => {
        assert.equal(isRoomMissingError(new Error('Room not found')), true);
        assert.equal(isRoomMissingError(new Error('room does not exist')), true);
        assert.equal(isRoomMissingError(new Error('unknown room xyz')), true);
    });

    test('is case-insensitive', () => {
        assert.equal(isRoomMissingError(new Error('ROOM NOT FOUND')), true);
    });

    test('is false for unrelated errors', () => {
        assert.equal(isRoomMissingError(new Error('network timeout')), false);
        assert.equal(isRoomMissingError(new Error('permission denied')), false);
    });

    test('is false for null/undefined or empty errors', () => {
        assert.equal(isRoomMissingError(null), false);
        assert.equal(isRoomMissingError(undefined), false);
        assert.equal(isRoomMissingError({}), false);
    });
});
