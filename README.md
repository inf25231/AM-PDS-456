# Amphi Calls

Small pnpm workspace with two apps:

- `apps/web-app` — SvelteKit client: camera capture, face tracking, 3D-mask
  and background effects, LiveKit video calls.
- `apps/signaling-server` — Express + LiveKit room API (control plane only:
  issues join tokens and manages room lifecycle; media never passes through
  it). See `apps/signaling-server/README.md` for the full API, project
  structure, and environment variables.

## Environment

- Node.js 24+
- pnpm 10.22.0 (pinned via `packageManager` in `package.json`)

## Install

```bash
pnpm install
```

## Verify Setup

Run the workspace checks before starting development:

```bash
pnpm check
```

This runs the project checks for all workspace packages.

## Lint & Format

```bash
pnpm lint          # ESLint (JS/TS/Svelte)
pnpm format        # Prettier — write formatting fixes
pnpm format:check  # Prettier — check only, no writes
```

## Run The Web App

Start the web application in development mode:

```bash
pnpm web:dev
```

Build and preview the production web build locally:

```bash
pnpm web:build
pnpm web:preview
```

`web:preview` is only for local verification of a production build. Normal
web builds use `adapter-auto`, so their deployed runtime is selected by the
hosting platform. The Docker build explicitly uses the Node adapter.

To test a production build locally without a reverse proxy, run the signaling
server with the preview origin allowed, then build the web app with its direct
URL:

```bash
# Terminal 1
CORS_ORIGIN=http://localhost:4173 pnpm signal:start

# Terminal 2
VITE_SIGNALING_PREFIX=http://localhost:8080 pnpm web:build
pnpm web:preview
```

In an actual deployment, configure a reverse proxy for `/api` or set
`VITE_SIGNALING_PREFIX` to the public signaling-server URL at build time.

## Docker

Docker runs the web app and signaling server in separate containers. LiveKit
remains an external service.

```bash
cp apps/signaling-server/.env.example apps/signaling-server/.env
# Fill in only the three LIVEKIT_* values in apps/signaling-server/.env.
pnpm docker:up
```

Open `http://localhost:3000`. The browser reaches the signaling server through
`http://localhost:8080`. The Docker configuration already allows the matching
local CORS origin, so no other values are needed.

The `pnpm docker:*` commands are short aliases for Docker Compose. The direct
Docker commands are:

```bash
docker compose up --build --detach                 # both services
docker compose up --build --detach signaling       # signaling server only
docker compose up --build --detach --no-deps web   # web app only
docker compose down
```

The equivalent short commands are:

```bash
pnpm docker:up
pnpm docker:server
pnpm docker:web
pnpm docker:down
```

## Run The Signaling Server

Start the signaling server in watch mode:

```bash
pnpm signal:dev
```

Start it in production mode:

```bash
pnpm signal:start
```

## Build

Build all workspace packages:

```bash
pnpm build
```

## Package Commands

Run only the web app build:

```bash
pnpm web:build
```

Preview the production web build locally:

```bash
pnpm web:preview
```

Run signaling-server tests:

```bash
pnpm --filter signaling-server test
```

Run the web app's camera helper tests:

```bash
pnpm --filter web-app test
```

## Typical Local Flow

```bash
pnpm install
pnpm check
pnpm lint
pnpm web:dev
```
