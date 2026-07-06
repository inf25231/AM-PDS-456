/**
 * Creates the room service: the "glue" layer that combines LiveKit calls with
 * local registry updates. Route handlers should go through here, not call
 * livekit directly.
 *
 * @param {object} deps
 * @param {import('./livekit-admin.js').createLivekitAdmin} deps.livekit - LiveKit admin wrapper.
 * @param {import('./room-registry.js').createRoomRegistry} deps.roomRegistry - In-memory room registry.
 * @returns {{
 *   parseRoomPayload: (input?: object) => { name: string, displayName: string, metadata: object },
 *   syncRoomParticipants: (roomName: string) => Promise<object[]>,
 *   syncAllRooms: () => Promise<void>,
 *   trackRoomFromLivekit: (room: object, participants: number, overrides?: object) => object,
 *   buildUniqueUsername: (requestedUsername: string, participants?: object[]) => string
 * }}
 */
export function createRoomService({ livekit, roomRegistry }) {
  /**
   * Normalizes a request body into a room payload.
   *
   * @param {object} [input] - Raw request body ({ name, displayName, metadata }).
   * @returns {{ name: string, displayName: string, metadata: object }} Normalized payload.
   */
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

  /**
   * Refreshes a room's participant count from LiveKit and returns the list.
   *
   * @param {string} roomName - Normalized room name.
   * @returns {Promise<object[]>} The current participants of the room.
   */
  async function syncRoomParticipants(roomName) {
    const participants = await livekit.listParticipants(roomName);
    roomRegistry.setParticipants(roomName, participants.length);
    return participants;
  }

  /**
   * Pulls every room from LiveKit into the local registry.
   *
   * @returns {Promise<void>}
   */
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

  /**
   * Stores a LiveKit room in the registry, with optional overrides.
   *
   * @param {object} room - Room object as returned by LiveKit.
   * @param {number} participants - Current participant count.
   * @param {object} [overrides] - Optional { displayName, metadata } overrides.
   * @returns {object} The stored registry record.
   */
  function trackRoomFromLivekit(room, participants, overrides = {}) {
    return roomRegistry.ensureRoom(room.name, {
      displayName: overrides.displayName || room.metadata?.displayName || room.name,
      metadata: overrides.metadata || room.metadata || {},
      participants
    });
  }

  /**
   * Returns the requested username, or appends -2, -3, ... if it's already
   * taken by a current participant (case-insensitive).
   *
   * @param {string} requestedUsername - The username the client asked for.
   * @param {object[]} [participants] - Current participants to check against.
   * @returns {string} A username guaranteed to be unique in the room.
   */
  function buildUniqueUsername(requestedUsername, participants = []) {
    const existingNames = new Set(
      participants.map((participant) =>
        String(participant.identity || participant.name || '')
          .trim()
          .toLowerCase()
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
