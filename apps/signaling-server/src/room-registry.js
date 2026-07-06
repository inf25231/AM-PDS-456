function nowIso() {
    return new Date().toISOString();
}

/** In-memory registry of known rooms. Rebuilt from LiveKit on restart via syncAllRooms(). */
export function createRoomRegistry() {
    const roomByName = new Map();

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

    /** Merge @patch onto an existing room. createdAt is always kept. */
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

    /** Update the room if it exists, otherwise create it. */
    function ensureRoom(name, patch = {}) {
        const existing = roomByName.get(name);
        if (existing) {
            return updateRoom(existing, patch);
        }
        return createRoom(name, patch);
    }

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

    /** Remove a room. Safe to call even if it isn't there. */
    function remove(name) {
        return roomByName.delete(name);
    }

    function get(name) {
        return roomByName.get(name) || null;
    }

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
