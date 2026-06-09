import process from 'node:process';

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerConfig() {
  return {
    port: parseNumber(process.env.PORT, 3000),
    livekitUrl: process.env.LIVEKIT_URL || '',
    livekitApiKey: process.env.LIVEKIT_API_KEY || '',
    livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
    roomEmptyTtlMs: parseNumber(process.env.ROOM_EMPTY_TTL_MS, 60_000),
    roomSweepIntervalMs: parseNumber(process.env.ROOM_SWEEP_INTERVAL_MS, 15_000),
    allowedOrigin: process.env.CORS_ORIGIN || '*'
  };
}

export function assertConfig(config) {
  const missing = [];
  if (!config.livekitUrl) missing.push('LIVEKIT_URL');
  if (!config.livekitApiKey) missing.push('LIVEKIT_API_KEY');
  if (!config.livekitApiSecret) missing.push('LIVEKIT_API_SECRET');

  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

