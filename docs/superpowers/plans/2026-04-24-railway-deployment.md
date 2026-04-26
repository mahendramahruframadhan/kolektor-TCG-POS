# Railway Deployment Implementation Plan

> **Status: DEFERRED / NOT CURRENTLY RELEVANT (archived 2026-04-26)**
>
> Reviewed against the PRD and current architecture. The PRD explicitly specifies
> "single VPS node, SQLite on persistent disk" (CLAUDE.md §Planned architecture).
> This plan requires routing all API under `/api` prefix and adding Docker/static
> serving — meaningful breaking changes with no current driver. The plan is
> technically sound and can be executed if cloud deployment is ever needed;
> keeping it here as a reference. Do not implement without re-opening the
> deployment decision with the team.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy KolektaPOS as a single Docker container — Fastify serves both the compiled PWA static files and the API on one port.

**Architecture:** A multi-stage–free single-stage Dockerfile builds the full monorepo (packages → web → api) and produces one image. At runtime, `@fastify/static` serves `apps/web/dist/` from the root prefix; all API routes live under `/api`; a `setNotFoundHandler` provides the SPA fallback. SQLite + photos live on a mounted `/data` volume.

**Tech Stack:** Node 22 Alpine, pnpm 10, Turbo, `@fastify/static`, Docker, `railway.toml` (Dockerfile pointer only — works on Fly/Render/any Docker host too)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/db/package.json` | modify | add `build` script; update exports to `dist/` |
| `packages/types/package.json` | modify | add `build` script; update exports to `dist/` |
| `packages/sync/package.json` | modify | add `build` script; update exports to `dist/` |
| `packages/qr/package.json` | modify | add `build` script; update exports to `dist/` |
| `apps/api/package.json` | modify | add `@fastify/static` dependency |
| `apps/api/src/config.ts` | modify | add `STATIC_PATH` and `AUDIT_ARCHIVE_DIR` optional env vars |
| `apps/api/src/server.ts` | modify | wrap routes in `/api` prefix; add static serving + SPA fallback; fix audit-archive path |
| `apps/web/vite.config.ts` | modify | remove proxy `rewrite` (dev proxy forwards `/api` as-is) |
| `Dockerfile` | create | single-stage build: install → build → run |
| `.dockerignore` | create | exclude `node_modules`, `dist`, secrets, git |
| `railway.toml` | create | minimal: Dockerfile pointer + health check path |
| `.env.example` | modify | document `STATIC_PATH` and `AUDIT_ARCHIVE_DIR` |
| `docs/03-runbook.md` | modify | add Railway deploy section |

---

## Task 1: Fix workspace packages — add build scripts and update exports

**Context:** Workspace packages currently export TypeScript source (`./src/index.ts`). Running `node apps/api/dist/server.js` in any container crashes immediately because Node.js can't import `.ts` files. We fix this by compiling each package and updating `package.json#exports` to point to the compiled JS. The internal `.js` extension imports inside each package are already correct, so `tsc` output is immediately runnable.

Special case for `packages/db`: `migrate.ts` reads `triggers.sql` relative to `__dirname`. After compilation, `__dirname` is `dist/`, so we copy `src/triggers.sql` → `dist/triggers.sql` as part of the build.

**Files:**
- Modify: `packages/db/package.json`
- Modify: `packages/types/package.json`
- Modify: `packages/sync/package.json`
- Modify: `packages/qr/package.json`

- [ ] **Step 1: Update `packages/db/package.json`**

Replace the entire `scripts` block and `exports` field:

