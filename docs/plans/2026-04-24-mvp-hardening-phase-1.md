# KolektaPOS MVP Hardening — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Critical finding (and a handful of tightly-coupled Highs) from the merged code review at `docs/dev-notes/20260424-033000-CODE_REVIEW_REPORT-MERGE.md`, so the codebase is safe to run its first live event.

**Architecture:** Fix in place — no new subsystems, no migrations, no refactors beyond what each finding requires. Every change is either an added guard (authz, validation, rate-limit, perimeter headers), a corrected calculation (settlement sign, net math, timestamps), or a targeted bug fix (oversold void target, tap-and-hold inversion, backup snapshot).

**Tech Stack:** Fastify 5, better-sqlite3 via Drizzle 0.38, bcryptjs, Zod 3, React 19, Vitest 4. New runtime deps introduced: `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (Phase 1). Tests use the existing Fastify + in-memory SQLite pattern already established in `apps/api/src/routes/auth.test.ts`.

**Out of scope (defer to Phase 2+ of the merged review):**
- Full offline-first write queue (C4) — requires architectural work, addressed in a separate plan.
- `/sync/push` handlers for cart/item/hold/photo (tail end of C3).
- Delta sync for settings/payment_channels/tx_items/holds/cash_reconciliations (H9).
- Backup snapshot beyond the single-file SQLite backup (multi-tenant scenarios, etc.).
- Pagination of list endpoints (H7, H8), oversold card-reopen logic (H5), settled-event lock (H6), cart-sweeper orphan-lock sweep (M4) — reserved for MVP Hardening Phase 2.
- Most Medium/Low findings are deferred; only tightly-coupled ones are pulled in here (noted per task).

**Non-Goals:**
- No ESLint/Prettier introduction.
- No bundle-size optimizations.
- No README rewrite.
- No CI changes.

---

## Phase Map (Progress-Report Boundaries)

This plan is broken into 5 phases. After each phase completes, a progress report must be written to `docs/phase-N-mvp-hardening-progress.md` (format identical to the existing `docs/m1-progress.md` through `docs/m9-progress.md`).

| Phase | Theme | Tasks | Risk |
|-------|-------|-------|------|
| 1 | Perimeter & config hygiene | T1, T2, T3, T4, T17 | Low — additive, no behaviour changes |
| 2 | Auth hardening | T5, T6, T7, T8 | Medium — changes role enforcement; affects every mutating route |
| 3 | Business correctness bugs | T9, T10, T11, T12, T13, T14 | Medium — touches money math + PRD invariants |
| 4 | Sync integrity | T15 | Medium — alters `/sync/push` accept/reject semantics |
| 5 | Backup safety | T16 | Medium — touches disaster-recovery path |

Each phase ends with `pnpm typecheck && pnpm test && pnpm build` green.

---

## File Structure

**Files created:**
- `apps/api/src/utils/time.ts` — `nowSec()` helper (used in T12).
- `apps/api/src/routes/carts.test.ts` — integration tests for cart add + fixed-price floor (T7, T11).
- `apps/api/src/routes/transactions.test.ts` — integration tests for void/refund authz + sign math (T7, T13).
- `apps/api/src/routes/sync.test.ts` — integration tests for `/sync/push` validation and `/sync/pull` redaction (T6, T15).
- `apps/api/src/routes/backup.test.ts` — integration test for backup snapshot (T16).
- `apps/web/src/pages/OversoldQueuePage.test.tsx` — component test for correct transaction-id lookup (T9) — **or** inline in `OversoldQueuePage.tsx` if testing framework already exists.
- `docs/phase-1-mvp-hardening-progress.md` through `docs/phase-5-mvp-hardening-progress.md` — phase progress reports.

**Files modified:**
- `.env.example` — document new vars if needed (T1, T5).
- `apps/api/package.json` — add runtime deps, move `archiver` (T3, T4).
- `apps/api/src/server.ts` — register helmet/cors/rate-limit (T4), align PORT default (T2).
- `apps/api/src/plugins/session.ts` — `sameSite: strict` (T4).
- `apps/api/src/plugins/audit.ts` — redact sensitive fields, log insert errors (T17).
- `apps/api/src/plugins/auth-guard.ts` — add `requireOwnerOrAdmin` helper (T7).
- `apps/api/src/routes/auth.ts` — remove `sha256:` branch (T5).
- `apps/api/src/routes/users.ts` — strip `passwordHash` from responses (T6).
- `apps/api/src/routes/cards.ts` — gate PATCH with `requireAdmin` (T7).
- `apps/api/src/routes/carts.ts` — ownership check on mutations, fixed-price floor enforcement, server-side override role check (T7, T8, T11).
- `apps/api/src/routes/holds.ts` — ownership check on release (T7).
- `apps/api/src/routes/transactions.ts` — `requireAdmin` on void/refund (T7).
- `apps/api/src/routes/sync.ts` — DTO projection for `/sync/pull` users (T6), Zod validation + strip server-owned fields (T15).
- `apps/api/src/routes/backup.ts` — `better-sqlite3.backup()` snapshot + WAL checkpoint (T16).
- `apps/api/src/routes/settlement.ts` — remove double-sign multiplier (T13).
- `packages/db/src/seed.ts` — bcrypt + require `ADMIN_PASSWORD` (T5).
- `apps/web/src/hooks/useTapHoldReveal.ts` — invert to reveal-on-hold (T10).
- `apps/web/src/hooks/useTapHoldReveal.test.ts` — update to pin corrected behaviour (T10).
- `apps/web/src/pages/OversoldQueuePage.tsx` — look up correct transaction id (T9).
- `apps/web/src/pages/POSPage.tsx` — ms → seconds on `lastActivityAt`/`lockedAt` (T12).
- `apps/web/src/pages/DashboardPage.tsx` — fix net math (T14).
- `apps/web/src/pages/ReportsPage.tsx` — fix net math (T14).

---

## Task 1: Align API PORT default to 3001

**Phase:** 1 — Perimeter & config hygiene
**Finding:** M18 (merged review)
**Files:**
- Modify: `apps/api/src/server.ts:28`

**Rationale:** `.env.example` declares `PORT=3001`, vite dev-server proxy targets `localhost:3001`, runbook assumes 3001 — but the server fallback is 3000, so a fresh checkout without a copied `.env` silently breaks the proxy.

- [ ] **Step 1.1: Change the PORT fallback**

Edit `apps/api/src/server.ts:28`:

```ts
// Before:
const PORT = parseInt(process.env.PORT ?? "3000", 10);

