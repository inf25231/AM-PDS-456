function nowIso() {
    return new Date().toISOString();
}

/**
 * Creates an in-memory registry of known rooms. Not persisted to disk; it is
 * rebuilt from LiveKit on restart via syncAllRooms().
 *
 * @returns {{
 *   ensureRoom: (name: string, patch?: object) => object,
 *   setParticipants: (name: string, participants: number) => object,
 *   remove: (name: string) => boolean,
 *   get: (name: string) => object | null,
 *   list: () => object[],
 *   size: () => number
 * }}
 */
export function createRoomRegistry() {
    const roomByName = new Map();

    /**
     * Creates and stores a new room record.
     *
     * @param {string} name - Normalized room name (registry key).
     * @param {object} [patch] - Optional initial fields (displayName, metadata, ...).
     * @returns {object} The created room record.
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
     * Merges a patch onto an existing room record. createdAt is always kept.
     *
     * @param {object} existing - The current room record.
     * @param {object} patch - Fields to merge on top of the existing record.
     * @returns {object} The updated room record.
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
     * Updates the room if it exists, otherwise creates it.
     *
     * @param {string} name - Normalized room name.
     * @param {object} [patch] - Fields to set or merge.
     * @returns {object} The resulting room record.
     */
    function ensureRoom(name, patch = {}) {
        const existing = roomByName.get(name);
        if (existing) {
            return updateRoom(existing, patch);
        }
        return createRoom(name, patch);
    }

    /**
     * Updates a room's participant count and tracks when it became empty.
     *
     * @param {string} name - Normalized room name.
     * @param {number} participants - Current participant count.
     * @returns {object} The updated room record.
     */
    function setParticipants(name, participants) {
        const room = ensureRoom(name);

        // keep the first "empty" moment so cleanup can measure how long it's been idle
        let emptySince;
        if (participants === 0) {
            emptySince = room.emptySince || nowIso();
        } else {
            emptySince = null;
        }

        return updateRoom(room, {participants, emptySince});
    }

    /**
     * Removes a room. Safe to call even if it isn't there.
     *
     * @param {string} name - Normalized room name.
     * @returns {boolean} True if a room was actually removed.
     */
    function remove(name) {
        return roomByName.delete(name);
    }

    /**
     * Looks up a single room by name.
     *
     * @param {string} name - Normalized room name.
     * @returns {object | null} The room record, or null if unknown.
     */
    function get(name) {
        return roomByName.get(name) || null;
    }

    /**
     * Lists all known rooms, sorted by name.
     *
     * @returns {object[]} The room records in alphabetical order.
     */
    function list() {
        return [...roomByName.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Returns how many rooms are currently tracked.
     *
     * @returns {number} The number of known rooms.
     */
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
