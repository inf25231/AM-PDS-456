import {test, describe} from 'node:test';
import assert from 'node:assert/strict';

import {createRoomRegistry} from '../src/room-registry.js';

/** Pure state logic of the room registry, no LiveKit involved. */
describe('room-registry', () => {
    test('starts empty', () => {
        const registry = createRoomRegistry();
        assert.equal(registry.size(), 0);
        assert.deepEqual(registry.list(), []);
    });

    test('ensureRoom creates a room with defaults', () => {
        const registry = createRoomRegistry();
        const room = registry.ensureRoom('math-101');

        assert.equal(room.name, 'math-101');
        // displayName falls back to the room name when not provided.
        assert.equal(room.displayName, 'math-101');
        assert.deepEqual(room.metadata, {});
        assert.equal(room.participants, 0);
        assert.equal(room.emptySince, null);
        assert.ok(room.createdAt);
        assert.ok(room.updatedAt);
    });

    test('ensureRoom applies patch values', () => {
        const registry = createRoomRegistry();
        const room = registry.ensureRoom('math-101', {
            displayName: 'Math 101',
            metadata: {subject: 'math'},
            participants: 3
        });

        assert.equal(room.displayName, 'Math 101');
        assert.deepEqual(room.metadata, {subject: 'math'});
        assert.equal(room.participants, 3);
    });

    test('ensureRoom keeps createdAt on re-call', () => {
        const registry = createRoomRegistry();
        const first = registry.ensureRoom('math-101');
        const second = registry.ensureRoom('math-101', {displayName: 'Renamed'});

        // createdAt must not change, but the patch is merged in.
        assert.equal(second.createdAt, first.createdAt);
        assert.equal(second.displayName, 'Renamed');
    });

    test('get returns null when unknown', () => {
        const registry = createRoomRegistry();
        assert.equal(registry.get('does-not-exist'), null);
    });

    test('setParticipants stamps emptySince at 0', () => {
        const registry = createRoomRegistry();
        registry.ensureRoom('math-101', {participants: 2});

        // Still has people: emptySince stays null.
        let room = registry.setParticipants('math-101', 1);
        assert.equal(room.emptySince, null);

        // Everyone left: emptySince is now set to a timestamp.
        room = registry.setParticipants('math-101', 0);
        assert.ok(room.emptySince, 'emptySince should be set when the room is empty');
    });

    test('setParticipants keeps first emptySince', () => {
        const registry = createRoomRegistry();
        registry.ensureRoom('math-101');

        const firstEmpty = registry.setParticipants('math-101', 0).emptySince;
        const stillEmpty = registry.setParticipants('math-101', 0).emptySince;

        // The "empty since" moment should not reset on every sweep.
        assert.equal(stillEmpty, firstEmpty);
    });

    test('setParticipants clears emptySince on rejoin', () => {
        const registry = createRoomRegistry();
        registry.ensureRoom('math-101');

        registry.setParticipants('math-101', 0);
        const room = registry.setParticipants('math-101', 2);

        assert.equal(room.emptySince, null);
    });

    test('remove deletes and reports if it existed', () => {
        const registry = createRoomRegistry();
        registry.ensureRoom('math-101');

        assert.equal(registry.remove('math-101'), true);
        assert.equal(registry.get('math-101'), null);
        // Removing again is safe and returns false.
        assert.equal(registry.remove('math-101'), false);
    });

    test('list is sorted by name', () => {
        const registry = createRoomRegistry();
        registry.ensureRoom('physics');
        registry.ensureRoom('art');
        registry.ensureRoom('math');

        const names = registry.list().map((room) => room.name);
        assert.deepEqual(names, ['art', 'math', 'physics']);
    });
});
