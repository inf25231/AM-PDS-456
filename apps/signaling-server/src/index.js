import cors from 'cors';
import express from 'express';
import 'dotenv/config';
import { assertConfig, getServerConfig } from './config.js';
import { createLivekitAdmin } from './livekit-admin.js';
import { createActionLogger } from './logger.js';
import { createServerMetrics } from './metrics.js';
import { createRoomRegistry } from './room-registry.js';

const config = getServerConfig();
assertConfig(config);

const app = express();
const logger = createActionLogger('signaling-server');
const metrics = createServerMetrics();
const roomRegistry = createRoomRegistry();
const livekit = createLivekitAdmin(config);

app.use(cors({ origin: config.allowedOrigin }));
app.use(express.json());

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

function isRoomMissingError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('not found') ||
    message.includes('room does not exist') ||
    message.includes('unknown room')
  );
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/status', (_req, res) => {
  res.json({
    ok: true,
    roomsTracked: roomRegistry.size(),
    metrics: metrics.getSnapshot()
  });
});

app.get('/status/connection-quality', async (_req, res, next) => {
  try {
    const rooms = roomRegistry.list();
    const qualityByRoom = [];

    for (const room of rooms) {
      const participants = await livekit.listParticipants(room.name);
      qualityByRoom.push({
        room: room.name,
        participants: participants.map((participant) => ({
          identity: participant.identity,
          connectionQuality: participant.connectionQuality
        }))
      });
    }

    res.json({
      ok: true,
      sampledAt: new Date().toISOString(),
      rooms: qualityByRoom
    });
  } catch (error) {
    next(error);
  }
});

app.get('/rooms', async (_req, res, next) => {
  try {
    await syncAllRooms();
    res.json({
      ok: true,
      rooms: roomRegistry.list()
    });
  } catch (error) {
    next(error);
  }
});

app.post('/rooms', async (req, res, next) => {
  try {
    const payload = parseRoomPayload(req.body || {});
    if (!payload.name) {
      return res.status(400).json({ ok: false, error: 'name is required' });
    }

    const room = await livekit.ensureRoom(payload);
    const participants = await syncRoomParticipants(room.name);
    const record = roomRegistry.ensureRoom(room.name, {
      displayName: payload.displayName,
      metadata: payload.metadata,
      participants: participants.length
    });

    logger.action('room.created_or_reused', {
      room: room.name,
      participants: participants.length
    });

    res.status(201).json({
      ok: true,
      room: record
    });
  } catch (error) {
    next(error);
  }
});

app.get('/rooms/:roomName', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    const room = await livekit.getRoom(roomName);
    if (!room) {
      return res.status(404).json({ ok: false, error: 'Room not found' });
    }

    const participants = await syncRoomParticipants(roomName);
    const record = roomRegistry.ensureRoom(roomName, {
      displayName: room.metadata?.displayName || room.name,
      metadata: room.metadata || {},
      participants: participants.length
    });

    res.json({ ok: true, room: record });
  } catch (error) {
    next(error);
  }
});

app.patch('/rooms/:roomName', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    const current = roomRegistry.get(roomName) || roomRegistry.ensureRoom(roomName);
    const nextDisplayName = String(req.body?.displayName || current.displayName || roomName).trim() || roomName;
    const nextMetadata = {
      ...(current.metadata || {}),
      ...(typeof req.body?.metadata === 'object' && req.body?.metadata ? req.body.metadata : {}),
      displayName: nextDisplayName
    };

    await livekit.updateRoom({
      name: roomName,
      metadata: nextMetadata
    });

    const participants = await syncRoomParticipants(roomName);
    const record = roomRegistry.ensureRoom(roomName, {
      displayName: nextDisplayName,
      metadata: nextMetadata,
      participants: participants.length
    });

    logger.action('room.updated', {
      room: roomName,
      participants: participants.length
    });

    res.json({ ok: true, room: record });
  } catch (error) {
    next(error);
  }
});

app.delete('/rooms/:roomName', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    await livekit.deleteRoom(roomName);
    roomRegistry.remove(roomName);

    logger.action('room.deleted', { room: roomName });
    res.json({ ok: true, room: roomName });
  } catch (error) {
    next(error);
  }
});

app.get('/rooms/:roomName/participants', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    const participants = await syncRoomParticipants(roomName);

    logger.action('room.participants_checked', {
      room: roomName,
      participants: participants.length
    });

    res.json({
      ok: true,
      room: roomName,
      participants
    });
  } catch (error) {
    next(error);
  }
});

