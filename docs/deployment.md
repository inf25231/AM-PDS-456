# Deployment Notes

This guide contains deployment details that are not needed for everyday
development.

## Web App

`pnpm web:build` creates the web build. `pnpm web:preview` serves that build
locally for a quick check; it is not intended as an internet-facing server.

The normal build uses SvelteKit's `adapter-auto`, so the hosting platform
chooses the runtime. For a Docker image, the project uses SvelteKit's Node
adapter instead.

The web app calls the signaling API through `VITE_SIGNALING_PREFIX`:

- Development: Vite proxies `/api` to `http://localhost:8080`.
- Production: configure `/api` in a reverse proxy, or set
  `VITE_SIGNALING_PREFIX` to the public signaling-server URL while building.

## Signaling Server On The VM

`.github/workflows/deploy-signaling.yml` deploys signaling-server when `main`
changes its source, the workspace configuration, or the workflow itself. The
workflow installs production dependencies with pnpm, writes `.env` from GitHub
Actions secrets, and restarts the `signaling` PM2 process.

Useful VM commands:

```bash
pm2 status
pm2 logs signaling --lines 100 --nostream
pm2 restart signaling --update-env
curl --fail http://127.0.0.1:<PORT>/health
```

Run `pm2 startup` once on the VM after installing PM2, execute the command it
prints, then run `pm2 save`. This restores the signaling process after a VM
reboot.

## CORS

For production, set the `CORS_ORIGIN` GitHub Actions secret to the public
web-app URL. Multiple origins can be comma-separated. Do not use `*` for a
public deployment.

Docker Compose now reads `CORS_ORIGIN` from environment too:

- default: `http://localhost:3000` (local)
- public deploy: set `CORS_ORIGIN=https://your-web-domain`

## Docker

The root Docker commands are short aliases for Docker Compose:

```bash
docker compose up --build --detach                 # both services
docker compose up --build --detach signaling       # signaling server only
docker compose up --build --detach --no-deps web   # web app only
docker compose down
```

For public Docker deploy, build web with the public signaling URL:

```bash
VITE_SIGNALING_PREFIX=https://your-signaling-domain docker compose up --build --detach
```

If reverse proxy routes `/api` on the web domain to signaling, use:

```bash
VITE_SIGNALING_PREFIX=/api docker compose up --build --detach
```