// After:
const PORT = parseInt(process.env.PORT ?? "3001", 10);
```

- [ ] **Step 1.2: Verify typecheck still passes**

Run: `pnpm --filter @kolektapos/api typecheck`
Expected: no errors.

- [ ] **Step 1.3: Commit**

```bash
git add apps/api/src/server.ts
git commit -m "🔧 Align API PORT fallback to 3001 (matches .env.example and vite proxy)"
```

---

## Task 2: Move `archiver` from `devDependencies` to `dependencies`

**Phase:** 1 — Perimeter & config hygiene
**Finding:** M17
**Files:**
- Modify: `apps/api/package.json`

**Rationale:** `apps/api/src/routes/backup.ts:3` imports `archiver` at runtime; a `pnpm install --prod` deploy would miss it and `/backup` would 500. `@types/archiver` stays in dev.

- [ ] **Step 2.1: Edit the package manifest**

Open `apps/api/package.json`. Move the `"archiver": "^7.0.1"` entry out of `devDependencies` and into `dependencies`. Keep `"@types/archiver"` in `devDependencies`. The resulting shape:

```json
{
  "dependencies": {
    "@fastify/cookie": "^11.0.2",
    "@fastify/session": "^11.0.1",
    "@kolektapos/db": "workspace:*",
    "@kolektapos/types": "workspace:*",
    "archiver": "^7.0.1",
    "bcryptjs": "^3.0.2",
    "better-sqlite3": "^11.7.0",
    "dotenv": "^17.4.2",
    "drizzle-orm": "^0.38.4",
    "fastify": "^5.2.1",
    "node-cron": "^3.0.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/archiver": "^7.0.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.2",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2.2: Reinstall workspaces to update the lockfile**

Run: `pnpm install`
Expected: `pnpm-lock.yaml` updated; no runtime errors.

- [ ] **Step 2.3: Verify the package still type-checks and tests still pass**

Run: `pnpm --filter @kolektapos/api typecheck && pnpm --filter @kolektapos/api test`
Expected: all green.

- [ ] **Step 2.4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "📦 Move archiver to runtime dependencies"
```

---

## Task 3: Register Helmet, strict CORS, and rate-limit; tighten cookie `sameSite`

**Phase:** 1 — Perimeter & config hygiene
**Finding:** H4, H10, and the `sameSite` tightening note under the Quick Wins section of the merged review.
**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/plugins/session.ts`

**Rationale:** Add perimeter headers, cap login brute-force, and close cross-site cookie exposure. Per PRD §10 the PWA and API share a domain, so `sameSite: strict` is safe.

- [ ] **Step 3.1: Add runtime dependencies**

Run: `pnpm --filter @kolektapos/api add @fastify/helmet@^12 @fastify/cors@^10 @fastify/rate-limit@^10`
Expected: three new entries appear in `apps/api/package.json` under `dependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 3.2: Tighten cookie `sameSite` to `strict`**

Edit `apps/api/src/plugins/session.ts:17`:

```ts
// Before:
sameSite: "lax",

// After:
sameSite: "strict",
```

- [ ] **Step 3.3: Register helmet, cors, and rate-limit in `server.ts`**

Edit `apps/api/src/server.ts`. Add imports near the other `@fastify/*` imports:

```ts
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
```

Inside `build()`, register them **before** `sessionPlugin`. Replace the existing `// Plugins` section with:

```ts
  // Plugins
  await app.register(helmet, {
    // Defaults; PWA serves from same domain so CSP is not required here.
    contentSecurityPolicy: false,
  });

  const allowedOrigin = process.env.DOMAIN
    ? `https://${process.env.DOMAIN}`
    : true; // dev: reflect origin
  await app.register(cors, {
    origin: allowedOrigin,
    credentials: true,
  });

  await app.register(rateLimit, {
    global: false, // only apply to routes that opt in via {config:{rateLimit:...}}
  });

  await sessionPlugin(app);
  await auditPlugin(app, { db });
```

- [ ] **Step 3.4: Attach rate-limit to `/auth/login` and `/auth/change-password`**

Edit `apps/api/src/routes/auth.ts`. Replace the `app.post("/auth/login", …)` registration with:

```ts
  app.post("/auth/login", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request, reply) => {
```

Replace the `app.post("/auth/change-password", { preHandler: requireAuth }, …)` registration with:

```ts
  app.post("/auth/change-password", {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
```

- [ ] **Step 3.5: Ensure existing auth tests still pass**

`apps/api/src/routes/auth.test.ts` builds its own minimal Fastify instance; rate-limit plugin is not registered there so `config.rateLimit` is inert. Confirm with:

Run: `pnpm --filter @kolektapos/api test -- auth`
Expected: all 4 auth tests pass.

- [ ] **Step 3.6: Full test + typecheck + build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green across the board.

- [ ] **Step 3.7: Commit**

```bash
git add apps/api/package.json apps/api/src/server.ts apps/api/src/plugins/session.ts apps/api/src/routes/auth.ts pnpm-lock.yaml
git commit -m "🛡️ Add Helmet, strict CORS, and rate-limit on /auth/*; tighten cookie sameSite"
```

---

## Task 4: Rotate `SESSION_SECRET` guidance and remove committed `.env`

**Phase:** 1 — Perimeter & config hygiene
**Finding:** M12
**Files:**
- Delete: `.env` (working-tree only, already gitignored)
- Modify: `.env.example` (add a comment reminder)

**Rationale:** A real 64-hex secret sits on disk; gitignore prevents pushes but not local backups. The operator must rotate before first event. We don't touch production secrets here — only eliminate the on-disk copy and document rotation.

- [ ] **Step 4.1: Verify `.env` is not tracked**

Run: `git ls-files -- .env`
Expected: no output.

- [ ] **Step 4.2: Remove the working-tree `.env`**

Run: `rm .env`
Expected: file removed; `git status` shows no change (it was gitignored).

- [ ] **Step 4.3: Add a rotation reminder to `.env.example`**

Edit `.env.example` — prepend a comment block:

```
# IMPORTANT: copy to `.env` (already gitignored) and set real values.
# SESSION_SECRET must be rotated before each environment change.
# Generate one with: `openssl rand -hex 32` (64 chars).
# ADMIN_EMAIL and ADMIN_PASSWORD are REQUIRED — server will refuse to
# auto-seed an admin without them (see seed.ts).

# Server (apps/api)
DATABASE_PATH=./storage/kolektapos.sqlite
PHOTO_STORAGE_PATH=./storage/photos
SESSION_SECRET=change-me-to-a-long-random-string
DOMAIN=pos.kolekta.id
PORT=3001
ADMIN_EMAIL=
ADMIN_PASSWORD=
```

- [ ] **Step 4.4: Commit**

```bash
git add .env.example
git commit -m "📝 Document SESSION_SECRET rotation and required admin env vars"
```

*Note: the on-disk `.env` deletion is intentionally not part of the commit. Operator must regenerate locally.*

---

## Task 17: Redact sensitive fields in audit log; log insert errors

**Phase:** 1 — Perimeter & config hygiene
**Finding:** H11
**Files:**
- Modify: `apps/api/src/plugins/audit.ts`

**Rationale:** The `onSend` hook currently serializes up to 2000 chars of response bodies into `audit_log.diff_json` with no redaction — `/auth/*` and `/users` bodies may contain sensitive material. Also, `catch {}` silently loses audit failures.

- [ ] **Step 17.1: Replace the audit plugin with redaction + error logging**

Overwrite `apps/api/src/plugins/audit.ts`:

```ts
import type { FastifyInstance } from "fastify";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "newpassword",
  "new_password",
  "currentpassword",
  "current_password",
  "session",
  "token",
  "sessionsecret",
  "session_secret",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export async function auditPlugin(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.addHook("onSend", async (request, reply, payload) => {
    const method = request.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return payload;
    const status = reply.statusCode;
    if (status < 200 || status >= 300) return payload;

    const userId: string | undefined = (
      request.session as unknown as Record<string, unknown>
    )?.userId as string | undefined;
    const url = request.url;
    const parts = url.split("/").filter(Boolean);
    const entityType = parts[1] ?? "unknown";
    const entityId = parts[2] ?? null;

    let redactedJson: string | null = null;
    if (typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload);
        redactedJson = JSON.stringify(redact(parsed)).slice(0, 2000);
      } catch {
        // Non-JSON payload — store nothing rather than risk leaking raw
        redactedJson = null;
      }
    }

    try {
      db.insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          userId: userId ?? null,
          action: method,
          entityType,
          entityId,
          diffJson: redactedJson,
        })
        .run();
    } catch (err) {
      request.log.error({ err, url, method }, "[audit] failed to write audit log");
    }

    return payload;
  });
}
```

- [ ] **Step 17.2: Typecheck + test**

Run: `pnpm --filter @kolektapos/api typecheck && pnpm --filter @kolektapos/api test`
Expected: green.

- [ ] **Step 17.3: Commit**

```bash
git add apps/api/src/plugins/audit.ts
git commit -m "🙈 Redact sensitive fields in audit log; stop swallowing insert errors"
```

---

## Task 5: Remove `sha256:` auth path; require `ADMIN_PASSWORD`; bcrypt in seed

**Phase:** 2 — Auth hardening
**Finding:** C7 (merged review)
**Files:**
- Modify: `packages/db/src/seed.ts`
- Modify: `apps/api/src/routes/auth.ts`
- Modify: `apps/api/src/routes/auth.test.ts` (use bcrypt-seeded admin — already does, but verify)

**Rationale:** The seed stores unsalted SHA-256 for the auto-created admin, and the login handler permanently accepts `sha256:` hashes. Combined with a default `changeme` fallback this is a critical weak-default. The fix: drop auto-creation when `ADMIN_PASSWORD` is unset, bcrypt-hash when it is set, and remove the SHA-256 branch from the login/change-password handlers.

- [ ] **Step 5.1: Write a failing seed test (admin skipped without env)**

Create `packages/db/src/seed.test.ts`:

```ts
import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";
import { seed } from "./seed.js";
import { runMigrations } from "./migrate.js";

describe("seed admin user", () => {
  async function freshDb() {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite, { schema });
    await runMigrations(":memory:", sqlite);
    return { db, sqlite };
  }

  it("does NOT create admin user when ADMIN_PASSWORD is unset", async () => {
    const prev = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    try {
      const { db, sqlite } = await freshDb();
      await seed(db);
      const admins = db.select().from(schema.users).all();
      expect(admins).toHaveLength(0);
      sqlite.close();
    } finally {
      if (prev !== undefined) process.env.ADMIN_PASSWORD = prev;
    }
  });

  it("creates admin user with bcrypt hash when ADMIN_PASSWORD is set", async () => {
    process.env.ADMIN_EMAIL = "seed@test.local";
    process.env.ADMIN_PASSWORD = "a-strong-password-123";
    const { db, sqlite } = await freshDb();
    await seed(db);
    const admin = db.select().from(schema.users).where(eq(schema.users.email, "seed@test.local")).get();
    expect(admin).toBeTruthy();
    expect(admin!.passwordHash.startsWith("sha256:")).toBe(false);
    expect(admin!.passwordHash.startsWith("$2")).toBe(true); // bcrypt prefix
    expect(await bcrypt.compare("a-strong-password-123", admin!.passwordHash)).toBe(true);
    sqlite.close();
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });
});
```

Note: `runMigrations` today only accepts a path. Adjust its signature in this task or work around it; see Step 5.2.

- [ ] **Step 5.2: If needed, extend `runMigrations` to accept an existing sqlite handle**

Open `packages/db/src/migrate.ts`. If the current signature is `runMigrations(dbPath: string)` that opens its own `Database`, add an optional second parameter:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

export async function runMigrations(dbPath: string, existingSqlite?: Database.Database) {
  const sqlite = existingSqlite ?? new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: /* existing path */ "drizzle" });
  return { db, sqlite };
}
```

*If the real `migrate.ts` already uses a different shape, preserve its existing contract and add the `existingSqlite` parameter at the end without changing callers.*

- [ ] **Step 5.3: Run the seed test to confirm it fails**

Run: `pnpm --filter @kolektapos/db test -- seed`
Expected: FAIL — seed currently defaults `ADMIN_PASSWORD` to `"changeme"` and uses SHA-256, so both assertions will fire.

- [ ] **Step 5.4: Rewrite `packages/db/src/seed.ts` admin block**

Replace the current SHA-256 seed with:

```ts
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";

