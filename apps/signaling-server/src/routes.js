/**
 * Registers all HTTP routes onto the Express app.
 *
 * All route handlers follow this contract:
 * - Success: { ok: true, ...data }
 * - Client error: { ok: false, error: string } with appropriate 4xx status
 * - Server error: passed to Express error middleware via next(error)
 *
 * Dependencies are injected to keep this module testable in isolation.
 *
 * @param {import('express').Application} app
 * @param {{ config, logger, livekit, roomRegistry, roomService, isRoomMissingError }} deps
 */
export function registerRoutes(app, {
    config,
    logger,
    livekit,
    roomRegistry,
    roomService,
    isRoomMissingError
}) {
    /** GET /health — Liveness probe. Returns 200 with a timestamp. */
    app.get('/health', (_req, res) => {
        res.json({ok: true, timestamp: new Date().toISOString()});
    });

    /**
     * GET /status — Returns the count and list of all locally tracked rooms.
     * Does NOT call LiveKit — returns in-memory registry state only.
     */
    app.get('/status', (_req, res) => {
        res.json({
            ok: true,
            roomsTracked: roomRegistry.size(),
            rooms: roomRegistry.list()
        });
    });

    /**
     * GET /status/connection-quality
     * Polls LiveKit for live participant connection quality data for all tracked rooms.
     * This is a slow endpoint — it makes one API call per tracked room.
     */
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

    /**
     * GET /rooms
     * Syncs all rooms from LiveKit into the registry, then returns the full list.
     * More expensive than GET /status — triggers a full LiveKit API call.
     */
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

    /**
     * POST /rooms
     * Creates a new room or returns an existing one with the same name (idempotent).
     * Body: { name: string, displayName?: string, metadata?: object }
     * Response 201: { ok: true, room: RoomRecord }
     */
    app.post('/rooms', async (req, res, next) => {
        try {
            const payload = roomService.parseRoomPayload(req.body || {});
            if (!payload.name) {
                return res.status(400).json({ok: false, error: 'name is required'});
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

    /**
     * GET /rooms/:roomName
     * Fetches a single room from LiveKit and syncs it into the registry.
     * Returns 404 if the room does not exist in LiveKit.
     */
    app.get('/rooms/:roomName', async (req, res, next) => {
        try {
            const roomName = livekit.normalizeRoomName(req.params.roomName);
            const room = await livekit.getRoom(roomName);
            if (!room) {
                return res.status(404).json({ok: false, error: 'Room not found'});
            }

            const participants = await roomService.syncRoomParticipants(roomName);
            const record = roomService.trackRoomFromLivekit(room, participants.length);
            res.json({ok: true, room: record});
        } catch (error) {
            next(error);
        }
    });

    /**
     * PATCH /rooms/:roomName
     * Updates a room's displayName and/or metadata.
     * Merges patch fields onto the existing record (does not replace).
     *
     * Note: displayName is stored both as a top-level field on the registry record
     * AND inside the metadata object, because LiveKit only persists the metadata JSON blob.
     *
     * Body: { displayName?: string, metadata?: object }
     */
    app.patch('/rooms/:roomName', async (req, res, next) => {
        try {
            const roomName = livekit.normalizeRoomName(req.params.roomName);

            // Get the current room record, or create an empty one if we don't know it yet.
            let current = roomRegistry.get(roomName);
            if (!current) {
                current = roomRegistry.ensureRoom(roomName);
            }

            // Decide the new display name, step by step:
            // 1. use the one from the request body if provided,
            // 2. otherwise keep the current one,
            // 3. otherwise fall back to the room name.
            let nextDisplayName = roomName;
            if (req.body?.displayName) {
                nextDisplayName = req.body.displayName;
            } else if (current.displayName) {
                nextDisplayName = current.displayName;
            }
            nextDisplayName = nextDisplayName.trim() || roomName;

            // Only merge in the request metadata if it is actually an object.
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

            res.json({ok: true, room: record});
        } catch (error) {
            next(error);
        }
    });


    /**
     * DELETE /rooms/:roomName
     * Immediately deletes a room from LiveKit and removes it from the registry.
     * All active participants are disconnected by LiveKit.
     */
    app.delete('/rooms/:roomName', async (req, res, next) => {
        try {
            const roomName = livekit.normalizeRoomName(req.params.roomName);
            await livekit.deleteRoom(roomName);
            roomRegistry.remove(roomName);

            logger.action('room.deleted', {room: roomName});
            res.json({ok: true, room: roomName});
        } catch (error) {
            next(error);
        }
    });

    /**
     * GET /rooms/:roomName/participants
     * Returns the current participant list for a room, synced from LiveKit.
     */
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
     * Shared logic for issuing a LiveKit join token.
     * Used by both POST /rooms/:roomName/join and the legacy GET /token.
     *
     * Validates inputs, ensures the room exists, syncs participants, assigns a
     * unique username (numeric suffix on collision), and mints a signed JWT.
     *
     * @param {string} rawRoomName - room name from the request (un-normalized)
     * @param {string} rawUsername - requested username from the request
     * @returns {Promise<{ ok: true, room, username, token, livekitUrl }
     *   | { ok: false, status: number, error: string }>}
     */
    async function issueJoinToken(rawRoomName, rawUsername) {
        const roomName = livekit.normalizeRoomName(rawRoomName);
        const username = String(rawUsername || '').trim();
        if (!roomName || !username) {
            return {ok: false, status: 400, error: 'room and username are required'};
        }

        const room = await livekit.getRoom(roomName);
        if (!room) {
            return {ok: false, status: 404, error: 'Room not found'};
        }

        const participants = await roomService.syncRoomParticipants(roomName);
        roomService.trackRoomFromLivekit(room, participants.length);

        const assignedUsername = roomService.buildUniqueUsername(username, participants);
        const token = await livekit.buildJoinToken({roomName, username: assignedUsername});

        return {
            ok: true,
            room: roomName,
            username: assignedUsername,
            token,
            livekitUrl: config.livekitUrl
        };
    }

    /**
     * POST /rooms/:roomName/join
     * Issues a signed LiveKit JWT for a user to join the specified room.
     * If the requested username is already taken, a numeric suffix is appended.
     * Returns 404 if the room does not exist.
     *
     * Body: { username: string }
     * Response: { ok: true, room, username, token, livekitUrl }
     */
    app.post('/rooms/:roomName/join', async (req, res, next) => {
        try {
            const result = await issueJoinToken(req.params.roomName, req.body?.username);
            if (!result.ok) {
                return res.status(result.status).json({ok: false, error: result.error});
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
     * GET /token?room=&username=
     * Legacy endpoint for backward compatibility with older clients.
     * Functionally identical to POST /rooms/:roomName/join.
     *
     * @deprecated Use POST /rooms/:roomName/join instead.
     */
    // Backward-compatible token endpoint used by older clients.
    app.get('/token', async (req, res, next) => {
        try {
            const result = await issueJoinToken(req.query.room, req.query.username);
            if (!result.ok) {
                return res.status(result.status).json({ok: false, error: result.error});
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
     * POST /rooms/:roomName/cleanup
     * Manually triggers cleanup of an empty room. Returns 409 if the room still has participants.
     * Safe to call even if the room is already gone from LiveKit (idempotent).
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
            logger.action('room.deleted_manual_cleanup', {room: roomName});
            res.json({ok: true, room: roomName});
        } catch (error) {
            next(error);
        }
    });

    /**
     * Global Express error handler.
     * Catches any error passed to next(error) from a route handler.
     * Always returns 500 — consider adding AppError.statusCode support
     * if you need to propagate specific 4xx codes from service-layer errors.
     */
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

