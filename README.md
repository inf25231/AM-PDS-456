# Amphi Calls

Small pnpm workspace with two apps and a shared package:

- `apps/web-app` — SvelteKit client: camera capture, face tracking, 3D-mask
  and background effects, LiveKit video calls.
- `apps/signaling-server` — Express + LiveKit room API (control plane only:
  issues join tokens and manages room lifecycle; media never passes through
  it). See `apps/signaling-server/README.md` for the full API, project
  structure, and environment variables.
- `packages/camera-core` — shared pure/Svelte-free camera helpers (device
  enumeration, quality presets, settings persistence) used by `web-app`.

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

## Run The Web App

Start the web application in development mode:

```bash
pnpm web:dev
```

## Run The Signaling Server

Start the signaling server in watch mode:

```bash
pnpm signal:dev
```

## Build

Build all workspace packages:

```bash
pnpm build
```

## Other Commands

Run only the web app build:

```bash
pnpm --filter web-app build
```

Preview the production web build locally:

```bash
pnpm --filter web-app preview
```

## Typical Local Flow

```bash
pnpm install
pnpm check
pnpm web:dev
```
