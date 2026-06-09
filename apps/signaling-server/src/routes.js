export function registerRoutes(app, {
  config,
  logger,
  livekit,
  roomRegistry,
  roomService,
  isRoomMissingError
}) {
  app.get('/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/status', (_req, res) => {
    res.json({
      ok: true,
      roomsTracked: roomRegistry.size(),
      rooms: roomRegistry.list()
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

      const participants = await roomService.syncRoomParticipants(roomName);
      roomService.trackRoomFromLivekit(room, participants.length);

      const assignedUsername = roomService.buildUniqueUsername(username, participants);
      const token = await livekit.buildJoinToken({ roomName, username: assignedUsername });

      logger.action('room.join_token_issued', {
        room: roomName,
        username: assignedUsername,
        requestedUsername: username
      });

      res.json({
        ok: true,
        room: roomName,
        username: assignedUsername,
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

      const participants = await roomService.syncRoomParticipants(roomName);
      roomService.trackRoomFromLivekit(room, participants.length);

      const assignedUsername = roomService.buildUniqueUsername(username, participants);
      const token = await livekit.buildJoinToken({ roomName, username: assignedUsername });

      res.json({
        ok: true,
        token,
        livekitUrl: config.livekitUrl,
        room: roomName,
        username: assignedUsername
      });
    } catch (error) {
      next(error);
    }
  });

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

