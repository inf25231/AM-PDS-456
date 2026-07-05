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
    test('returns the requested name when it is free', () => {
        const service = createRoomServiceForTest();
        const name = service.buildUniqueUsername('alice', []);
        assert.equal(name, 'alice');
    });

    test('falls back to "guest" when no name is given', () => {
        const service = createRoomServiceForTest();
        assert.equal(service.buildUniqueUsername('', []), 'guest');
        assert.equal(service.buildUniqueUsername('   ', []), 'guest');
    });

    test('adds a numeric suffix when the name is taken', () => {
        const service = createRoomServiceForTest();
        const participants = [{identity: 'alice'}];
        const name = service.buildUniqueUsername('alice', participants);
        assert.equal(name, 'alice-2');
    });

    test('keeps counting up while names are taken', () => {
        const service = createRoomServiceForTest();
        const participants = [{identity: 'alice'}, {identity: 'alice-2'}];
        const name = service.buildUniqueUsername('alice', participants);
        assert.equal(name, 'alice-3');
    });

    test('matches existing names case-insensitively', () => {
        const service = createRoomServiceForTest();
        const participants = [{identity: 'Alice'}];
        const name = service.buildUniqueUsername('alice', participants);
        assert.equal(name, 'alice-2');
    });
});

describe('room-service.parseRoomPayload', () => {
    test('normalizes the name and defaults the displayName', () => {
        const service = createRoomServiceForTest();
        const payload = service.parseRoomPayload({name: '  Math 101  '});

        assert.equal(payload.name, 'math 101');
        // displayName falls back to the normalized name.
        assert.equal(payload.displayName, 'math 101');
        // displayName is always mirrored into metadata.
        assert.equal(payload.metadata.displayName, 'math 101');
    });

    test('keeps a provided displayName and merges metadata', () => {
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

    test('handles being called with no arguments', () => {
        const service = createRoomServiceForTest();
        const payload = service.parseRoomPayload();

        assert.equal(payload.name, '');
        assert.equal(payload.metadata.displayName, '');
    });
});