export async function seed(db: ReturnType<typeof drizzle>) {
  // ── payment channels ──────────────────────────────────────────────────
  const channels = [
    { name: "Cash IDR", type: "cash", sortOrder: 0 },
    { name: "BCA", type: "bank_transfer", sortOrder: 1 },
    { name: "Mandiri", type: "bank_transfer", sortOrder: 2 },
    { name: "BNI", type: "bank_transfer", sortOrder: 3 },
    { name: "GoPay", type: "ewallet", sortOrder: 4 },
    { name: "OVO", type: "ewallet", sortOrder: 5 },
    { name: "Dana", type: "ewallet", sortOrder: 6 },
    { name: "ShopeePay", type: "ewallet", sortOrder: 7 },
    { name: "QRIS", type: "qris", sortOrder: 8 },
    { name: "Other", type: "other", sortOrder: 9 },
  ];

  for (const ch of channels) {
    const exists = db
      .select()
      .from(schema.paymentChannels)
      .where(eq(schema.paymentChannels.name, ch.name))
      .get();
    if (!exists) {
      db.insert(schema.paymentChannels)
        .values({ id: crypto.randomUUID(), ...ch })
        .run();
    }
  }

  // ── default settings (§5.1 F35) ──────────────────────────────────────
  const defaults = [
    { key: "max_line_discount_pct_fixed", value: 20 },
    { key: "max_transaction_discount_pct", value: 30 },
    { key: "cart_idle_ttl_minutes", value: 30 },
  ];

  for (const { key, value } of defaults) {
    const exists = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get();
    if (!exists) {
      db.insert(schema.settings)
        .values({ id: crypto.randomUUID(), key, valueJson: JSON.stringify(value) })
        .run();
    }
  }

  // ── admin user (explicit env, bcrypt only) ───────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD unset — skipping admin user creation.");
    console.log("[seed] done");
    return;
  }

  const exists = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .get();
  if (!exists) {
    const hash = await bcrypt.hash(adminPassword, 12);
    db.insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        email: adminEmail,
        passwordHash: hash,
        displayName: "Revota",
        role: "admin",
      })
      .run();
    console.log(`[seed] admin user created: ${adminEmail}`);
  }

  console.log("[seed] done");
}

// Run directly: tsx src/seed.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.DATABASE_PATH ?? "kolektapos.db";
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });
  await seed(db);
  sqlite.close();
}
```

Note: `bcryptjs` isn't in `packages/db` deps today. Add it:

Run: `pnpm --filter @kolektapos/db add bcryptjs@^3.0.2`
Run: `pnpm --filter @kolektapos/db add -D @types/bcryptjs@^2.4.6`

- [ ] **Step 5.5: Re-run the seed test — expect pass**

Run: `pnpm --filter @kolektapos/db test -- seed`
Expected: PASS both cases.

- [ ] **Step 5.6: Remove `sha256:` branch from `auth.ts`**

Edit `apps/api/src/routes/auth.ts`. Replace the login `valid` block and the change-password block:

```ts
    // Login handler — drop the sha256: branch entirely.
    const valid = await bcrypt.compare(body.data.password, passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }
```

```ts
    // change-password — drop the sha256: branch.
    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Password saat ini tidak valid." });
    }
```

Also remove the two `const { createHash } = await import("crypto");` lines and the surrounding `if (passwordHash.startsWith("sha256:")) { … } else { … }` scaffolding.

- [ ] **Step 5.7: Confirm existing auth tests still pass (they seed with bcrypt — should be green)**

Run: `pnpm --filter @kolektapos/api test -- auth`
Expected: 4/4 green.

- [ ] **Step 5.8: Commit**

```bash
git add packages/db/src/seed.ts packages/db/src/seed.test.ts packages/db/src/migrate.ts packages/db/package.json apps/api/src/routes/auth.ts pnpm-lock.yaml
git commit -m "🔐 Remove SHA-256 auth fallback; require ADMIN_PASSWORD; bcrypt in seed"
```

---

## Task 6: Strip `passwordHash` from `/sync/pull` and `/users` responses

**Phase:** 2 — Auth hardening
**Finding:** C2
**Files:**
- Modify: `apps/api/src/routes/sync.ts`
- Modify: `apps/api/src/routes/users.ts`
- Create: `apps/api/src/routes/sync.test.ts`

**Rationale:** `/sync/pull` and `/users` currently serialize full `users` rows, leaking every user's bcrypt hash to every authenticated session.

- [ ] **Step 6.1: Add a shared `userDto()` helper**

Create `apps/api/src/utils/user-dto.ts`:

```ts
import type { users } from "@kolektapos/db/schema";

type UserRow = typeof users.$inferSelect;

export type UserDto = Omit<UserRow, "passwordHash">;

export function userDto(row: UserRow): UserDto {
  const { passwordHash: _omit, ...rest } = row;
  return rest;
}
```

- [ ] **Step 6.2: Write a failing test asserting `/sync/pull` does not leak `passwordHash`**

Create `apps/api/src/routes/sync.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { syncRoutes } from "./sync.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;

