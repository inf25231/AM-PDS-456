FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-app/package.json apps/web-app/package.json
COPY apps/signaling-server/package.json apps/signaling-server/package.json
RUN pnpm --filter signaling-server install --frozen-lockfile --prod

COPY apps/signaling-server apps/signaling-server

WORKDIR /app/apps/signaling-server
EXPOSE 8080
CMD ["pnpm", "start"]
