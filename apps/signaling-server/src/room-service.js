/**
 * Room service: combines LiveKit calls with local registry updates.
 * Route handlers should go through here, not call livekit directly.
 */
export function createRoomService({livekit, roomRegistry}) {
    /** Normalize request body into { name, @displayName, @metadata }. */
    function parseRoomPayload(input = {}) {
        const name = livekit.normalizeRoomName(input.name);
        const displayName = String(input.displayName || name).trim() || name;

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

    /** Refresh a room's participant count from LiveKit and return the list. */
    async function syncRoomParticipants(roomName) {
        const participants = await livekit.listParticipants(roomName);
        roomRegistry.setParticipants(roomName, participants.length);
        return participants;
    }

    /** Pull every room from LiveKit into the registry. */
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

    /** Store a LiveKit room in the registry, with optional @overrides. */
    function trackRoomFromLivekit(room, participants, overrides = {}) {
        return roomRegistry.ensureRoom(room.name, {
            displayName: overrides.displayName || room.metadata?.displayName || room.name,
            metadata: overrides.metadata || room.metadata || {},
            participants
        });
    }

    /** Return @requestedUsername, or append -2, -3, ... if it's already taken. */
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