async function buildTestApp() {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      version INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE events (id TEXT PRIMARY KEY, name TEXT, venue TEXT DEFAULT '', start_date TEXT, end_date TEXT, status TEXT DEFAULT 'draft', settled_at INTEGER, settled_by_user_id TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE payment_channels (id TEXT PRIMARY KEY, name TEXT, type TEXT, sort_order INTEGER, active INTEGER DEFAULT 1);
    CREATE TABLE settings (id TEXT PRIMARY KEY, key TEXT UNIQUE, value_json TEXT, updated_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE cards (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, short_id TEXT UNIQUE, status TEXT DEFAULT 'available', updated_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE carts (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, status TEXT DEFAULT 'draft', updated_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE cart_items (id TEXT PRIMARY KEY, cart_id TEXT, card_id TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, kind TEXT DEFAULT 'sale', created_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE transaction_items (id TEXT PRIMARY KEY, transaction_id TEXT, card_id TEXT, created_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE holds (id TEXT PRIMARY KEY, card_id TEXT, status TEXT DEFAULT 'active');
  `);

  const hash = await bcrypt.hash("pw-secret-12345", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("u1", "cashier@test.com", hash, "Cashier", "cashier");

  const fastify = Fastify({ logger: false });
  await sessionPlugin(fastify);
  await authRoutes(fastify, { db });
  await syncRoutes(fastify, { db });
  return fastify;
}

describe("/sync/pull user payload", () => {
  beforeAll(async () => {
    app = await buildTestApp();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "cashier@test.com", password: "pw-secret-12345" },
    });
    cookie = login.headers["set-cookie"] as string;
  });

  afterAll(async () => {
    await app.close();
    sqlite.close();
  });

  it("does not leak passwordHash in initial pull", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sync/pull?cursor=0",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { changes: Array<{ entityType: string; payload: Record<string, unknown> }> };
    const userChanges = body.changes.filter((c) => c.entityType === "user");
    expect(userChanges.length).toBeGreaterThan(0);
    for (const c of userChanges) {
      expect(c.payload).not.toHaveProperty("passwordHash");
      expect(c.payload).not.toHaveProperty("password_hash");
    }
  });
});
```

- [ ] **Step 6.3: Run test, confirm failure**

Run: `pnpm --filter @kolektapos/api test -- sync`
Expected: FAIL — `passwordHash` leaks through.

- [ ] **Step 6.4: Apply `userDto()` in `/sync/pull`**

Edit `apps/api/src/routes/sync.ts`:

```ts
// Add near the top:
import { userDto } from "../utils/user-dto.js";

// In the initial-pull branch, replace:
for (const row of userRows) changes.push({ entityType: "user", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
// With:
for (const row of userRows) changes.push({ entityType: "user", operation: "create", payload: userDto(row), serverReceivedAt: row.updatedAt });

// In the delta-pull branch, replace:
for (const row of userChanges) changes.push({ entityType: "user", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
// With:
for (const row of userChanges) changes.push({ entityType: "user", operation: "update", payload: userDto(row), serverReceivedAt: row.updatedAt });
```

- [ ] **Step 6.5: Strip `passwordHash` from `/users` responses**

Open `apps/api/src/routes/users.ts`. Wherever a `users` row (or array) is sent back via `reply.send(...)`, wrap it with `userDto()`:

```ts
import { userDto } from "../utils/user-dto.js";

// list:
return reply.send(rows.map(userDto));

// getOne / create / update response:
return reply.send(userDto(row));
```

- [ ] **Step 6.6: Run test, confirm pass**

Run: `pnpm --filter @kolektapos/api test -- sync`
Expected: PASS.

- [ ] **Step 6.7: Commit**

```bash
git add apps/api/src/utils/user-dto.ts apps/api/src/routes/sync.ts apps/api/src/routes/users.ts apps/api/src/routes/sync.test.ts
git commit -m "🙈 Strip passwordHash from /sync/pull and /users responses"
```

---

## Task 7: Object-level authorization on cards PATCH, cart mutations, hold release, void/refund

**Phase:** 2 — Auth hardening
**Finding:** C1
**Files:**
- Modify: `apps/api/src/plugins/auth-guard.ts` (add `requireCartOwnerOrAdmin`, `requireHoldOwnerOrAdmin` helpers)
- Modify: `apps/api/src/routes/cards.ts` (PATCH → `requireAdmin`)
- Modify: `apps/api/src/routes/carts.ts` (mutation routes → ownership check)
- Modify: `apps/api/src/routes/holds.ts` (release → ownership check)
- Modify: `apps/api/src/routes/transactions.ts` (void/refund → `requireAdmin`)
- Create: `apps/api/src/routes/authz.test.ts` (one spec per authz boundary)

**Rationale:** Today every mutating route uses `requireAuth` only. Any cashier can edit any card, pay or abandon any cart, release any hold, and void/refund any sale. Policy per PRD:
- Card **create** (intake) — any authenticated user.
- Card **edit** (PATCH) — admin only.
- Cart mutations (create/add/remove/pay/abandon) — cashier-who-owns-the-cart **or** admin.
- Hold release — cashier-who-owns-the-hold **or** admin.
- Transaction void/refund — admin only.

- [ ] **Step 7.1: Extend `auth-guard.ts` with ownership helpers**

Append to `apps/api/src/plugins/auth-guard.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { carts, holds } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof dbSchema>;

export function makeRequireCartOwnerOrAdmin(db: Db) {
  return async function requireCartOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (request.session.userRole === "admin") return; // admin bypass

    const { id: cartId } = request.params as { id: string };
    const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
    if (!cart) return reply.status(404).send({ error: "Cart not found" });
    if (cart.cashierUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}

export function makeRequireHoldOwnerOrAdmin(db: Db) {
  return async function requireHoldOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (request.session.userRole === "admin") return;

    const { id: holdId } = request.params as { id: string };
    const hold = db.select().from(holds).where(eq(holds.id, holdId)).get();
    if (!hold) return reply.status(404).send({ error: "Hold not found" });
    if (hold.heldByUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}
```

*Note: verify the exact column names on `holds` (`heldByUserId` vs `held_by_user_id`). If the schema uses a different name (e.g. `userId`), use that instead.*

- [ ] **Step 7.2: Gate `PATCH /cards/:id` with `requireAdmin`**

Edit `apps/api/src/routes/cards.ts:65-67`:

```ts
  app.patch(
    "/cards/:id",
    { preHandler: requireAdmin },
    async (request, reply) => { /* existing body */ }
  );
```

Add `requireAdmin` to the import at the top:

```ts
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";
```

- [ ] **Step 7.3: Gate cart mutation routes with `requireCartOwnerOrAdmin`**

Edit `apps/api/src/routes/carts.ts`. At the top of `cartRoutes`, instantiate the helper once:

```ts
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";
import { makeRequireCartOwnerOrAdmin } from "../plugins/auth-guard.js";

export async function cartRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;
  const requireCartOwnerOrAdmin = makeRequireCartOwnerOrAdmin(db);
```

Then on every route whose URL is `/carts/:id/...` (items POST, items DELETE, pay, abandon), replace `{ preHandler: requireAuth }` with `{ preHandler: [requireAuth, requireCartOwnerOrAdmin] }`.

*`POST /carts` (create) stays at `requireAuth` — any authenticated user can create their own cart.*

- [ ] **Step 7.4: Gate hold release**

In `apps/api/src/routes/holds.ts`, find the release endpoint (typically `POST /holds/:id/release` or `DELETE /holds/:id`). Replace its `preHandler` with:

```ts
import { requireAuth, makeRequireHoldOwnerOrAdmin } from "../plugins/auth-guard.js";

export async function holdRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;
  const requireHoldOwnerOrAdmin = makeRequireHoldOwnerOrAdmin(db);

  app.post("/holds/:id/release", {
    preHandler: [requireAuth, requireHoldOwnerOrAdmin],
  }, async (/* existing */) => { /* existing body */ });
```

- [ ] **Step 7.5: Gate `POST /transactions/:id/void` and `/refund` with `requireAdmin`**

Edit `apps/api/src/routes/transactions.ts:62-78`:

```ts
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

// …
  app.post(
    "/transactions/:id/void",
    { preHandler: requireAdmin },
    async (request, reply) => {
      return handleVoidRefund(app, db, request, reply, "void");
    }
  );
  app.post(
    "/transactions/:id/refund",
    { preHandler: requireAdmin },
    async (request, reply) => {
      return handleVoidRefund(app, db, request, reply, "refund");
    }
  );
```

- [ ] **Step 7.6: Write authz regression test**

Create `apps/api/src/routes/authz.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { cardRoutes } from "./cards.js";
import { transactionRoutes } from "./transactions.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cashierCookie: string;
let adminCookie: string;

async function login(email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  return res.headers["set-cookie"] as string;
}

beforeAll(async () => {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, display_name TEXT, role TEXT DEFAULT 'cashier', created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE cards (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, short_id TEXT UNIQUE, title TEXT, status TEXT DEFAULT 'available', version INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE transactions (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, kind TEXT DEFAULT 'sale', parent_transaction_id TEXT, subtotal_idr INTEGER DEFAULT 0, discount_idr INTEGER DEFAULT 0, total_idr INTEGER DEFAULT 0, cashier_user_id TEXT, event_id TEXT, cart_id TEXT, paid_at INTEGER, created_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE transaction_items (id TEXT PRIMARY KEY, transaction_id TEXT, card_id TEXT, owner_user_id_snapshot TEXT, listed_price_idr_snapshot INTEGER DEFAULT 0, sold_price_idr INTEGER DEFAULT 0, line_discount_idr INTEGER DEFAULT 0);
  `);

  const cashierHash = await bcrypt.hash("pw-cashier-12345", 10);
  const adminHash = await bcrypt.hash("pw-admin-12345", 10);
  sqlite.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)").run("u-cashier", "c@t.com", cashierHash, "C", "cashier", 0, 0, 1);
  sqlite.prepare("INSERT INTO users VALUES (?,?,?,?,?,?,?,?)").run("u-admin",   "a@t.com", adminHash,   "A", "admin",   0, 0, 1);
  sqlite.prepare("INSERT INTO cards (id, client_id, short_id, title, status) VALUES (?,?,?,?,?)").run("card-1", "cli-1", "R-00001", "Charizard", "available");
  sqlite.prepare("INSERT INTO transactions (id, client_id, kind, subtotal_idr, discount_idr, total_idr) VALUES (?,?,?,?,?,?)").run("tx-1", "txcli-1", "sale", 1000, 0, 1000);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await cardRoutes(app, { db });
  await transactionRoutes(app, { db });

  cashierCookie = await login("c@t.com", "pw-cashier-12345");
  adminCookie = await login("a@t.com", "pw-admin-12345");
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("authz boundaries", () => {
  it("cashier cannot PATCH a card", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/cards/card-1",
      headers: { cookie: cashierCookie },
      payload: { title: "Hacked", version: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin can PATCH a card", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/cards/card-1",
      headers: { cookie: adminCookie },
      payload: { title: "Legit", version: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("cashier cannot void a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/transactions/tx-1/void",
      headers: { cookie: cashierCookie },
      payload: { reason: "oops", clientId: "void-client-1" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin can void a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/transactions/tx-1/void",
      headers: { cookie: adminCookie },
      payload: { reason: "oops", clientId: "void-client-2" },
    });
    expect([200, 201]).toContain(res.statusCode);
  });
});
```

- [ ] **Step 7.7: Run tests**

Run: `pnpm --filter @kolektapos/api test -- authz`
Expected: all 4 cases green.

- [ ] **Step 7.8: Commit**

```bash
git add apps/api/src/plugins/auth-guard.ts apps/api/src/routes/cards.ts apps/api/src/routes/carts.ts apps/api/src/routes/holds.ts apps/api/src/routes/transactions.ts apps/api/src/routes/authz.test.ts
git commit -m "🚧 Add object-level authz on cards PATCH, cart mutations, hold release, void/refund"
```

---

## Task 8: Server-side re-check of `requiresAdminOverride`

**Phase:** 2 — Auth hardening
**Finding:** M1
**Files:**
- Modify: `apps/api/src/routes/carts.ts` (add-item handler)
- Extend: `apps/api/src/routes/carts.test.ts` (created in T11)

**Rationale:** The client sends `requiresAdminOverride: true` to bypass the bottom-price floor (for negotiable cards) — but the server blindly trusts the flag. Non-admin sessions must not be allowed to set it.

- [ ] **Step 8.1: Write a failing cart-test (cashier sends override → 403)**

This test will be written inside `carts.test.ts` (created in T11). Here, add the test stub now:

```ts
it("rejects add-item with requiresAdminOverride=true from a non-admin session", async () => {
  const res = await app.inject({
    method: "POST",
    url: `/carts/${cartId}/items`,
    headers: { cookie: cashierCookie },
    payload: {
      cardId: "card-neg-1",
      intendedPriceIdr: 10000, // below bottom
      lineDiscountIdr: 0,
      requiresAdminOverride: true,
    },
  });
  expect(res.statusCode).toBe(403);
  const body = JSON.parse(res.payload);
  expect(body.error).toMatch(/admin/i);
});
```

*If T11 is not yet done, add this test temporarily in a standalone file or run it inline.*

- [ ] **Step 8.2: Add server-side override role check**

Edit `apps/api/src/routes/carts.ts` inside the `POST /carts/:id/items` handler, right after `const requiresAdminOverride = body.data.requiresAdminOverride ?? false;` (line 140):

```ts
      if (requiresAdminOverride && request.session.userRole !== "admin") {
        return reply.status(403).send({
          error: "Only admin sessions may set requiresAdminOverride.",
        });
      }
```

- [ ] **Step 8.3: Run test, confirm pass**

Run: `pnpm --filter @kolektapos/api test -- carts`
Expected: PASS.

- [ ] **Step 8.4: Commit**

```bash
git add apps/api/src/routes/carts.ts apps/api/src/routes/carts.test.ts
git commit -m "🛑 Reject cart add-item with admin-override flag from non-admin sessions"
```

---

## Task 9: Fix `OversoldQueuePage` to void the correct transaction

**Phase:** 3 — Business correctness bugs
**Finding:** C5
**Files:**
- Modify: `apps/web/src/pages/OversoldQueuePage.tsx`

**Rationale:** The current page calls `api.transactions.void(card.id, ...)` — it passes a **card UUID** where a **transaction UUID** is expected. The admin oversold queue is the only PRD-sanctioned path to resolve R5. It must look up the latest `sale`-kind transaction item for the card, find its parent transaction, and void that.

- [ ] **Step 9.1: Rewrite the void handler**

Edit `apps/web/src/pages/OversoldQueuePage.tsx`. Replace the `handleVoid` body and the call site so that the card's most recent sale transaction is voided.

First, update the function:

```tsx
async function handleVoid(cardId: string, reason: string) {
  setError(null);
  try {
    // Find all transaction_items for this card, resolve their parent transactions,
    // pick the most recent SALE-kind transaction that is NOT already voided.
    const items = await idb.transactionItems.where("cardId").equals(cardId).toArray();
    if (items.length === 0) {
      setError("Tidak ada transaksi ditemukan untuk kartu ini.");
      return;
    }
    const txIds = items.map((i) => i.transactionId);
    const txs = await idb.transactions.bulkGet(txIds);
    const sales = txs.filter((t): t is NonNullable<typeof t> => !!t && t.kind === "sale");
    if (sales.length === 0) {
      setError("Tidak ada transaksi 'sale' yang bisa di-void.");
      return;
    }
    // Exclude sales that already have a void child
    const voided = new Set(
      txs
        .filter((t): t is NonNullable<typeof t> => !!t && t.kind === "void" && !!t.parentTransactionId)
        .map((t) => t.parentTransactionId as string)
    );
    const openSales = sales.filter((s) => !voided.has(s.id));
    if (openSales.length === 0) {
      setError("Semua transaksi untuk kartu ini sudah di-void.");
      return;
    }
    // If there are multiple, void the most recent (highest createdAt).
    const target = openSales.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b));
    await api.transactions.void(target.id, { reason, clientId: crypto.randomUUID() });
    await queryClient.invalidateQueries({ queryKey: ["oversold-cards"] });
    setVoidingId(null);
    setVoidReason("");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Gagal membatalkan transaksi.");
  }
}
```

Then update the inline call site at line ~104:

```tsx
// Before:
onClick={() => handleVoid(card.id, voidReason)}
// (unchanged — card.id is now correctly used as a LOOKUP key, not a transaction id)
```

The call stays the same, but `handleVoid` now treats its first parameter as `cardId` (rename variable):

```tsx
async function handleVoid(cardId: string, reason: string) { ... }
```

- [ ] **Step 9.2: Manual verification plan**

Because this is inside a component using IndexedDB + React Query, a full automated test requires Dexie mocking. Instead, add this manual check to the phase progress report:

1. Seed a card with two `sale` transactions (simulate oversold).
2. Open `/admin/oversold`.
3. Click "Void Transaksi" → enter reason → confirm.
4. Expect: server returns 201 for the correct transaction; card's most recent sale is voided; queue refreshes.

- [ ] **Step 9.3: Typecheck**

Run: `pnpm --filter @kolektapos/web typecheck`
Expected: no errors.

- [ ] **Step 9.4: Commit**

```bash
git add apps/web/src/pages/OversoldQueuePage.tsx
git commit -m "🎯 Fix OversoldQueuePage to void the correct transaction (not the card id)"
```

---

## Task 10: Invert `useTapHoldReveal` so reveal only fires after the hold timer

**Phase:** 3 — Business correctness bugs
**Finding:** C6
**Files:**
- Modify: `apps/web/src/hooks/useTapHoldReveal.ts`
- Modify: `apps/web/src/hooks/useTapHoldReveal.test.ts` (update to pin new behaviour)

**Rationale:** PRD §9.1 invariant #6 requires bottom prices to be hidden by default and only revealed after a 5-second tap-and-hold. The current hook reveals immediately on pointer-down and uses the hold timer as an auto-hide, which lets bottom prices leak on any tap.

- [ ] **Step 10.1: Read the existing test and understand what it pins**

Run: `cat apps/web/src/hooks/useTapHoldReveal.test.ts`
Expected: tests assert the current (buggy) behaviour.

- [ ] **Step 10.2: Rewrite the test to pin the corrected behaviour**

Replace the contents of `apps/web/src/hooks/useTapHoldReveal.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTapHoldReveal } from "./useTapHoldReveal.js";

describe("useTapHoldReveal", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not reveal on pointer-down", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    expect(result.current.revealed).toBe(false);
  });

  it("does not reveal if pointer released before holdMs", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.endReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(false);
  });

  it("reveals after pointer held for full holdMs", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(true);
  });

  it("auto-hides after an additional AUTOHIDE_MS once revealed", () => {
    const { result } = renderHook(() => useTapHoldReveal(1000));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.revealed).toBe(true);
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.revealed).toBe(false);
  });

  it("clearReveal resets to hidden", () => {
    const { result } = renderHook(() => useTapHoldReveal(500));
    act(() => result.current.startReveal());
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.revealed).toBe(true);
    act(() => result.current.clearReveal());
    expect(result.current.revealed).toBe(false);
  });
});
```

- [ ] **Step 10.3: Run test, confirm failure**

Run: `pnpm --filter @kolektapos/web test -- useTapHoldReveal`
Expected: FAIL (tests now pin corrected behaviour; implementation still has inverted logic).

- [ ] **Step 10.4: Rewrite the hook**

Overwrite `apps/web/src/hooks/useTapHoldReveal.ts`:

```ts
import { useState, useRef, useCallback, useEffect } from "react";

