FROM node:24-alpine AS build

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web-app/package.json apps/web-app/package.json
COPY apps/signaling-server/package.json apps/signaling-server/package.json
RUN pnpm install --frozen-lockfile

COPY apps/web-app apps/web-app

WORKDIR /app/apps/web-app
ARG VITE_SIGNALING_PREFIX=http://localhost:8080
ENV VITE_SIGNALING_PREFIX=$VITE_SIGNALING_PREFIX
RUN pnpm build:node

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build /app/apps/web-app/build ./build

EXPOSE 3000
CMD ["node", "build"]
