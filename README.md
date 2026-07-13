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