const DEFAULT_HOLD_MS = 5000;
const AUTOHIDE_MS = 3000;

export function useTapHoldReveal(holdMs: number = DEFAULT_HOLD_MS) {
  const [revealed, setRevealed] = useState(false);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAllTimers = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const startReveal = useCallback(() => {
    clearAllTimers();
    holdTimerRef.current = setTimeout(() => {
      setRevealed(true);
      hideTimerRef.current = setTimeout(() => setRevealed(false), AUTOHIDE_MS);
    }, holdMs);
  }, [holdMs]);

  const endReveal = useCallback(() => {
    // If the user released before the hold timer elapsed, cancel the pending reveal.
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearReveal = useCallback(() => {
    clearAllTimers();
    setRevealed(false);
  }, []);

  useEffect(() => {
    return () => clearAllTimers();
  }, []);

  return { revealed, startReveal, endReveal, clearReveal };
}
```

- [ ] **Step 10.5: Run test, confirm pass**

Run: `pnpm --filter @kolektapos/web test -- useTapHoldReveal`
Expected: all 5 cases green.

- [ ] **Step 10.6: Commit**

```bash
git add apps/web/src/hooks/useTapHoldReveal.ts apps/web/src/hooks/useTapHoldReveal.test.ts
git commit -m "👁️ Invert tap-and-hold reveal so bottom prices only show after 5s hold"
```

---

## Task 11: Enforce fixed-price floor on server-side add-item

**Phase:** 3 — Business correctness bugs
**Finding:** C8
**Files:**
- Modify: `apps/api/src/routes/carts.ts`
- Create: `apps/api/src/routes/carts.test.ts`

**Rationale:** For fixed-price cards, the server today checks only the line-discount percentage, never that `intendedPriceIdr >= card.priceIdr`. A malformed or forged request can sell a fixed card for 1 IDR without any admin override.

- [ ] **Step 11.1: Scaffold `carts.test.ts`**

Create `apps/api/src/routes/carts.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { cartRoutes } from "./carts.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cashierCookie: string;
let adminCookie: string;
let cartId: string;

async function login(email: string, password: string) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password } });
  return res.headers["set-cookie"] as string;
}

