/**
 * Registers all HTTP routes on the Express app.
 * Handlers reply { ok: true, ... } on success or { ok: false, error } on failure;
 * unexpected errors are passed to next(error).
 */
export function registerRoutes(
  app,
  { config, logger, livekit, roomRegistry, roomService, isRoomMissingError }
) {
  /** Health check. */
  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  /** Rooms we track locally (no LiveKit call). */
  app.get('/status', (_req, res) => {
    res.json({
      ok: true,
      roomsTracked: roomRegistry.size(),
      rooms: roomRegistry.list()
    });
  });

  /** Live connection quality per room. Slow: one LiveKit call per room. */
  app.get('/status/connection-quality', async (_req, res, next) => {
    try {
      const rooms = roomRegistry.list();
      const qualityByRoom = [];

      for (const room of rooms) {
        const participants = await livekit.listParticipants(room.name);
        qualityByRoom.push({
          room: room.name,
          createdAt: room.createdAt,
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

  /** Full room list, synced from LiveKit (heavier than /status). */
  app.get('/rooms', async (_req, res, next) => {
    try {
      await roomService.syncAllRooms();
      res.json({
        ok: true,
        rooms: roomRegistry.list()
      });
    } catch (error) {
      next(error);
    }
  });

  /** Create a room, or reuse an existing one with the same name. */
  app.post('/rooms', async (req, res, next) => {
    try {
      const payload = roomService.parseRoomPayload(req.body || {});
      if (!payload.name) {
        return res.status(400).json({ ok: false, error: 'name is required' });
      }

      const room = await livekit.ensureRoom(payload);
      const participants = await roomService.syncRoomParticipants(room.name);
      const record = roomService.trackRoomFromLivekit(room, participants.length, {
        displayName: payload.displayName,
        metadata: payload.metadata
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

  /** Fetch one room from LiveKit and sync it. 404 if it doesn't exist there. */
  app.get('/rooms/:roomName', async (req, res, next) => {
    try {
      const roomName = livekit.normalizeRoomName(req.params.roomName);
      const room = await livekit.getRoom(roomName);
      if (!room) {
        return res.status(404).json({ ok: false, error: 'Room not found' });
      }

      const participants = await roomService.syncRoomParticipants(roomName);
      const record = roomService.trackRoomFromLivekit(room, participants.length);
      res.json({ ok: true, room: record });
    } catch (error) {
      next(error);
    }
  });

  /** Update a room's displayName and/or metadata. */
  app.patch('/rooms/:roomName', async (req, res, next) => {
    try {
      const roomName = livekit.normalizeRoomName(req.params.roomName);

      let current = roomRegistry.get(roomName);
      if (!current) {
        current = roomRegistry.ensureRoom(roomName);
      }

      // pick the new display name: body wins, then current, then room name
      let nextDisplayName = roomName;
      if (req.body?.displayName) {
        nextDisplayName = req.body.displayName;
      } else if (current.displayName) {
        nextDisplayName = current.displayName;
      }
      nextDisplayName = nextDisplayName.trim() || roomName;

      let patchMetadata = {};
      if (typeof req.body?.metadata === 'object' && req.body?.metadata) {
        patchMetadata = req.body.metadata;
      }

      const nextMetadata = {
        ...(current.metadata || {}),
        ...patchMetadata,
        displayName: nextDisplayName
      };

      await livekit.updateRoom({
        name: roomName,
        metadata: nextMetadata
      });

      const participants = await roomService.syncRoomParticipants(roomName);
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

  /** Delete a room now. LiveKit disconnects everyone still inside. */
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

  /** Current participants of a room, synced from LiveKit. */
  app.get('/rooms/:roomName/participants', async (req, res, next) => {
    try {
      const roomName = livekit.normalizeRoomName(req.params.roomName);
      const participants = await roomService.syncRoomParticipants(roomName);

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

  /**
   * Shared join logic for POST /rooms/:roomName/join and the legacy GET /token.
   * Validates input, ensures the room exists, assigns a unique username
   * (numeric suffix if taken) and mints a signed token.
   */
  async function issueJoinToken(rawRoomName, rawUsername) {
    const roomName = livekit.normalizeRoomName(rawRoomName);
    const username = String(rawUsername || '').trim();
    if (!roomName || !username) {
      return { ok: false, status: 400, error: 'room and username are required' };
    }

    const room = await livekit.getRoom(roomName);
    if (!room) {
      return { ok: false, status: 404, error: 'Room not found' };
    }

    const participants = await roomService.syncRoomParticipants(roomName);
    roomService.trackRoomFromLivekit(room, participants.length);

    const assignedUsername = roomService.buildUniqueUsername(username, participants);
    const token = await livekit.buildJoinToken({ roomName, username: assignedUsername });

    return {
      ok: true,
      room: roomName,
      username: assignedUsername,
      token,
      livekitUrl: config.livekitUrl
    };
  }

  /** Join a room: returns a signed token. 404 if the room doesn't exist. */
  app.post('/rooms/:roomName/join', async (req, res, next) => {
    try {
      const result = await issueJoinToken(req.params.roomName, req.body?.username);
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error });
      }

      logger.action('room.join_token_issued', {
        room: result.room,
        username: result.username,
        requestedUsername: String(req.body?.username || '').trim()
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Old token endpoint, kept for older clients. Same as POST /rooms/:roomName/join.
   * @deprecated Use POST /rooms/:roomName/join instead.
   */
  app.get('/token', async (req, res, next) => {
    try {
      const result = await issueJoinToken(req.query.room, req.query.username);
      if (!result.ok) {
        return res.status(result.status).json({ ok: false, error: result.error });
      }

      logger.action('room.join_token_issued', {
        room: result.room,
        username: result.username,
        requestedUsername: String(req.query.username || '').trim()
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * Manually clean up an empty room. 409 if it still has participants.
   * Safe to call even if the room is already gone from LiveKit.
   */
  app.post('/rooms/:roomName/cleanup', async (req, res, next) => {
    try {
      const roomName = livekit.normalizeRoomName(req.params.roomName);
      const participants = await roomService.syncRoomParticipants(roomName);
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

  /** Catch-all error handler: anything passed to next(error) becomes a 500. */
  app.use((error, _req, res, _next) => {
    logger.error('request_failed', {
      message: error?.message || 'Unknown error'
    });

    res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error'
    });
  });
}
