/**
 * Periodic loop that deletes rooms empty longer than config.roomEmptyTtlMs.
 * Runs every config.roomSweepIntervalMs; timer is unref()'d so it never
 * keeps the process alive on its own.
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
     * One sweep pass: sync participants, delete rooms empty past the TTL, and
     * deregister rooms already gone from LiveKit. Errors are logged but never
     * re-thrown, so one bad room can't block cleanup of the others.
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

    /** Starts the sweep timer. Calling start() twice leaks a timer — stop() first to restart. */
    function start() {
        timer = setInterval(() => {
            void sweepEmptyRooms();
        }, config.roomSweepIntervalMs);

        timer.unref?.();
    }

    /** Stops the timer. Safe to call even if never started. */
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