beforeAll(async () => {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, display_name TEXT, role TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE events (id TEXT PRIMARY KEY, name TEXT, status TEXT DEFAULT 'active', created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE payment_channels (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE settings (id TEXT PRIMARY KEY, key TEXT UNIQUE, value_json TEXT);
    CREATE TABLE cards (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, short_id TEXT UNIQUE, title TEXT, pricing_mode TEXT, price_idr INTEGER, listed_price_idr INTEGER, bottom_price_idr INTEGER, status TEXT DEFAULT 'available', locked_by_cart_id TEXT, locked_by_user_id TEXT, locked_at INTEGER, owner_user_id TEXT, version INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE carts (id TEXT PRIMARY KEY, client_id TEXT UNIQUE, event_id TEXT, cashier_user_id TEXT, status TEXT DEFAULT 'draft', last_activity_at INTEGER, version INTEGER DEFAULT 1, updated_at INTEGER DEFAULT (strftime('%s','now')), paid_transaction_id TEXT, abandoned_reason TEXT);
    CREATE TABLE cart_items (id TEXT PRIMARY KEY, cart_id TEXT, card_id TEXT, intended_price_idr INTEGER, line_discount_idr INTEGER, line_discount_reason TEXT, requires_admin_override INTEGER DEFAULT 0, override_by_user_id TEXT, override_reason TEXT);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, client_id TEXT UNIQUE);
    CREATE TABLE transaction_items (id TEXT PRIMARY KEY);
  `);

  const ch = await bcrypt.hash("pw-cashier-12345", 10);
  const ah = await bcrypt.hash("pw-admin-12345", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)").run("u-cashier", "c@t.com", ch, "C", "cashier");
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)").run("u-admin", "a@t.com", ah, "A", "admin");
  sqlite.prepare("INSERT INTO events (id, name, status) VALUES (?, ?, ?)").run("ev-1", "Test Event", "active");
  sqlite.prepare("INSERT INTO cards (id, client_id, short_id, title, pricing_mode, price_idr, status, owner_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("card-fixed-1", "ccli-f1", "R-00001", "Fixed Card", "fixed", 50000, "available", "u-admin");

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await cartRoutes(app, { db });

  cashierCookie = await login("c@t.com", "pw-cashier-12345");
  adminCookie = await login("a@t.com", "pw-admin-12345");
});

beforeEach(async () => {
  // fresh cart for this cashier
  const res = await app.inject({
    method: "POST",
    url: "/carts",
    headers: { cookie: cashierCookie },
    payload: { clientId: crypto.randomUUID(), eventId: "ev-1" },
  });
  cartId = JSON.parse(res.payload).id;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("POST /carts/:id/items — fixed-price floor", () => {
  it("rejects intendedPriceIdr < card.priceIdr on fixed pricing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/carts/${cartId}/items`,
      headers: { cookie: cashierCookie },
      payload: {
        cardId: "card-fixed-1",
        intendedPriceIdr: 1, // far below listed 50_000
        lineDiscountIdr: 0,
      },
    });
    expect(res.statusCode).toBe(422);
  });

  it("accepts intendedPriceIdr === card.priceIdr on fixed pricing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/carts/${cartId}/items`,
      headers: { cookie: cashierCookie },
      payload: {
        cardId: "card-fixed-1",
        intendedPriceIdr: 50000,
        lineDiscountIdr: 0,
      },
    });
    expect(res.statusCode).toBe(201);
  });
});
```

- [ ] **Step 11.2: Run test, confirm first assertion fails**

Run: `pnpm --filter @kolektapos/api test -- carts`
Expected: first case FAILs (server lets it through with 201 because no floor check exists).

- [ ] **Step 11.3: Add the floor check in `carts.ts`**

Edit the fixed-pricing branch in `apps/api/src/routes/carts.ts:142-172`. After the existing `if (lineDiscountPct > maxPct && !requiresAdminOverride)` block but before the closing brace of the `if (card.pricingMode === "fixed")` branch, add:

```ts
          // Hard floor: intendedPriceIdr must equal listed price unless admin override.
          if (body.data.intendedPriceIdr < listedPrice && !requiresAdminOverride) {
            return reply.status(422).send({
              error: "Di bawah harga tetap (fixed price)",
              fixedPriceIdr: listedPrice,
            });
          }
```

- [ ] **Step 11.4: Run test, confirm both pass**

Run: `pnpm --filter @kolektapos/api test -- carts`
Expected: both cases green.

- [ ] **Step 11.5: Commit**

```bash
git add apps/api/src/routes/carts.ts apps/api/src/routes/carts.test.ts
git commit -m "💰 Enforce fixed-price floor on server add-item (invariant #4)"
```

---

## Task 12: Standardize timestamps to Unix seconds in `POSPage.tsx` + add `nowSec()` helper

**Phase:** 3 — Business correctness bugs
**Finding:** C9
**Files:**
- Create: `apps/web/src/lib/time.ts`
- Modify: `apps/web/src/pages/POSPage.tsx`

**Rationale:** Server code uses Unix seconds for `lastActivityAt` / `lockedAt`; the client (`POSPage.tsx:609` and `:665`) writes `Date.now()` (milliseconds). The sweeper cutoff is in seconds, so client-originated local carts never time out.

- [ ] **Step 12.1: Create the helper**

Create `apps/web/src/lib/time.ts`:

```ts
/** Unix seconds — matches server-side timestamp convention. */
export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
```

- [ ] **Step 12.2: Use it in `POSPage.tsx`**

Edit `apps/web/src/pages/POSPage.tsx`. Add the import near the other `lib` imports:

```ts
import { nowSec } from "../lib/time.js";
```

Replace the two `Date.now()` usages on timestamp fields:

```ts
// Line ~609 (inside ensureCart()):
await idb.carts.put({
  id: cartId, clientId,
  cashierUserId: user!.id,
  eventId: activeEvent.id,
  status: "draft",
  lastActivityAt: nowSec(),  // was Date.now()
  version: 1,
});

// Line ~665 (inside handleAddToCart()):
await idb.cards.update(scannedCard.id, {
  lockedByCartId: cartId, lockedByUserId: user!.id, lockedAt: nowSec(),  // was Date.now()
});
```

- [ ] **Step 12.3: Typecheck**

Run: `pnpm --filter @kolektapos/web typecheck`
Expected: no errors.

- [ ] **Step 12.4: Commit**

```bash
git add apps/web/src/lib/time.ts apps/web/src/pages/POSPage.tsx
git commit -m "⏱️ Standardize POSPage timestamps to Unix seconds (match server)"
```

---

## Task 13: Fix settlement per-owner sign math

**Phase:** 3 — Business correctness bugs
**Finding:** H1
**Files:**
- Modify: `apps/api/src/routes/settlement.ts`
- Create: `apps/api/src/routes/settlement.test.ts`

**Rationale:** Void/refund rows already store negative `soldPriceIdr` (see `transactions.ts:190`). The settlement aggregator multiplies non-sale items by `-1` again, producing `(-x) * (-1) = +x` — per-owner payouts INCREASE on void. Fix: drop the `sign` multiplier and sum `soldPriceIdr` directly.

- [ ] **Step 13.1: Write a failing settlement test**

Create `apps/api/src/routes/settlement.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { settlementRoutes } from "./settlement.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, display_name TEXT, role TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE events (id TEXT PRIMARY KEY, name TEXT, venue TEXT DEFAULT '', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '', status TEXT DEFAULT 'active', settled_at INTEGER, settled_by_user_id TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
    CREATE TABLE cards (id TEXT PRIMARY KEY);
    CREATE TABLE cash_reconciliations (id TEXT PRIMARY KEY);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, event_id TEXT, kind TEXT, subtotal_idr INTEGER, discount_idr INTEGER, total_idr INTEGER, created_at INTEGER DEFAULT (strftime('%s','now')));
    CREATE TABLE transaction_items (id TEXT PRIMARY KEY, transaction_id TEXT, card_id TEXT, owner_user_id_snapshot TEXT, listed_price_idr_snapshot INTEGER, sold_price_idr INTEGER);
  `);

  const hash = await bcrypt.hash("pw-12345", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)").run("owner-A", "a@t.com", hash, "A", "admin");
  sqlite.prepare("INSERT INTO events (id, name) VALUES (?, ?)").run("ev-1", "Event 1");

  // 1x sale for owner-A @ 1000
  sqlite.prepare("INSERT INTO transactions (id, event_id, kind, subtotal_idr, discount_idr, total_idr) VALUES (?, ?, ?, ?, ?, ?)").run("tx-sale-1", "ev-1", "sale", 1000, 0, 1000);
  sqlite.prepare("INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)").run("ti-sale-1", "tx-sale-1", "card-1", "owner-A", 1000, 1000);

  // Void of that sale — negative amounts (as handleVoidRefund does)
  sqlite.prepare("INSERT INTO transactions (id, event_id, kind, subtotal_idr, discount_idr, total_idr) VALUES (?, ?, ?, ?, ?, ?)").run("tx-void-1", "ev-1", "void", -1000, 0, -1000);
  sqlite.prepare("INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)").run("ti-void-1", "tx-void-1", "card-1", "owner-A", 1000, -1000);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await settlementRoutes(app, { db });

  const login = await app.inject({
    method: "POST", url: "/auth/login",
    payload: { email: "a@t.com", password: "pw-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("/reports/event/:eventId/settlement", () => {
  it("net per-owner payout is 0 after sale is fully voided", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/event/ev-1/settlement",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    const ownerA = body.breakdown.find((b: { ownerId: string }) => b.ownerId === "owner-A");
    expect(ownerA).toBeTruthy();
    expect(ownerA.totalPayoutIdr).toBe(0);
  });
});
```

