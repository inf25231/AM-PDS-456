function nowIso() {
  return new Date().toISOString();
}

export function createRoomRegistry() {
  const roomByName = new Map();

  function ensureRoom(name, patch = {}) {
    const existing = roomByName.get(name);
    if (existing) {
      const updated = {
        ...existing,
        ...patch,
        updatedAt: nowIso()
      };
      roomByName.set(name, updated);
      return updated;
    }

    const created = {
      name,
      displayName: patch.displayName || name,
      metadata: patch.metadata || {},
      participants: patch.participants || 0,
      emptySince: patch.emptySince || null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    roomByName.set(name, created);
    return created;
  }

  function setParticipants(name, participants) {
    const room = ensureRoom(name);
    const emptySince = participants === 0 ? room.emptySince || nowIso() : null;

    const updated = {
      ...room,
      participants,
      emptySince,
      updatedAt: nowIso()
    };
    roomByName.set(name, updated);
    return updated;
  }

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

