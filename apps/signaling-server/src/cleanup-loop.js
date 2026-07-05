/**
 * Creates a periodic cleanup loop that scans all tracked rooms and deletes
 * those that have been empty longer than config.roomEmptyTtlMs.
 *
 * The loop runs every config.roomSweepIntervalMs milliseconds.
 * It uses timer.unref() so it will not prevent the Node.js process from
 * exiting naturally if everything else has settled.
 *
 * @param {{ config, logger, livekit, roomRegistry, roomService, isRoomMissingError }} deps
 * @returns {{ start: () => void, stop: () => void, sweepEmptyRooms: () => Promise<void> }}
 */
export function createCleanupLoop({
                                      config,
                                      logger,
                                      livekit,
                                      roomRegistry,
                                      roomService,
                                      isRoomMissingError
                                  }) {
    let timer = null;

    /**
     * Single sweep pass. Iterates all registered rooms and:
     * 1. Syncs their current participant list from LiveKit
     * 2. Skips rooms with active participants
     * 3. Deletes rooms that have been empty longer than roomEmptyTtlMs
     * 4. Handles "room already gone" errors gracefully by deregistering locally
     *
     * Errors during participant sync or deletion are logged but never re-thrown,
     * so one bad room never blocks cleanup of other rooms.
     *
     * @returns {Promise<void>}
     */
    async function sweepEmptyRooms() {
        const rooms = roomRegistry.list();
        const nowMs = Date.now();

        for (const room of rooms) {
            let participants = [];
            try {
                participants = await roomService.syncRoomParticipants(room.name);
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

            // Skip rooms that still have participants
            if (participants.length > 0) {
                continue;
            }

            const record = roomRegistry.get(room.name);
            const emptySinceMs = record?.emptySince ? Date.parse(record.emptySince) : nowMs;
            const emptyForMs = nowMs - emptySinceMs;

            // Room hasn't been empty long enough yet
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

    /**
     * Starts the periodic sweep timer.
     * Safe to call multiple times — but calling start() twice will leak a timer.
     * Call stop() first if restarting.
     */
    function start() {
        timer = setInterval(() => {
            void sweepEmptyRooms();
        }, config.roomSweepIntervalMs);

        timer.unref?.();
    }

    /**
     * Stops the cleanup timer. Safe to call even if never started.
     */
    function stop() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    return {
        start,
        stop,
        sweepEmptyRooms
    };
}

