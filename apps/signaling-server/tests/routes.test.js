import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import express from 'express';

import { registerRoutes } from '../src/routes.js';
import { createRoomRegistry } from '../src/room-registry.js';

// A no-op logger so route handlers can call logger.action/error without output.
function createSilentLogger() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, action: noop };
}

// A tiny fake livekit admin. Only the methods used by the routes under test
// are implemented; each returns simple canned data (no network involved).
function createFakeLivekit() {
  return {
    normalizeRoomName(name) {
      return String(name || '')
        .trim()
        .toLowerCase();
    },
    async getRoom(name) {
      // Pretend only "math" exists.
      if (name === 'math') {
        return { name: 'math', metadata: {} };
      }
      return null;
    },
    async listParticipants() {
      return [];
    },
    async buildJoinToken() {
      return 'fake-jwt-token';
    }
  };
}

// A minimal room service backed by the real registry, with fakes for the
// livekit-dependent pieces so no network is touched.
function createFakeRoomService(livekit, roomRegistry) {
  return {
    async syncRoomParticipants(roomName) {
      const participants = await livekit.listParticipants(roomName);
      roomRegistry.setParticipants(roomName, participants.length);
      return participants;
    },
    trackRoomFromLivekit(room, participants) {
      return roomRegistry.ensureRoom(room.name, { participants });
    },
    buildUniqueUsername(requested) {
      return String(requested || '').trim() || 'guest';
    }
  };
}

// Build the app exactly like index.js does (express.json + registerRoutes),
// but with injected fakes.
function buildTestApp() {
  const app = express();
  app.use(express.json());

  const livekit = createFakeLivekit();
  const roomRegistry = createRoomRegistry();
  const roomService = createFakeRoomService(livekit, roomRegistry);

  registerRoutes(app, {
    config: { livekitUrl: 'wss://example.test' },
    logger: createSilentLogger(),
    livekit,
    roomRegistry,
    roomService,
    isRoomMissingError: () => false
  });

  return app;
}

let server;
let baseUrl;

before(async () => {
  const app = buildTestApp();
  // Listen on port 0 -> the OS picks a free port.
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('routes (integration)', () => {
  test('GET /health returns ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(typeof body.timestamp === 'string');
  });

  test('GET /status is empty initially', async () => {
    const res = await fetch(`${baseUrl}/status`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.roomsTracked, 0);
    assert.deepEqual(body.rooms, []);
  });

  test('POST join returns a token for a known room', async () => {
    const res = await fetch(`${baseUrl}/rooms/math/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.room, 'math');
    assert.equal(body.username, 'alice');
    assert.equal(body.token, 'fake-jwt-token');
  });

  test('POST join returns 404 for unknown room', async () => {
    const res = await fetch(`${baseUrl}/rooms/ghost/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'alice' })
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error, 'Room not found');
  });

  test('POST join returns 400 without username', async () => {
    const res = await fetch(`${baseUrl}/rooms/math/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  test('POST join returns 400 for an overlong username', async () => {
    const res = await fetch(`${baseUrl}/rooms/math/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'a'.repeat(65) })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /at most 64 characters/);
  });

});
