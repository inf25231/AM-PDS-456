import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRoomName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 64);
}

export function createLivekitAdmin(config) {
  const roomService = new RoomServiceClient(
    config.livekitUrl,
    config.livekitApiKey,
    config.livekitApiSecret
  );

  async function createRoom({ name, metadata }) {
    const normalizedName = normalizeRoomName(name);
    if (!normalizedName) {
      throw new Error('Invalid room name.');
    }

    const room = await roomService.createRoom({
      name: normalizedName,
      metadata: JSON.stringify(metadata || {}),
      emptyTimeout: Math.ceil(config.roomEmptyTtlMs / 1000)
    });

    return {
      name: room.name,
      metadata: safeJsonParse(room.metadata)
    };
  }

  async function ensureRoom({ name, metadata }) {
    const normalizedName = normalizeRoomName(name);
    if (!normalizedName) {
      throw new Error('Invalid room name.');
    }

    const rooms = await roomService.listRooms([normalizedName]);
    const existing = rooms.find((room) => room.name === normalizedName);
    if (existing) {
      return {
        name: existing.name,
        metadata: safeJsonParse(existing.metadata)
      };
    }

    return createRoom({ name: normalizedName, metadata });
  }

  async function listRooms() {
    const rooms = await roomService.listRooms();
    return rooms.map((room) => ({
      name: room.name,
      metadata: safeJsonParse(room.metadata),
      maxParticipants: room.maxParticipants || null,
      creationTime: room.creationTime || null,
      numParticipants: room.numParticipants ?? null
    }));
  }

  async function getRoom(name) {
    const normalizedName = normalizeRoomName(name);
    const rooms = await roomService.listRooms([normalizedName]);
    const room = rooms.find((item) => item.name === normalizedName);
    if (!room) return null;

    return {
      name: room.name,
      metadata: safeJsonParse(room.metadata),
      maxParticipants: room.maxParticipants || null,
      creationTime: room.creationTime || null,
      numParticipants: room.numParticipants ?? null
    };
  }

  async function updateRoom({ name, metadata }) {
    const normalizedName = normalizeRoomName(name);
    await roomService.updateRoomMetadata(normalizedName, JSON.stringify(metadata || {}));
    return getRoom(normalizedName);
  }

  async function deleteRoom(name) {
    const normalizedName = normalizeRoomName(name);
    await roomService.deleteRoom(normalizedName);
  }

  async function listParticipants(name) {
    const normalizedName = normalizeRoomName(name);
    const participants = await roomService.listParticipants(normalizedName);
    return participants.map((participant) => ({
      identity: participant.identity,
      name: participant.name || participant.identity,
      joinedAt: participant.joinedAt || null,
      isPublisher: Boolean(participant.permission?.canPublish),
      connectionQuality: participant.connectionQuality ?? 'unknown',
      tracks: (participant.tracks || []).map((track) => ({
        sid: track.sid,
        type: track.type,
        muted: Boolean(track.muted)
      }))
    }));
  }

  async function buildJoinToken({ roomName, username }) {
    const identity = String(username || '').trim();
    if (!identity) {
      throw new Error('Username is required.');
    }

    const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity,
      name: identity,
      ttl: '2h'
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return token.toJwt();
  }

  return {
    normalizeRoomName,
    createRoom,
    ensureRoom,
    listRooms,
    getRoom,
    updateRoom,
    deleteRoom,
    listParticipants,
    buildJoinToken
  };
}

