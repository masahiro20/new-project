# syntax=docker/dockerfile:1
# Kotomark remote MCP server. Build:  docker build -t kotomark .
# Run (see docs/deploy.md):
#   docker run -p 8080:8080 -v kotomark-data:/data \
#     -e KOTOMARK_ENCRYPTION_KEY=... -e KOTOMARK_API_TOKENS=... kotomark

# ---- build: all deps, tsc + CLI bundle ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY scripts/build-cli.mjs scripts/
COPY src ./src
RUN npm run build

# ---- prod deps only ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

# ---- runtime ----
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    KOTOMARK_DATA_DIR=/data
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY deploy/kotomark-cli.sh /usr/local/bin/kotomark
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/kotomark \
 && mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8080
# The entrypoint starts as root only to chown the mounted volume (Fly/Render mount it root-owned),
# then drops to the unprivileged `node` user (uid 1000) before the server starts. With
# `docker run --user 1000` it skips that step. The server itself never runs as root.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server/index.js"]
