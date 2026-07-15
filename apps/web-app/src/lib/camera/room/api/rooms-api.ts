export type JoinRoomResponse = {
  ok: boolean;
  room: string;
  username: string;
  token: string;
  livekitUrl: string;
};

/**
 * In dev the Vite proxy rewrites `/api/*` → `http://localhost:8080/*`.
 * In production deploy the same prefix must be proxied by whatever reverse
 * proxy sits in front of the app (nginx, Cloudflare, etc.).
 *
 * Override at build time via VITE_SIGNALING_PREFIX env var.
 */
const API_PREFIX: string = import.meta.env.VITE_SIGNALING_PREFIX ?? '/api';

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${response.status})`);
  }
  return data;
}

export async function createRoom(roomName: string, displayName?: string) {
  const response = await fetch(`${API_PREFIX}/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: roomName, displayName: displayName || roomName })
  });

  return parseJson<{
    ok: boolean;
    room: { name: string; displayName: string; createdAt?: string | null };
  }>(response);
}

export async function joinRoom(roomName: string, username: string) {
  const response = await fetch(`${API_PREFIX}/rooms/${encodeURIComponent(roomName)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username })
  });

  return parseJson<JoinRoomResponse>(response);
}

export async function getServerStatus() {
  const response = await fetch(`${API_PREFIX}/status`);
  return parseJson<{
    ok: boolean;
    roomsTracked: number;
    rooms: Array<{
      name: string;
      displayName: string;
      createdAt?: string | null;
      participants?: number;
    }>;
  }>(response);
}
