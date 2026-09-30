# syntax=docker/dockerfile:1
FROM docker:29.8.0-cli AS docker-cli

FROM node:24-bookworm AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
COPY patches ./patches
COPY tsconfig.base.json .oxlintrc.json .npmrc ./
COPY config ./config
COPY public ./public
COPY THIRD-PARTY-NOTICES.md ./THIRD-PARTY-NOTICES.md

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @zcode/web build
RUN pnpm --filter @zcode/server build
RUN pnpm --filter @zcode/cli... build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3030
ENV ZCODE_SERVER_HOST=0.0.0.0
ENV ZCODE_DATA_BASE_DIR=/data
ENV ZCODE_WEB_STATIC_ROOT=/app/web-dist
ENV ZCODE_AGENT_SERVER_COMMAND=node
ENV ZCODE_AGENT_SERVER_ARGS_JSON='["/app/agent/zcode.cjs","app-server","--stdio"]'

RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# ZCode agents can use the Docker CLI through DOCKER_HOST, which points at the
# least-privilege API proxy rather than mounting the Docker socket into zcode.
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
RUN mkdir -p /usr/local/libexec/docker/cli-plugins
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/apps/zcode-cli/packages/cli/dist/zcode.cjs ./agent/zcode.cjs
COPY --from=build /app/config/provider/zcode-builtin.json ./agent/provider/zcode-builtin.json
COPY --from=build /app/packages/web/dist ./web-dist
COPY --from=build /app/package.json ./package.json
COPY docker ./docker

RUN mkdir -p /data /workspace && chown -R node:node /data /workspace
WORKDIR /workspace
USER node
EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3030/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "/app/docker/start.mjs"]
