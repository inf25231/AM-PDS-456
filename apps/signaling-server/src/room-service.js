/**
 * Creates the room service — a high-level orchestration layer that combines
 * LiveKit API calls with local registry state updates.
 *
 * This is the correct place for logic that requires both a LiveKit operation
 * AND a registry update. Route handlers should call this service, not livekit directly.
 *
 * @param {{ livekit: ReturnType<import('./livekit-admin.js').createLivekitAdmin>, roomRegistry: ReturnType<import('./room-registry.js').createRoomRegistry> }} deps
 */
export function createRoomService({livekit, roomRegistry}) {
    function parseRoomPayload(input = {}) {
        const name = livekit.normalizeRoomName(input.name);

        // Use the given displayName, otherwise fall back to the room name.
        const displayName = String(input.displayName || name).trim() || name;

        // Only use the incoming metadata if it is actually an object.
        let baseMetadata = {};
        if (typeof input.metadata === 'object' && input.metadata) {
            baseMetadata = input.metadata;
        }

        const metadata = {
            ...baseMetadata,
            displayName
        };

        return {
            name,
            displayName,
            metadata
        };
    }

    async function syncRoomParticipants(roomName) {
        const participants = await livekit.listParticipants(roomName);
        roomRegistry.setParticipants(roomName, participants.length);
        return participants;
    }

    async function syncAllRooms() {
        const rooms = await livekit.listRooms();
        for (const room of rooms) {
            roomRegistry.ensureRoom(room.name, {
                displayName: room.metadata?.displayName || room.name,
                metadata: room.metadata || {},
                participants: room.numParticipants || 0
            });

            await syncRoomParticipants(room.name);
        }
    }

    function trackRoomFromLivekit(room, participants, overrides = {}) {
        return roomRegistry.ensureRoom(room.name, {
            displayName: overrides.displayName || room.metadata?.displayName || room.name,
            metadata: overrides.metadata || room.metadata || {},
            participants
        });
    }

    function buildUniqueUsername(requestedUsername, participants = []) {
        const existingNames = new Set(
            participants.map((participant) =>
                String(participant.identity || participant.name || '').trim().toLowerCase()
            )
        );

        const base = String(requestedUsername || '').trim() || 'guest';
        let candidate = base;
        let suffix = 2;

        while (existingNames.has(candidate.toLowerCase())) {
            candidate = `${base}-${suffix}`;
            suffix += 1;
        }

        return candidate;
    }

    return {
        parseRoomPayload,
        syncRoomParticipants,
        syncAllRooms,
        trackRoomFromLivekit,
        buildUniqueUsername
    };
}