app.post('/rooms/:roomName/join', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    const username = String(req.body?.username || '').trim();
    if (!roomName || !username) {
      return res.status(400).json({ ok: false, error: 'roomName and username are required' });
    }

    const room = await livekit.getRoom(roomName);
    if (!room) {
      return res.status(404).json({ ok: false, error: 'Room not found' });
    }

    const participants = await syncRoomParticipants(roomName);
    roomRegistry.ensureRoom(roomName, {
      displayName: room.metadata?.displayName || room.name,
      metadata: room.metadata || {},
      participants: participants.length
    });

    const token = await livekit.buildJoinToken({ roomName, username });
    logger.action('room.join_token_issued', { room: roomName, username });

    res.json({
      ok: true,
      room: roomName,
      username,
      token,
      livekitUrl: config.livekitUrl
    });
  } catch (error) {
    next(error);
  }
});

// Backward-compatible token endpoint used by older clients.
app.get('/token', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.query.room);
    const username = String(req.query.username || '').trim();
    if (!roomName || !username) {
      return res.status(400).json({ ok: false, error: 'room and username are required' });
    }

    const room = await livekit.getRoom(roomName);
    if (!room) {
      return res.status(404).json({ ok: false, error: 'Room not found' });
    }

    const participants = await syncRoomParticipants(roomName);
    roomRegistry.ensureRoom(roomName, {
      displayName: room.metadata?.displayName || room.name,
      metadata: room.metadata || {},
      participants: participants.length
    });

    const token = await livekit.buildJoinToken({ roomName, username });
    res.json({ ok: true, token, livekitUrl: config.livekitUrl, room: roomName, username });
  } catch (error) {
    next(error);
  }
});

app.post('/rooms/:roomName/cleanup', async (req, res, next) => {
  try {
    const roomName = livekit.normalizeRoomName(req.params.roomName);
    const participants = await syncRoomParticipants(roomName);
    if (participants.length > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Room is not empty',
        participants: participants.length
      });
    }

    try {
      await livekit.deleteRoom(roomName);
    } catch (error) {
      if (!isRoomMissingError(error)) {
        throw error;
      }
    }
    roomRegistry.remove(roomName);
    logger.action('room.deleted_manual_cleanup', { room: roomName });
    res.json({ ok: true, room: roomName });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  logger.error('request_failed', {
    message: error?.message || 'Unknown error'
  });

  res.status(500).json({
    ok: false,
    error: error?.message || 'Internal server error'
  });
});

let cleanupTimer = null;

async function sweepEmptyRooms() {
  const rooms = roomRegistry.list();
  const nowMs = Date.now();

  for (const room of rooms) {
    let participants = [];
    try {
      participants = await syncRoomParticipants(room.name);
    } catch (error) {
      if (isRoomMissingError(error)) {
        roomRegistry.remove(room.name);
        logger.action('room.deleted_auto_missing', {
          room: room.name,
          reason: 'participant_sync_missing'
        });
        continue;
      }
      logger.warn('room.participant_sync_failed', {
        room: room.name,
        message: error?.message || 'Unknown error'
      });
      continue;
    }

    if (participants.length > 0) {
      continue;
    }

    const record = roomRegistry.get(room.name);
    const emptySinceMs = record?.emptySince ? Date.parse(record.emptySince) : nowMs;
    const emptyForMs = nowMs - emptySinceMs;

    if (emptyForMs < config.roomEmptyTtlMs) {
      continue;
    }

    try {
      await livekit.deleteRoom(room.name);
      roomRegistry.remove(room.name);
      logger.action('room.deleted_auto_empty_ttl', {
        room: room.name,
        emptyForMs,
        ttlMs: config.roomEmptyTtlMs
      });
    } catch (error) {
      if (isRoomMissingError(error)) {
        roomRegistry.remove(room.name);
        logger.action('room.deleted_auto_missing', {
          room: room.name,
          emptyForMs,
          ttlMs: config.roomEmptyTtlMs
        });
        continue;
      }
      logger.warn('room.auto_cleanup_failed', {
        room: room.name,
        message: error?.message || 'Unknown error'
      });
    }
  }
}

function startCleanupLoop() {
  cleanupTimer = setInterval(() => {
    void sweepEmptyRooms();
  }, config.roomSweepIntervalMs);

  cleanupTimer.unref?.();
}

