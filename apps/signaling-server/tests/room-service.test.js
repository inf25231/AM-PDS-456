import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {createRoomService} from '../src/room-service.js';

// A tiny fake LiveKit admin. The room service only needs normalizeRoomName
// for the functions we test here, so we keep the fake minimal.
function createFakeLivekit() {
    return {
        normalizeRoomName(name) {
            return String(name || '').trim().toLowerCase();
        }
    };
}

// The registry is not exercised by these particular functions, so an empty
// object is enough to satisfy the dependency injection.
function createRoomServiceForTest() {
    return createRoomService({
        livekit: createFakeLivekit(),
        roomRegistry: {}
    });
}

describe('room-service.buildUniqueUsername', () => {
    test('returns the name when free', () => {
        const service = createRoomServiceForTest();
        const name = service.buildUniqueUsername('alice', []);
        assert.equal(name, 'alice');
    });

    test('falls back to "guest" when empty', () => {
        const service = createRoomServiceForTest();
        assert.equal(service.buildUniqueUsername('', []), 'guest');
    });

    test('treats whitespace-only as empty', () => {
        const service = createRoomServiceForTest();
        assert.equal(service.buildUniqueUsername('   ', []), 'guest');
    });

    test('adds a numeric suffix when taken', () => {
        const service = createRoomServiceForTest();
        const participants = [{identity: 'alice'}];
        const name = service.buildUniqueUsername('alice', participants);
        assert.equal(name, 'alice-2');
    });

    test('matches names case-insensitively', () => {
        const service = createRoomServiceForTest();
        const participants = [{identity: 'Alice'}];
        const name = service.buildUniqueUsername('alice', participants);
        assert.equal(name, 'alice-2');
    });
});

describe('room-service.parseRoomPayload', () => {
    test('normalizes name, defaults displayName', () => {
        const service = createRoomServiceForTest();
        const payload = service.parseRoomPayload({name: '  Math 101  '});

        assert.equal(payload.name, 'math 101');
        // displayName falls back to the normalized name.
        assert.equal(payload.displayName, 'math 101');
        // displayName is always mirrored into metadata.
        assert.equal(payload.metadata.displayName, 'math 101');
    });

    test('keeps displayName, merges metadata', () => {
        const service = createRoomServiceForTest();
        const payload = service.parseRoomPayload({
            name: 'math',
            displayName: 'Math 101',
            metadata: {subject: 'math'}
        });

        assert.equal(payload.displayName, 'Math 101');
        assert.deepEqual(payload.metadata, {
            subject: 'math',
            displayName: 'Math 101'
        });
    });

    test('handles no arguments', () => {
        const service = createRoomServiceForTest();
        const payload = service.parseRoomPayload();

        assert.equal(payload.name, '');
        assert.equal(payload.metadata.displayName, '');
    });
});
