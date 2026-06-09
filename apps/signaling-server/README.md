# Signaling Server

Express + LiveKit room API for the web app.

## Features

- Room create/join/list/get/update/delete APIs
- Token issuance for LiveKit room sessions
- Auto-delete empty rooms after `ROOM_EMPTY_TTL_MS` (default 60s)
- Action-based logs (`room.created_or_reused`, `room.updated`, `room.deleted`, etc.)
- Server status and basic load metrics API
- Connection quality snapshot API (`/status/connection-quality`)

## Required Environment

- `PORT` (default `3000`)
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Optional:

- `ROOM_EMPTY_TTL_MS` (default `60000`)
- `ROOM_SWEEP_INTERVAL_MS` (default `15000`)
- `CORS_ORIGIN` (default `*`)

## Run

```bash
pnpm --filter signaling-server dev
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