```json
{
  "name": "@kolektapos/db",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./schema": "./dist/schema.js",
    "./seed": "./dist/seed.js"
  },
  "scripts": {
    "build": "tsc && cp src/triggers.sql dist/triggers.sql",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/migrate.ts",
    "db:seed": "tsx src/seed.ts",
    "db:studio": "drizzle-kit studio",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Update `packages/types/package.json`**

Add `build` script and update exports:

```json
{
  "name": "@kolektapos/types",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Update `packages/sync/package.json`**

Add `build` script and update exports:

```json
{
  "name": "@kolektapos/sync",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 4: Update `packages/qr/package.json`**

Add `build` script and update exports:

```json
{
  "name": "@kolektapos/qr",
  "version": "0.0.0",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "exports": {
    ".": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 5: Verify packages build**

Run from repo root:

```bash
pnpm turbo run build --filter @kolektapos/db --filter @kolektapos/types --filter @kolektapos/sync --filter @kolektapos/qr
```

Expected: each package produces a `dist/` directory. `packages/db/dist/` should contain `triggers.sql` alongside the compiled JS.

```bash
ls packages/db/dist/
# Expected: index.js  migrate.js  schema.js  seed.js  triggers.sql
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/package.json packages/types/package.json packages/sync/package.json packages/qr/package.json
git commit -m "build: compile workspace packages to dist/ — fixes node runtime missing .ts handler"
```

---

## Task 2: Update Fastify server — `/api` prefix, static serving, SPA fallback

**Context:** The web app hard-codes `const BASE = "/api"` in its API client. In dev, Vite stripped that prefix before forwarding to Fastify; in production there is no Vite proxy, so Fastify must own `/api/*` routes directly. We wrap all existing route registrations in a scoped plugin with `{ prefix: '/api' }`. `/health` and `/docs/api` (swagger) stay outside the prefix — they're for operators/probes, not the web app.

We also add `@fastify/static` to serve the compiled PWA, controlled by an optional `STATIC_PATH` env var so development without the flag is unaffected.

Two new optional env vars go in `config.ts`:
- `STATIC_PATH` — path to the built web dist (set by Dockerfile; absent in dev)
- `AUDIT_ARCHIVE_DIR` — override for the audit-archive location (defaults to `storage/audit-archive`)

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Install `@fastify/static`**

```bash
pnpm --filter @kolektapos/api add @fastify/static
```

Verify `apps/api/package.json` now has `"@fastify/static"` in dependencies.

- [ ] **Step 2: Update `apps/api/src/config.ts`**

Add `STATIC_PATH` and `AUDIT_ARCHIVE_DIR` to the Zod schema (both optional — absent in dev):

```typescript
import { z } from "zod";

const SessionSecretSchema = z
  .string()
  .min(32, "SESSION_SECRET must be at least 32 characters long")
  .refine(
    (v) => v !== "change-me-to-a-long-random-string",
    "SESSION_SECRET is still the .env.example placeholder — rotate via `openssl rand -hex 32`"
  );

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_PATH: z.string().default("kolektapos.db"),
    PHOTO_STORAGE_PATH: z.string().default("storage/photos"),
    SESSION_SECRET: SessionSecretSchema,
    DOMAIN: z.string().optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
    STATIC_PATH: z.string().optional(),
    AUDIT_ARCHIVE_DIR: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production" && !v.DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DOMAIN"],
        message:
          "DOMAIN is required in production — CORS would otherwise reflect any origin with credentials",
      });
    }
    if ((v.ADMIN_EMAIL && !v.ADMIN_PASSWORD) || (!v.ADMIN_EMAIL && v.ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_EMAIL"],
        message:
          "ADMIN_EMAIL and ADMIN_PASSWORD must be set together (or both left unset — seed then skips admin creation)",
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "<env>"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[config] Invalid environment variables:\n${formatted}\n\nSee .env.example for the expected shape.`
    );
  }
  return parsed.data;
}
```

- [ ] **Step 3: Rewrite `apps/api/src/server.ts`**

Replace the entire file with:

```typescript
import { config as dotenvConfig } from "dotenv";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import staticPlugin from "@fastify/static";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });
dotenvConfig({ path: resolve(__dirname, "../../.env") });

import { loadConfig } from "./config.js";
import { runMigrations, seed } from "@kolektapos/db";
import { sessionPlugin } from "./plugins/session.js";
import { auditPlugin } from "./plugins/audit.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { eventRoutes } from "./routes/events.js";
import { paymentChannelRoutes } from "./routes/payment-channels.js";
import { settingsRoutes } from "./routes/settings.js";
import { cardRoutes } from "./routes/cards.js";
import { cartRoutes } from "./routes/carts.js";
import { holdRoutes } from "./routes/holds.js";
import { transactionRoutes } from "./routes/transactions.js";
import { backupRoute } from "./routes/backup.js";
import { syncRoutes } from "./routes/sync.js";
import { settlementRoutes } from "./routes/settlement.js";
import { auditLogRoutes } from "./routes/audit-log.js";
import { overrideRoutes } from "./routes/overrides.js";
import { healthRoutes } from "./routes/health.js";
import { startCartSweeper } from "./jobs/cart-sweeper.js";
import { startAuditPruner } from "./jobs/audit-pruner.js";

