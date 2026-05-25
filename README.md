# Amphi Calls

Small pnpm workspace with two apps:

- `apps/web-app` — SvelteKit client application
- `apps/signaling-server` — small WebSocket signaling server

## Environment

- Node.js 24+
- pnpm 11+

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
