FROM node:22-alpine

# Native module compilation — better-sqlite3 has no prebuilt musl (Alpine) binary
RUN apk add --no-cache python3 make g++

# pnpm via corepack (version pinned to match packageManager field)
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

# ── Dependency layer (cached until any package.json / lockfile changes) ──────
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json  apps/api/
COPY apps/web/package.json  apps/web/
COPY packages/db/package.json   packages/db/
COPY packages/types/package.json packages/types/
COPY packages/sync/package.json  packages/sync/
COPY packages/qr/package.json    packages/qr/

RUN pnpm install --frozen-lockfile

# ── Build layer (invalidated on any source change) ───────────────────────────
COPY . .
# Turbo builds packages first (^build dependency), then web, then api
RUN pnpm turbo run build

# ── Runtime configuration ─────────────────────────────────────────────────────
RUN addgroup -S app && adduser -S -G app app \
 && mkdir -p /data \
 && chown app:app /data

USER app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/kolektapos.sqlite \
    PHOTO_STORAGE_PATH=/data/photos \
    AUDIT_ARCHIVE_DIR=/data/audit-archive \
    STATIC_PATH=/app/apps/web/dist

EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