// Fail-fast env validation. Any misconfiguration (placeholder SESSION_SECRET,
// missing DOMAIN in production, partially-set admin seed vars, malformed PORT,
// etc.) surfaces as a clear error at boot instead of subtly at request time.
const cfg = loadConfig();

// Ensure storage dirs exist so photo upload never crashes on a fresh deploy.
// Audit-archive is created lazily by the pruner cron on first run.
mkdirSync(resolve(cfg.PHOTO_STORAGE_PATH), { recursive: true });

async function build() {
  const app = Fastify({ logger: true });

  // DB
  const { db } = await runMigrations(cfg.DATABASE_PATH);
  await seed(db);

  // Perimeter security — §H4/H10 of MVP hardening
  await app.register(helmet, {
    // PWA lives on the same domain as the API (PRD §10); no CSP wiring here.
    contentSecurityPolicy: false,
  });

  // CORS: explicit dev allowlist (localhost vite origins) or production
  // HTTPS host. DOMAIN is required in production (enforced by loadConfig).
  const allowedOrigin: string | string[] = cfg.DOMAIN
    ? `https://${cfg.DOMAIN}`
    : ["http://localhost:5173", "http://127.0.0.1:5173"];
  await app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
  });

  await app.register(rateLimit, {
    global: false, // only routes that opt in via {config:{rateLimit:...}} are throttled
  });

  // OpenAPI — auto-generates from route schemas. Swagger-UI at /docs/api.
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: {
        title: "KolektaPOS API",
        description:
          "Single-booth TCG POS sync + admin API. Local-first; session-cookie auth; append-only transactions. See docs/01-prd.md.",
        version: "0.1.0",
      },
      servers: [{ url: `http://localhost:${cfg.PORT}` }],
      tags: [
        { name: "auth", description: "Login, logout, change password, /me" },
        { name: "cards", description: "Card CRUD + stock-receive" },
        { name: "carts", description: "Cart mutations + pay + abandon" },
        { name: "transactions", description: "Transaction read + void/refund" },
        { name: "sync", description: "PWA push/pull protocol" },
        { name: "settlement", description: "Per-event + monthly payout reports" },
        { name: "admin", description: "Settings, users, audit log, backup" },
      ],
      components: {
        securitySchemes: {
          sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "sessionId",
            description:
              "Fastify session cookie (sameSite=strict). Obtain via POST /api/auth/login.",
          },
        },
      },
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs/api",
    uiConfig: { docExpansion: "list", deepLinking: false },
  });

  // Plugins
  await sessionPlugin(app);
  await auditPlugin(app, { db });

  // All application routes are mounted under /api so the PWA's fetch BASE="/api"
  // works without a proxy in production.
  await app.register(async (api) => {
    await authRoutes(api, { db });
    await userRoutes(api, { db });
    await eventRoutes(api, { db });
    await paymentChannelRoutes(api, { db });
    await settingsRoutes(api, { db });
    await cardRoutes(api, { db });
    await cartRoutes(api, { db });
    await holdRoutes(api, { db });
    await transactionRoutes(api, { db });
    await backupRoute(api, { dbPath: cfg.DATABASE_PATH, photoStoragePath: cfg.PHOTO_STORAGE_PATH });
    await syncRoutes(api, { db });
    await settlementRoutes(api, { db });
    await auditLogRoutes(api, { db });
    await overrideRoutes(api, { db });
  }, { prefix: "/api" });

  // Operator / probe routes — intentionally outside /api prefix.
  await healthRoutes(app, { db });

  // Static PWA serving — only active when STATIC_PATH is set (i.e. in production).
  // In dev, Vite serves the frontend on its own port and proxies /api to this server.
  if (cfg.STATIC_PATH) {
    await app.register(staticPlugin, {
      root: resolve(cfg.STATIC_PATH),
      wildcard: true,
      index: "index.html",
    });

    // SPA fallback: serve index.html for client-side routes; return JSON 404 for
    // unknown /api paths so the frontend gets a structured error.
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  // Start background jobs
  startCartSweeper(db, { logger: app.log });
  startAuditPruner(db, { logger: app.log, archiveDir: cfg.AUDIT_ARCHIVE_DIR });

  return app;
}

