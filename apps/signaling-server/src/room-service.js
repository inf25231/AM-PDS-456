export function createRoomService({ livekit, roomRegistry }) {
  function parseRoomPayload(input = {}) {
    const name = livekit.normalizeRoomName(input.name);
    const displayName = String(input.displayName || name).trim() || name;
    const metadata = {
      ...(typeof input.metadata === 'object' && input.metadata ? input.metadata : {}),
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

