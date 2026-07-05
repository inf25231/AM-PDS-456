# Signaling Server

Express + LiveKit room API for the web app.

It lets the web app create video rooms, list them, and hand out access tokens
so users can join a LiveKit room. Empty rooms are cleaned up automatically.

## Project Structure

All source lives in `src/`. Each file has a single job:

- `index.js` — entry point. Reads config, wires everything together
  (dependency injection), starts the HTTP server, and handles shutdown.
- `config.js` — reads and validates environment variables.
- `routes.js` — all HTTP endpoints (see the API section below).
- `room-service.js` — the "glue" layer: combines a LiveKit call with a
  registry update. Route handlers call this, not LiveKit directly.
- `livekit-admin.js` — thin wrapper around the LiveKit server SDK
  (create/list/delete rooms, list participants, build join tokens).
- `room-registry.js` — in-memory list of known rooms. Not saved to disk;
  it is rebuilt from LiveKit on startup.
- `cleanup-loop.js` — timer that periodically deletes rooms that have been
  empty for too long.
- `errors.js` — helper to detect "room not found" errors from LiveKit.
- `logger.js` — small logger with `info` / `warn` / `error` / `action` levels.

Tests live in `tests/`, and `scripts/smoke-test.mjs` is a manual end-to-end
check against a running server.

## How It Works

A typical request flows like this:

1. A request hits an endpoint in `routes.js`.
2. The handler calls `room-service.js` to do the real work.
3. `room-service.js` talks to LiveKit via `livekit-admin.js` and updates the
   local `room-registry.js`.
4. The handler sends back a JSON response.

Every response follows the same shape:

- Success: `{ "ok": true, ...data }`
- Client error: `{ "ok": false, "error": "..." }` with a 4xx status
- Server error: `{ "ok": false, "error": "..." }` with a 500 status

**Automatic cleanup:** `cleanup-loop.js` runs every `ROOM_SWEEP_INTERVAL_MS`.
For each room it checks the participants; if a room has been empty longer than
`ROOM_EMPTY_TTL_MS`, it is deleted from LiveKit and removed from the registry.

**Room names** are normalized (lowercased, spaces become dashes, special
characters removed, max 64 chars), so `"Math 101!"` becomes `math-101`.

## Features

- Room create/join/list/get/update/delete APIs
- Token issuance for LiveKit room sessions
- Auto-delete empty rooms after `ROOM_EMPTY_TTL_MS` (default 60s)
- Action-based logs (`room.created_or_reused`, `room.updated`, `room.deleted`, etc.)
- Server status API
- Connection quality snapshot API (`/status/connection-quality`)

## Required Environment

- `PORT`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Optional:

- `CORS_ORIGIN` (default `*`)

## Run

```bash
pnpm --filter signaling-server dev
```

## Tests

Tests use Node's built-in test runner (`node:test`) — no extra
dependencies required. They cover the pure logic of the server (room registry
state, unique username assignment, room-name normalization, config parsing, and
error detection), plus HTTP integration tests for the routes (health, status,
and the join-token flow) using an in-memory app with fake dependencies.

```bash
pnpm --filter signaling-server test
```

## Quick Smoke Test

Start the server first, then run:

```bash
pnpm --filter signaling-server smoke
```

## API

### Health and status

- `GET /health`
- `GET /status`
- `GET /status/connection-quality`

### Rooms

- `GET /rooms`
- `POST /rooms` body: `{ "name": "demo", "displayName": "Demo" }`
- `GET /rooms/:roomName`
- `PATCH /rooms/:roomName` body: `{ "displayName": "New", "metadata": { ... } }`
- `DELETE /rooms/:roomName`
- `POST /rooms/:roomName/join` body: `{ "username": "alice" }`
- `GET /rooms/:roomName/participants`
- `POST /rooms/:roomName/cleanup`

### Backward compatibility

- `GET /token?room=demo&username=alice`
