import process from 'node:process';

const ROOM_EMPTY_TTL_MS = 60_000;
const ROOM_SWEEP_INTERVAL_MS = 15_000;

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