function stopCleanupLoop() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

const server = app.listen(config.port, async () => {
  logger.info('Server started', {
    port: config.port,
    roomEmptyTtlMs: config.roomEmptyTtlMs,
    roomSweepIntervalMs: config.roomSweepIntervalMs
  });

  try {
    await syncAllRooms();
  } catch (error) {
    logger.warn('initial_room_sync_failed', { message: error?.message || 'Unknown error' });
  }

  startCleanupLoop();
});

function shutdown(signalName) {
  logger.info('Shutdown requested', { signal: signalName });
  stopCleanupLoop();
  metrics.stop();

  server.close(() => {
    logger.info('Server stopped', { signal: signalName });
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// import { WebSocketServer } from 'ws';
//
// const PORT = process.env.SIGNALING_PORT || 3000;
// const wss = new WebSocketServer({ port: PORT }, () =>
//     console.log(`Signaling server running on ws://localhost:${PORT}`),
// );
//
// const rooms = new Map();
//
// function getRoom(name = 'default') {
//   if (!rooms.has(name)) rooms.set(name, { broadcaster: null, viewers: new Map() });
//   return rooms.get(name);
// }
//
// function send(ws, obj) {
//   try {
//     ws.send(JSON.stringify(obj));
//   } catch (e) {
//     // ignore
//   }
// }
//
// wss.on('connection', (ws) => {
//   ws.id = Math.random().toString(36).substr(2, 9);
//   ws.room = 'default';
//
//   ws.on('message', (msg) => {
//     let data;
//     try {
//       data = JSON.parse(msg.toString());
//     } catch (e) {
//       return;
//     }
//
//     const room = getRoom(data.room || ws.room);
//
//     // Join as broadcaster or viewer
//     if (data.type === 'join') {
//       if (data.role === 'broadcaster') {
//         room.broadcaster = ws;
//         ws.role = 'broadcaster';
//         send(ws, { type: 'joined', role: 'broadcaster' });
//         console.log('broadcaster joined', ws.id);
//         return;
//       }
//
//       if (data.role === 'viewer') {
//         const viewerId = data.viewerId || ws.id;
//         ws.role = 'viewer';
//         ws.viewerId = viewerId;
//         room.viewers.set(viewerId, ws);
//         send(ws, { type: 'joined', role: 'viewer', viewerId });
//         console.log('viewer joined', viewerId);
//         // notify broadcaster someone wants to watch
//         if (room.broadcaster) {
//           send(room.broadcaster, { type: 'watch', viewerId, room: data.room });
//         }
//         return;
//       }
//     }
//
//     // Forward offers/answers/ice between broadcaster and viewers
//     if (data.type === 'offer' && data.viewerId) {
//       const v = room.viewers.get(data.viewerId);
//       if (v) send(v, { type: 'offer', sdp: data.sdp, viewerId: data.viewerId });
//       return;
//     }
//
//     if (data.type === 'answer' && data.viewerId) {
//       if (room.broadcaster) send(room.broadcaster, { type: 'answer', sdp: data.sdp, viewerId: data.viewerId });
//       return;
//     }
//
//     if (data.type === 'ice' && data.viewerId) {
//       // forward to the other side
//       if (data.from === 'viewer') {
//         if (room.broadcaster) send(room.broadcaster, { type: 'ice', candidate: data.candidate, viewerId: data.viewerId, from: 'viewer' });
//       } else {
//         const v = room.viewers.get(data.viewerId);
//         if (v) send(v, { type: 'ice', candidate: data.candidate, viewerId: data.viewerId, from: 'broadcaster' });
//       }
//       return;
//     }
//   });
//
//   ws.on('close', () => {
//     // cleanup
//     const room = getRoom(ws.room);
//     if (!room) return;
//     if (ws.role === 'broadcaster') {
//       room.broadcaster = null;
//       // notify viewers
//       for (const [id, v] of room.viewers) {
//         try {
//           v.send(JSON.stringify({ type: 'broadcaster_left' }));
//         } catch (e) {}
//       }
//       console.log('broadcaster left');
//     }
//
//     if (ws.role === 'viewer') {
//       room.viewers.delete(ws.viewerId);
//       console.log('viewer left', ws.viewerId);
//     }
//   });
// });
//
// process.on('SIGINT', () => process.exit());
