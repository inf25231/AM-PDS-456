# Amphi Calls

[![Node.js >=24](https://img.shields.io/badge/node-%3E%3D24-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm 10.22.0](https://img.shields.io/badge/pnpm-10.22.0-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![SvelteKit 2](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![Express 5](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![LiveKit](https://img.shields.io/badge/LiveKit-WebRTC-1E88E5)](https://livekit.io/)

Browser video calling "something" with camera effects.  
`web-app` handles camera/effects/UI, and `signaling-server` is a control-plane API for room lifecycle and LiveKit join tokens.

<table>
  <tr>
    <td align="center">
      <b>Desktop</b><br><br>
      <img src="https://i.imgur.com/HZi8wVy.png" width="500" alt="Desktop version">
    </td>
    <td align="center">
      <b>Mobile</b><br><br>
      <img src="https://i.imgur.com/gRBHh9J.jpeg" width="171" alt="Mobile version">
    </td>
  </tr>
</table>


## 1. Project overview and demo

### What this project is
- A monorepo for video calls with:
  - local camera effects (debug face landmarks, 3D mask demo, image backgrounds for 3D model),
  - LiveKit-based communication,
  - an Express signaling API for rooms and tokens.

### Monorepo structure
- `apps/web-app` - SvelteKit 2 + Svelte 5 + Tailwind 4 client
- `apps/signaling-server` - Express 5 API (control plane only)
- Camera and Calls domain logic lives under `apps/web-app/src/lib/camera/*`

## 2. Key features

- Real-time local effects on webcam preview and published stream
- LiveKit room calls (audio/video) with other participants
- Room/token management API (`create`, `join`, `participants`, `cleanup`)
- Automatic empty-room cleanup on the signaling server

## 3. System requirements and dependencies

### Required
- Node.js **24+**
- pnpm **10.22.0** (pinned in `packageManager`)

### Main technologies
- SvelteKit 2, Svelte 5, Tailwind 4, TypeScript
- Express 5, `livekit-server-sdk`
- MediaPipe face landmarks, Three.js renderer pipeline

### Environment variables (signaling server)
- `PORT`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `CORS_ORIGIN` (required in production, explicit origin list)

## 4. Installation and local run

```bash
git clone https://github.com/inf25231/AM-PDS-456.git
cd AM-PDS-456
pnpm install
cp apps/signaling-server/.env.example apps/signaling-server/.env
# fill LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
```

### Run development services

```bash
# Web app (Vite/SvelteKit dev server)
pnpm web:dev

# Signaling server (watch mode)
pnpm signal:dev
```

### Quality checks

```bash
pnpm check
pnpm lint
pnpm --filter web-app test
pnpm --filter signaling-server test
```

### Production build

```bash
pnpm build
pnpm web:preview
pnpm signal:start
```

## 5. Usage examples

### Create a room

```bash
curl -X POST http://localhost:8080/rooms \
  -H "content-type: application/json" \
  -d '{"name":"demo-room","displayName":"Demo Room"}'
```

### Issue join token

```bash
curl -X POST http://localhost:8080/rooms/demo-room/join \
  -H "content-type: application/json" \
  -d '{"username":"alice"}'
```

### Check participants

```bash
curl http://localhost:8080/rooms/demo-room/participants
```

### Smoke test signaling API

```bash
pnpm --filter signaling-server smoke
```

## 6. Deployment

### CI/CD (current flow)
- GitHub Actions workflow: `.github/workflows/deploy-signaling.yml`
- Deploy target: Oracle VM via SSH + PM2
- Trigger: push to `main` affecting `apps/signaling-server/**` or workflow file
- _P.S. I'm using Oracle Cloud VM and Vercel for the web app. But you can also deploy both apps on a single VM._

### VM runtime model
- Keep signaling server as a PM2 process (`signaling`)
- Keep LiveKit external (media never goes through signaling-server)
- Set production secrets in GitHub Actions:
  - `LIVEKIT_URL`
  - `LIVEKIT_API_KEY`
  - `LIVEKIT_API_SECRET`
  - `PORT`
  - `CORS_ORIGIN`

### Optional Docker local/prod flow

```bash
pnpm docker:up
pnpm docker:down
```

For public deploy, build web with correct API prefix (for example `VITE_SIGNALING_PREFIX=/api` behind reverse proxy).

## 7. Contributing

1. Fork and create a feature branch.
2. Install dependencies with `pnpm install`.
3. Run checks before PR:

```bash
pnpm check
pnpm lint
pnpm --filter web-app test
pnpm --filter signaling-server test
```

4. Open a PR with a clear summary and scope.

## 8. License

No license for now? or WTFPL

## 9. What I used
- [LiveKit](https://livekit.io/) for the WebRTC infrastructure and SDKs.
- [MediaPipe](https://developers.google.com/mediapipe) for face landmark detection and tracking.
- [Three.js](https://threejs.org/) for 3D rendering and effects.
- [Express](https://expressjs.com/) for the signaling server framework.
- [SvelteKit](https://kit.svelte.dev/) and [Tailwind CSS](https://tailwindcss.com/) for the web application framework and styling.
- [GitHub Actions](https://github.com/features/actions) for CI/CD automation and [Docker](https://www.docker.com/) for containerization.
- [Vercel](https://vercel.com/) for hosting the web application.
- [pnpm](https://pnpm.io/) for efficient package management.
- [TypeScript](https://www.typescriptlang.org/) for type safety and developer experience.
- [Eslint](https://eslint.org/) and [Prettier](https://prettier.io/) for code quality and formatting.
- [Copilot CLI](https://github.com/github/copilot-cli) for AI-assisted development.
- [Perplexity](https://www.perplexity.ai/) for AI-assisted research and information retrieval.
- [WebStorm](https://www.jetbrains.com/webstorm/) for IDE and debugging and [VS Code](https://code.visualstudio.com/) for lightweight editing and extensions.
- [trycloudflare](https://try.cloudflare.com/) for testing Cloudflare Workers and edge functions.
- [Oracle Cloud](https://www.oracle.com/cloud/) for cloud hosting and infrastructure services.
- [caddy](https://caddyserver.com/) for reverse proxy and TLS termination.

Inspiration: 
- [google ai mediapipe](https://github.com/google-ai-edge/mediapipe)
- [some yt-guy](https://www.youtube.com/watch?v=WY9W1ghMGWA)
- [TheBurntPeanut](https://www.twitch.tv/theburntpeanut)
- closed snapchat project "snap camera"
- [Lens Studio](https://ar.snap.com/lens-studio)
- [random github repo#1](https://github.com/jeeliz/jeelizFaceFilter)
- [random github repo#2](https://github.com/ayush4460/Snapchat-Face-Filter)
- [random github repo#3](https://github.com/pmndrs/react-three-fiber)
- [random github repo#4](https://github.com/boo-code/mediapipe-face-demo)
- [random github repo#5](https://github.com/yeemachine/kalidokit)
- [random github repo#6](https://github.com/breathingcyborg/mediapipe-face-effects)
- Make it run
- Make it right
- Make it fast

## 10. AI
Hell yeah, I used AI for code generation and assistance. The AI is used to help with code, refactoring suggestions, and documentation improvements. All AI-generated code is reviewed by the developer to ensure quality and correctness.
