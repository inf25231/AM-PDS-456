export function createCleanupLoop({
  config,
  logger,
  livekit,
  roomRegistry,
  roomService,
  isRoomMissingError
}) {
  let timer = null;

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

  function start() {
    timer = setInterval(() => {
      void sweepEmptyRooms();
    }, config.roomSweepIntervalMs);

    timer.unref?.();
  }

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

