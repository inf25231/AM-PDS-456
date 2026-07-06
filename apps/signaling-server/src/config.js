import process from 'node:process';

/** Default TTL (ms) before an empty room is auto-deleted. */
const ROOM_EMPTY_TTL_MS = 60_000;

/** How often (ms) the cleanup sweep runs. */
const ROOM_SWEEP_INTERVAL_MS = 15_000;

/**
 * Parses the CORS_ORIGIN env var into a value accepted by the `cors` package.
 * - Returns '*' if unset or explicitly set to '*'
 * - Returns a string[] of trimmed origins for multi-origin allowlists
 * @param {string | undefined} rawValue
 * @returns {string | string[]}
 */
function parseAllowedOrigin(rawValue) {
  const normalized = String(rawValue || '*').trim();
  if (!normalized || normalized === '*') {
    return '*';
  }

  return normalized
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Reads and returns the full server configuration from environment variables.
 * Does NOT validate — call assertConfig() separately.
 * @returns {{ port: number, livekitUrl: string, livekitApiKey: string, livekitApiSecret: string, roomEmptyTtlMs: number, roomSweepIntervalMs: number, allowedOrigin: string | string[] }}
 */
export function getServerConfig() {
  return {
    port: Number(process.env.PORT),
    livekitUrl: process.env.LIVEKIT_URL || '',
    livekitApiKey: process.env.LIVEKIT_API_KEY || '',
    livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
    roomEmptyTtlMs: ROOM_EMPTY_TTL_MS,
    roomSweepIntervalMs: ROOM_SWEEP_INTERVAL_MS,
    allowedOrigin: parseAllowedOrigin(process.env.CORS_ORIGIN)
  };
}

/**
 * Throws if any required config values are missing or invalid.
 * Call this once at startup before creating any services.
 * @param {ReturnType<typeof getServerConfig>} config
 * @throws {Error} Lists all missing env var names in the message
 */
export function assertConfig(config) {
  const missing = [];
  if (!Number.isFinite(config.port) || config.port <= 0) missing.push('PORT');
  if (!config.livekitUrl) missing.push('LIVEKIT_URL');
  if (!config.livekitApiKey) missing.push('LIVEKIT_API_KEY');
  if (!config.livekitApiSecret) missing.push('LIVEKIT_API_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}
