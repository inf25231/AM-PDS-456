import cors from 'cors';
import express from 'express';
import 'dotenv/config';
import { assertConfig, getServerConfig } from './config.js';
import { createCleanupLoop } from './cleanup-loop.js';
import { isRoomMissingError } from './errors.js';
import { createLivekitAdmin } from './livekit-admin.js';
import { createActionLogger } from './logger.js';
import { createRoomRegistry } from './room-registry.js';
import { createRoomService } from './room-service.js';
import { registerRoutes } from './routes.js';

const config = getServerConfig();
assertConfig(config);

const app = express();
const logger = createActionLogger('signaling-server');
const roomRegistry = createRoomRegistry();
const livekit = createLivekitAdmin(config);
const roomService = createRoomService({ livekit, roomRegistry });
const cleanupLoop = createCleanupLoop({
  config,
  logger,
  livekit,
  roomRegistry,
  roomService,
  isRoomMissingError
});

app.use(cors({
  origin: config.allowedOrigin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
registerRoutes(app, {
  config,
  logger,
  livekit,
  roomRegistry,
  roomService,
  isRoomMissingError
});

const server = app.listen(config.port, async () => {
  logger.info('Server started', {
    port: config.port,
    roomEmptyTtlMs: config.roomEmptyTtlMs,
    roomSweepIntervalMs: config.roomSweepIntervalMs
  });

  try {
    await roomService.syncAllRooms();
  } catch (error) {
    logger.warn('initial_room_sync_failed', { message: error?.message || 'Unknown error' });
  }

  cleanupLoop.start();
});

function shutdown(signalName) {
  logger.info('Shutdown requested', { signal: signalName });
  cleanupLoop.stop();

  server.close(() => {
    logger.info('Server stopped', { signal: signalName });
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

