/** @returns {string} Current time as ISO 8601 string */
function nowIso() {
    return new Date().toISOString();
}

/**
 * Creates an in-memory registry of known LiveKit rooms.
 *
 * This is the single source of truth for room state within the process.
 * It is intentionally not persisted — on restart, syncAllRooms() re-populates it
 * from the LiveKit server.
 *
 * @returns {{ ensureRoom, setParticipants, remove, get, list, size }}
 */
export function createRoomRegistry() {
    const roomByName = new Map();

    /**
     * Creates a brand new room record with default values, and stores it.
     * @param {string} name - Normalized room name (lowercase, no spaces)
     * @param {Partial<RoomRecord>} [patch={}]
     * @returns {RoomRecord}
     */
    function createRoom(name, patch = {}) {
        const created = {
            name,
            displayName: patch.displayName || name,
            metadata: patch.metadata || {},
            participants: patch.participants || 0,
            emptySince: patch.emptySince || null,
            createdAt: patch.createdAt || nowIso(),
            updatedAt: nowIso()
        };

        roomByName.set(name, created);
        return created;
    }

    /**
     * Updates an existing room record by merging in patch fields.
     * The original `createdAt` timestamp is always kept.
     * @param {RoomRecord} existing - the current record
     * @param {Partial<RoomRecord>} patch
     * @returns {RoomRecord}
     */
    function updateRoom(existing, patch) {
        const updated = {
            ...existing,
            ...patch,
            createdAt: existing.createdAt,
            updatedAt: nowIso()
        };
        roomByName.set(updated.name, updated);
        return updated;
    }

    /**
     * Gets a room and updates it, or creates it if it does not exist yet.
     * This is just a small helper that picks createRoom or updateRoom for us.
     * @param {string} name - Normalized room name (lowercase, no spaces)
     * @param {Partial<RoomRecord>} [patch={}]
     * @returns {RoomRecord}
     */
    function ensureRoom(name, patch = {}) {
        const existing = roomByName.get(name);
        if (existing) {
            return updateRoom(existing, patch);
        }
        return createRoom(name, patch);
    }

    /**
     * Updates the participant count for a room.
     * Sets `emptySince` to the current time when participants first drop to 0.
     * Clears `emptySince` when participants rejoin.
     * @param {string} name
     * @param {number} participants
     * @returns {RoomRecord}
     */
    function setParticipants(name, participants) {
        // Make sure the room exists first, then read its current state.
        const room = ensureRoom(name);

        // Work out the "empty since" timestamp step by step:
        let emptySince;
        if (participants === 0) {
            // Room is empty. Keep the first empty moment if we already have one,
            // otherwise remember that it just became empty now.
            emptySince = room.emptySince || nowIso();
        } else {
            // Someone is in the room, so it is not empty.
            emptySince = null;
        }

        return updateRoom(room, {participants, emptySince});
    }

    /**
     * Removes a room from the registry. Idempotent — safe to call even if the room
     * doesn't exist.
     * @param {string} name
     * @returns {boolean} Whether the room was present and removed
     */
    function remove(name) {
        return roomByName.delete(name);
    }

    function get(name) {
        return roomByName.get(name) || null;
    }

    /**
     * Returns all tracked rooms sorted alphabetically by name.
     * @returns {RoomRecord[]}
     */
    function list() {
        return [...roomByName.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    function size() {
        return roomByName.size;
    }

    return {
        ensureRoom,
        setParticipants,
        remove,
        get,
        list,
        size
    };
}