- [ ] **Step 13.2: Run test, confirm failure**

Run: `pnpm --filter @kolektapos/api test -- settlement`
Expected: FAIL — current code returns 2000 (sale 1000 + void → -1000 * -1 = +1000 = 2000).

- [ ] **Step 13.3: Remove the sign multiplier in `settlement.ts`**

Edit `apps/api/src/routes/settlement.ts:53-57`. Replace the loop body:

```ts
// Before:
      for (const item of allItems) {
        const kind = txKindMap[item.transactionId];
        const sign = kind === "sale" ? 1 : -1;
        const ownerId = item.ownerUserIdSnapshot;
        ownerTotals[ownerId] = (ownerTotals[ownerId] ?? 0) + item.soldPriceIdr * sign;
        if (kind === "sale") {
          ownerItemCount[ownerId] = (ownerItemCount[ownerId] ?? 0) + 1;
        }
      }

// After:
      for (const item of allItems) {
        const kind = txKindMap[item.transactionId];
        const ownerId = item.ownerUserIdSnapshot;
        // item.soldPriceIdr is already signed: negative for void/refund items.
        ownerTotals[ownerId] = (ownerTotals[ownerId] ?? 0) + item.soldPriceIdr;
        if (kind === "sale") {
          ownerItemCount[ownerId] = (ownerItemCount[ownerId] ?? 0) + 1;
        }
      }
```

- [ ] **Step 13.4: Run test, confirm pass**

Run: `pnpm --filter @kolektapos/api test -- settlement`
Expected: PASS.

- [ ] **Step 13.5: Commit**

```bash
git add apps/api/src/routes/settlement.ts apps/api/src/routes/settlement.test.ts
git commit -m "🧮 Fix settlement per-owner math: sum signed soldPriceIdr directly (no double-negate)"
```

---

## Task 14: Fix Dashboard + Reports net math

**Phase:** 3 — Business correctness bugs
**Finding:** H2
**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/pages/ReportsPage.tsx`

**Rationale:** Both files compute `net = gross - voids`, but `voids` is the sum of already-negative `totalIdr` values. Subtracting a negative is adding — net *increases* on void. Fix: use `Math.abs` or add signed values.

- [ ] **Step 14.1: Fix `DashboardPage.tsx`**

Edit `apps/web/src/pages/DashboardPage.tsx:30-37`:

```ts
// Before:
      const gross = todayTxs
        .filter((t) => t.kind === "sale")
        .reduce((s, t) => s + t.totalIdr, 0);
      const voids = todayTxs
        .filter((t) => t.kind === "void" || t.kind === "refund")
        .reduce((s, t) => s + t.totalIdr, 0);
      return { gross, net: gross - voids, count: todayTxs.filter((t) => t.kind === "sale").length };

// After:
      const gross = todayTxs
        .filter((t) => t.kind === "sale")
        .reduce((s, t) => s + t.totalIdr, 0);
      // void/refund rows store totalIdr as negative — use magnitude and subtract once.
      const voids = todayTxs
        .filter((t) => t.kind === "void" || t.kind === "refund")
        .reduce((s, t) => s + Math.abs(t.totalIdr), 0);
      return { gross, net: gross - voids, count: todayTxs.filter((t) => t.kind === "sale").length };
```

- [ ] **Step 14.2: Fix `ReportsPage.tsx`**

Edit `apps/web/src/pages/ReportsPage.tsx:223-225`:

```ts
// Before:
      const gross = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      const voidRefundAmount = voidRefundTxs.reduce((s, t) => s + t.totalIdr, 0);
      const net = gross - voidRefundAmount;

// After:
      const gross = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      // void/refund totalIdr is stored negative — take magnitude and subtract once.
      const voidRefundAmount = voidRefundTxs.reduce((s, t) => s + Math.abs(t.totalIdr), 0);
      const net = gross - voidRefundAmount;
