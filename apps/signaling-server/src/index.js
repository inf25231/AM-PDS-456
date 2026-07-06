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

// --- Bootstrap ---
// Validate all required env vars immediately. Throws on missing config.
const config = getServerConfig();
assertConfig(config);

// --- Service instantiation ---
// All services are created once and injected via dependency injection.
// No module-level singletons or globals beyond this block.
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

// --- Middleware ---
app.use(
  cors({
    origin: config.allowedOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

// --- Routes ---
registerRoutes(app, {
  config,
  logger,
  livekit,
  roomRegistry,
  roomService,
  isRoomMissingError
});

// --- Startup ---
const server = app.listen(config.port, async () => {
  logger.info('Server started', {
    port: config.port,
    roomEmptyTtlMs: config.roomEmptyTtlMs,
    roomSweepIntervalMs: config.roomSweepIntervalMs
  });

  // Seed the local room registry from LiveKit on startup.
  // A failure here is non-fatal — the cleanup loop will reconcile state over time.
  try {
    await roomService.syncAllRooms();
  } catch (error) {
    logger.warn('initial_room_sync_failed', { message: error?.message || 'Unknown error' });
  }
  // Start the periodic empty-room cleanup sweep regardless of sync result.
  cleanupLoop.start();
});

// --- Shutdown ---
// Registered at module scope (outside listen callback) to ensure signal handlers
// are always active, even before the server is fully ready.
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