// Bootstrap
const app = await build();
await app.listen({ port: cfg.PORT, host: cfg.HOST });
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm --filter @kolektapos/api typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/src/config.ts apps/api/src/server.ts
git commit -m "feat(api): mount routes under /api prefix; add @fastify/static SPA serving"
```

---

## Task 3: Update Vite dev proxy

**Context:** In dev, Vite proxied requests from `/api/*` to `localhost:3001` and *stripped* the `/api` prefix. Now that Fastify owns the `/api/*` routes directly, the proxy should forward them unchanged (no `rewrite`).

**Files:**
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: Update proxy config**

In `apps/web/vite.config.ts`, replace the `server.proxy` block:

```typescript
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
```

Full file after change:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "hero.webp"],
      manifest: {
        name: "KolektaPOS",
        short_name: "KolektaPOS",
        description: "POS untuk booth TCG Sales",
        theme_color: "#1d4ed8",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/favicon.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/vite.config.ts
git commit -m "fix(web): remove proxy rewrite — Fastify now owns /api/* routes directly"
```

---

## Task 4: Dockerfile, .dockerignore, railway.toml

**Context:** Single-stage Docker build on Node 22 Alpine. Alpine is required because `better-sqlite3` is a native module that must compile from source against musl libc (no prebuilt musl binaries are available). We copy package manifests first so the `pnpm install` layer is cached until dependencies change. The `pnpm turbo run build` step builds packages in dependency order (packages → web → api). SQLite and photos live on `/data` which must be mounted as a persistent volume by the operator. All secrets (`SESSION_SECRET`, `DOMAIN`, etc.) are injected at runtime via environment variables — never baked into the image.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `railway.toml`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
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
COPY packages/ui/package.json    packages/ui/

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

VOLUME /data

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/kolektapos.sqlite \
    PHOTO_STORAGE_PATH=/data/photos \
    AUDIT_ARCHIVE_DIR=/data/audit-archive \
    STATIC_PATH=/app/apps/web/dist

EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
.git
.gitignore
.claude
.npmrc
node_modules
.pnpm-store
dist
build
.turbo
*.tsbuildinfo
.env
.env.*
*.sqlite
*.sqlite-journal
*.sqlite-wal
*.sqlite-shm
storage/
scratch/
docs/
```

- [ ] **Step 3: Create `railway.toml`**

```toml
[build]
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath   = "/health"
healthcheckTimeout = 30
restartPolicyType  = "on_failure"
restartPolicyMaxRetries = 3
```

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore railway.toml
git commit -m "deploy: add Dockerfile + .dockerignore + railway.toml"
```

---

## Task 5: Update `.env.example` and runbook

**Files:**
- Modify: `.env.example`
- Modify: `docs/03-runbook.md`

- [ ] **Step 1: Update `.env.example`**

Add the two new optional vars at the end of the file:

```bash
# Production: path to compiled web dist served as static files.
# Set automatically by Dockerfile; leave unset in local dev (Vite serves the frontend).
# STATIC_PATH=/app/apps/web/dist

# Audit-archive directory (defaults to storage/audit-archive relative to CWD).
# Dockerfile sets this to /data/audit-archive so the app user can write to the volume.
# AUDIT_ARCHIVE_DIR=/data/audit-archive
```

- [ ] **Step 2: Add Railway deploy section to `docs/03-runbook.md`**

Insert the following section immediately after the existing `## 1. Pre-event setup` heading (before `### 1.1 Deploy / update server`):

```markdown
### 1.0 Railway deployment (first-time and updates)

#### First deploy

1. Create a Railway project and connect this GitHub repository.
2. In **Settings → Build**: confirm it uses the `Dockerfile` (Railway detects this automatically from `railway.toml`).
3. Attach a **Volume** at `/data` (Railway dashboard → Add Volume). This holds the SQLite database and photos across deploys.
4. Set **environment variables** in Railway dashboard:

| Variable | Example value | Notes |
|----------|--------------|-------|
| `SESSION_SECRET` | *(output of `openssl rand -hex 32`)* | Required; rejected at boot if still placeholder |
| `DOMAIN` | `kolektapos-xxx.up.railway.app` | Required in production; Railway assigns one |
| `ADMIN_EMAIL` | `revota@example.com` | Only needed for first deploy to create admin user |
| `ADMIN_PASSWORD` | *(secure passphrase)* | Only needed for first deploy; remove after |

5. Deploy. Watch the build logs — `loadConfig()` will fail fast and clearly if any required variable is missing.
6. Verify: `curl https://<your-domain>/health` should return `{"status":"ok", ...}`.
7. Remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from Railway env vars after confirming admin login works.

#### Subsequent deploys (code update)

```bash
git push origin main   # Railway auto-deploys on push to main
```

Railway performs a rolling restart: the new container starts, passes the health check at `/health`, then the old one is stopped. No downtime.

#### Rollback

Railway dashboard → Deployments → click a previous deployment → **Redeploy**.

#### Migrate database after schema change

Railway doesn't run migrations automatically. After a deploy that includes new Drizzle migrations, connect to the running container and run:

```bash
railway run node -e "import('@kolektapos/db').then(m => m.runMigrations(process.env.DATABASE_PATH))"
```

Or add a `release` command in `railway.toml` once migration automation is needed.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/03-runbook.md
git commit -m "docs: document STATIC_PATH + AUDIT_ARCHIVE_DIR; add Railway deploy section to runbook"
```

---

## Task 6: Full build + test verification, then push

- [ ] **Step 1: Run full build from root**

```bash
pnpm turbo run build
```

Expected: all packages build, then `apps/web` builds (Vite), then `apps/api` builds (tsc). No errors.

- [ ] **Step 2: Run tests**

```bash
pnpm test
```

Expected: all 60 tests pass. (Tests build their own Fastify instances without the `/api` prefix, so the prefix change in `server.ts` doesn't affect them.)

- [ ] **Step 3: Smoke-test static path resolution**

```bash
NODE_ENV=production \
SESSION_SECRET="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" \
DOMAIN=localhost \
DATABASE_PATH=":memory:" \
STATIC_PATH=apps/web/dist \
node -e "
import('./apps/api/dist/server.js').catch(e => { console.error(e.message); process.exit(1) });
setTimeout(() => { console.log('boot ok'); process.exit(0) }, 3000);
"
```

Expected: prints `boot ok` within 3 seconds (server starts, registers static plugin, serves from `apps/web/dist`).

- [ ] **Step 4: Push branch**

```bash
git push -u origin feat/railway-deployment
```

---

## Self-Review

**Spec coverage:**
- ✅ Single-port: all API under `/api`, static at `/`, same Fastify process
- ✅ `@fastify/static` with SPA fallback
- ✅ Cloud-provider-agnostic: `Dockerfile` + `railway.toml` (minimal pointer)
- ✅ `better-sqlite3` native compilation handled by Alpine build tools
- ✅ `/data` volume for persistence
- ✅ Secrets injected at runtime, not baked in
- ✅ Dev proxy updated so `pnpm dev` still works
- ✅ Workspace packages compile to JS before API build (turbo `^build` order)
- ✅ `triggers.sql` copied to `dist/` so compiled `migrate.js` finds it
- ✅ `AUDIT_ARCHIVE_DIR` routes audit archives to the writable `/data` volume
- ✅ Runbook updated

**Placeholder scan:** no TBDs found.

**Type consistency:**
- `cfg.STATIC_PATH: string | undefined` — matches `if (cfg.STATIC_PATH)` guard in server.ts ✓
- `cfg.AUDIT_ARCHIVE_DIR: string | undefined` — passed as `archiveDir` to `startAuditPruner`, which accepts `opts.archiveDir?: string` ✓
- `staticPlugin` imported as default from `@fastify/static` ✓