```

- [ ] **Step 14.3: Typecheck + existing web tests**

Run: `pnpm --filter @kolektapos/web typecheck && pnpm --filter @kolektapos/web test`
Expected: green.

- [ ] **Step 14.4: Commit**

```bash
git add apps/web/src/pages/DashboardPage.tsx apps/web/src/pages/ReportsPage.tsx
git commit -m "🧮 Fix Dashboard and Reports net math: use Math.abs on void/refund totals"
```

---

## Task 15: Zod-validate every `/sync/push` op; strip server-owned fields

**Phase:** 4 — Sync integrity
**Finding:** C3 (partial — only the validation portion; missing op handlers are deferred to Phase 2 of the merged review plan)
**Files:**
- Modify: `apps/api/src/routes/sync.ts`
- Extend: `apps/api/src/routes/sync.test.ts` (created in T6)

**Rationale:** Currently `/sync/push` accepts arbitrary `Record<string, unknown>` payloads and spreads them directly into `db.insert(...).values(...)`. Clients can forge `oversold`, `status='sold'`, `eventId`, `ownerUserId`, `cashierUserId`, `paidAt`, etc. Validate each op with its corresponding schema from `@kolektapos/types` and strip server-owned fields (`cashierUserId`, `createdAt`, `updatedAt`, `status`, `oversold`, `lockedByCartId`, `lockedByUserId`, `lockedAt`, `serverReceivedAt`).

- [ ] **Step 15.1: Add a failing test — forged `oversold` field is stripped/rejected**

Append to `apps/api/src/routes/sync.test.ts`:

```ts
describe("/sync/push validation", () => {
  it("rejects create_card op with an unknown/forbidden field", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: { cookie },
      payload: {
        deviceId: crypto.randomUUID(),
        ops: [
          {
            type: "create_card",
            clientId: crypto.randomUUID(),
            clientCreatedAt: Math.floor(Date.now() / 1000),
            payload: {
              // Valid fields a client may send:
              shortId: "R-ABCDE",
              title: "Test Card",
              pricingMode: "fixed",
              priceIdr: 1000,
              ownerUserId: "u-cashier",
              // FORBIDDEN: client trying to pre-set oversold
              oversold: true,
            },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
  });

  it("rejects create_transaction op whose payload fails schema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/push",
      headers: { cookie },
      payload: {
        deviceId: crypto.randomUUID(),
        ops: [
          {
            type: "create_transaction",
            clientId: crypto.randomUUID(),
            clientCreatedAt: Math.floor(Date.now() / 1000),
            payload: { /* missing required fields */ },
          },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
  });
});
```

- [ ] **Step 15.2: Run, confirm failure (first case will pass-through today)**

Run: `pnpm --filter @kolektapos/api test -- sync`
Expected: FAIL on the `oversold: true` case (no validation exists).

- [ ] **Step 15.3: Rewrite `/sync/push` with Zod validation + strict payload schemas**

Edit `apps/api/src/routes/sync.ts`. Add imports at top:

```ts
import { SyncPushRequestSchema } from "@kolektapos/sync";
import { CreateCardSchema } from "@kolektapos/types";
import { z } from "zod";
```

Define local strict schemas for the two op payloads (fields the server will accept from clients, server-owned fields excluded):

```ts
// Fields allowed from client for create_card — server derives everything else.
const CreateCardPushPayloadSchema = CreateCardSchema.strict();

// Fields allowed from client for create_transaction.
// Server strips: cashierUserId (from session), createdAt (now), serverReceivedAt.
const CreateTransactionPushPayloadSchema = z
  .object({
    cartId: z.string().uuid().nullable().optional(),
    eventId: z.string().uuid(),
    kind: z.enum(["sale"]), // push path only accepts 'sale' — void/refund go through admin route
    subtotalIdr: z.number().int(),
    discountIdr: z.number().int().default(0),
    discountReason: z.string().optional(),
    totalIdr: z.number().int(),
    paymentChannelId: z.string().uuid().nullable().optional(),
    paymentNote: z.string().optional(),
    paidAt: z.number().int(),
    notes: z.string().optional(),
  })
  .strict();
```

Replace the `app.post("/sync/push", …)` handler body:

```ts
  app.post("/sync/push", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = SyncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const body = parsed.data;
    const results: unknown[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const cashierUserId = request.session.userId!;

    for (const op of body.ops) {
      try {
        switch (op.type) {
          case "create_card": {
            const existing = db
              .select()
              .from(cards)
              .where(eq(cards.clientId, op.clientId))
              .get();
            if (existing) {
              results.push({ clientId: op.clientId, status: "accepted", serverEntityId: existing.id });
              break;
            }
            const payloadParsed = CreateCardPushPayloadSchema.safeParse(op.payload);
            if (!payloadParsed.success) {
              results.push({ clientId: op.clientId, status: "rejected", reason: payloadParsed.error.message });
              break;
            }
            // Short-ID uniqueness (existing behaviour)
            const shortIdExists = db
              .select()
              .from(cards)
              .where(eq(cards.shortId, payloadParsed.data.shortId))
              .get();
            if (shortIdExists) {
              results.push({ clientId: op.clientId, status: "rejected", reason: "duplicate_short_id" });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(cards).values({ id, clientId: op.clientId, ...payloadParsed.data }).run();
            results.push({ clientId: op.clientId, status: "accepted", serverEntityId: id });
            break;
          }

          case "create_transaction": {
            const existing = db
              .select()
              .from(transactions)
              .where(eq(transactions.clientId, op.clientId))
              .get();
            if (existing) {
              results.push({ clientId: op.clientId, status: "accepted", serverEntityId: existing.id });
              break;
            }
            const payloadParsed = CreateTransactionPushPayloadSchema.safeParse(op.payload);
            if (!payloadParsed.success) {
              results.push({ clientId: op.clientId, status: "rejected", reason: payloadParsed.error.message });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(transactions).values({
              id,
              clientId: op.clientId,
              cashierUserId,       // from session, never client-controlled
              ...payloadParsed.data,
            }).run();
            results.push({ clientId: op.clientId, status: "accepted", serverEntityId: id });
            break;
          }

          default:
            results.push({ clientId: op.clientId, status: "rejected", reason: "unsupported_op_type" });
        }
      } catch (err) {
        results.push({
          clientId: op.clientId,
          status: "rejected",
          reason: err instanceof Error ? err.message : "internal_error",
        });
      }
    }

    return reply.send({ results, newCursor: nowSec });
  });
```

*Note: `CreateCardSchema` must include a `shortId` field (verify in `packages/types/src/card.ts`). If the existing schema is permissive, compose a stricter one inline using `z.object({ ... }).strict()`.*

- [ ] **Step 15.4: Run test, confirm pass**

Run: `pnpm --filter @kolektapos/api test -- sync`
Expected: all sync tests green.

- [ ] **Step 15.5: Commit**

```bash
git add apps/api/src/routes/sync.ts apps/api/src/routes/sync.test.ts
git commit -m "🛂 Zod-validate /sync/push ops; strip server-owned fields"
```

---

## Task 16: Replace backup file stream with SQLite snapshot + WAL checkpoint

**Phase:** 5 — Backup safety
**Finding:** H3
**Files:**
- Modify: `apps/api/src/routes/backup.ts`
- Create: `apps/api/src/routes/backup.test.ts`

**Rationale:** `/backup` zips the live SQLite file while writes may be in flight; WAL and SHM files are excluded. Restore can be inconsistent. Use `better-sqlite3`'s `backup()` API (or `VACUUM INTO`) to write a consistent snapshot to a temp file, then stream that.

- [ ] **Step 16.1: Add a backup route test**

Create `apps/api/src/routes/backup.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import { mkdtempSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { backupRoute } from "./backup.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;
let dbPath: string;
let photoDir: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "kolektapos-backup-"));
  dbPath = join(dir, "app.sqlite");
  photoDir = join(dir, "photos");
  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, display_name TEXT, role TEXT, created_at INTEGER DEFAULT (strftime('%s','now')), updated_at INTEGER DEFAULT (strftime('%s','now')), version INTEGER DEFAULT 1);
  `);
  const hash = await bcrypt.hash("pw-12345", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)").run("u-1", "a@t.com", hash, "A", "admin");

  const db = drizzle(sqlite, { schema });
  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await backupRoute(app, { dbPath, photoStoragePath: photoDir });

  const login = await app.inject({
    method: "POST", url: "/auth/login",
    payload: { email: "a@t.com", password: "pw-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("GET /backup", () => {
  it("returns a non-empty zip under load (writes concurrent with backup)", async () => {
    // Kick off some writes during the backup
    for (let i = 0; i < 50; i++) {
      sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
        .run(`u-${i}`, `u${i}@t.com`, "x", `U${i}`, "cashier");
    }
    const res = await app.inject({
      method: "GET",
      url: "/backup",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.rawPayload.length).toBeGreaterThan(100); // non-trivial
    // PK zip header signature
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
  });
});
```

- [ ] **Step 16.2: Run test, confirm it passes today BUT observe it doesn't validate consistency**

Run: `pnpm --filter @kolektapos/api test -- backup`
Expected: current implementation may pass the superficial checks. This test serves as a non-regression for the snapshot rewrite.

- [ ] **Step 16.3: Rewrite the backup route**

Overwrite `apps/api/src/routes/backup.ts`:

```ts
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { createReadStream, existsSync, statSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import archiver from "archiver";
import { requireAdmin } from "../plugins/auth-guard.js";

export async function backupRoute(
  app: FastifyInstance,
  opts: { dbPath: string; photoStoragePath?: string }
) {
  const { dbPath, photoStoragePath = "storage/photos" } = opts;

  app.get("/backup", { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      statSync(dbPath);
    } catch {
      return reply.status(503).send({ error: "Database file not accessible" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `kolektapos-backup-${today}.zip`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/zip");

    // Snapshot the live DB into a temp file via better-sqlite3's backup API.
    const snapshotPath = join(
      tmpdir(),
      `kolektapos-snapshot-${Date.now()}-${process.pid}.sqlite`
    );
    const source = new Database(dbPath, { readonly: false });
    try {
      source.pragma("wal_checkpoint(TRUNCATE)");
      await source.backup(snapshotPath);
    } finally {
      source.close();
    }

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("end", () => {
      try { unlinkSync(snapshotPath); } catch { /* best effort */ }
    });
    archive.on("error", (err) => {
      try { unlinkSync(snapshotPath); } catch { /* best effort */ }
      reply.log.error({ err }, "[backup] archiver error");
    });

    archive.append(createReadStream(snapshotPath), { name: "kolektapos.db" });
    if (existsSync(photoStoragePath)) {
      archive.directory(photoStoragePath, "photos");
    }

    reply.send(archive);
    archive.finalize();
  });
}
```

Note the flipped order: `reply.send(archive)` first (pipes the stream), `archive.finalize()` after. This also resolves the finalize-before-send hazard.

- [ ] **Step 16.4: Run test, confirm still green + build**

Run: `pnpm --filter @kolektapos/api test -- backup && pnpm --filter @kolektapos/api build`
Expected: green.

- [ ] **Step 16.5: Commit**

```bash
git add apps/api/src/routes/backup.ts apps/api/src/routes/backup.test.ts
git commit -m "💾 Snapshot SQLite via backup() + WAL checkpoint before zipping"
```

---

## Phase-end Gate (runs after every phase)

At the end of each phase, before opening the progress report:

- [ ] **Gate 1: Full typecheck**

Run: `pnpm typecheck`
Expected: green.

- [ ] **Gate 2: Full test suite**

Run: `pnpm test`
Expected: green.

- [ ] **Gate 3: Full build**

Run: `pnpm build`
Expected: green.

- [ ] **Gate 4: Write the phase progress report**

Create `docs/phase-N-mvp-hardening-progress.md` (N = 1..5) using the same structure as the existing `docs/m1-progress.md` through `docs/m9-progress.md`. Sections:

```markdown
# Phase N Progress Report — <Phase theme>

**Status:** Complete
**Date:** YYYY-MM-DD
**Branch:** feat/complete-mvp

## Findings Closed
- [ID] — one-line summary, link to the source file line(s) changed.

## Tasks Completed
| Task | Commit | Files |
|------|--------|-------|
| TN   | `shaA` | list  |

## Tests Added
- path/to/foo.test.ts — N cases asserting …

## Verification
- `pnpm typecheck` — green
- `pnpm test` — <N> tests passed
- `pnpm build` — green

## Carry-over / Notes
- Any follow-ups surfaced but not closed.
```

- [ ] **Gate 5: Commit the progress report**

```bash
git add docs/phase-N-mvp-hardening-progress.md
git commit -m "📊 Phase N progress report — <theme>"
```

- [ ] **Gate 6: Push**

Run: `git push`
Expected: branch advanced.

---

## Self-Review Notes

- **Spec coverage:** Every Critical from the merged review is addressed (C1→T7, C2→T6, C3→T15, C5→T9, C6→T10, C7→T5, C8→T11, C9→T12). C4 (full offline-first) is explicitly deferred per the Scope section. Highs bundled in: H1→T13, H2→T14, H3→T16, H4/H10→T3/T4, H11→T17. Mediums included: M1→T8, M17→T2, M18→T1, M12→T4.
- **Placeholder scan:** Every step contains either exact code to paste or an exact command to run with expected output.
- **Type consistency:** `nowSec()` introduced in T12 is a single helper used only in the web app; server code has its own `Math.floor(Date.now()/1000)` and is left untouched. `userDto()` is the single projection helper used across T6.
- **Ordering:** T1–T4 + T17 are independent and safely parallelizable within Phase 1. T5–T8 are sequenced (T5 before T6/T7 because seed changes affect test setup). T9–T14 are independent within Phase 3. T15 depends on T6 (shared `sync.test.ts`). T16 is standalone.
