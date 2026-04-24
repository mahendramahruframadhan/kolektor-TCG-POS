# Code Review Report – KolektaPOS

**Date:** 2026-04-24 02:16:34
**Reviewer:** Kimi Code CLI
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** HEAD (working tree)

## Executive Summary

KolektaPOS is a well-architected local-first PWA + Fastify sync server for a single-booth TCG Sales convention POS. The codebase demonstrates solid architectural decisions: append-only transactions with SQLite triggers, optimistic concurrency via version fields, denormalized cart locks for fast reads, and a clear separation between local IndexedDB state and server-side SQLite. The monorepo structure (Turbo + pnpm) is clean, and the existing tests pass.

However, the codebase has several critical and high-severity issues that must be addressed before production use. The most severe is the **committed `.env` file with a hardcoded `SESSION_SECRET`** (though `.gitignore` exists, the file is present on disk and could be accidentally committed in the future). Other critical concerns include **missing input validation on the sync push endpoint**, **weak default admin credentials in seed**, **no rate limiting on authentication**, and **the photo upload endpoint being a stub that doesn't actually handle multipart uploads**. High-severity issues include unbounded memory loads on several report endpoints, backup streaming while the DB is active, and missing test coverage for the most business-critical routes (carts, transactions, payments).

**Top 5 risks:**
- **Critical:** Hardcoded session secret and weak default admin password create immediate auth compromise risk.
- **Critical:** Sync push endpoint accepts raw untyped payloads — injection/DoS vector.
- **High:** Backup streams the live SQLite file without snapshot/consistency — potential corrupt backup.
- **High:** Settlement and monthly reports load entire tables into memory — will crash on large events.
- **High:** Zero test coverage for cart checkout, payment, void/refund, or sync conflict resolution.

**Quick wins:**
- Rotate the session secret and move it out of the repo directory entirely.
- Add Zod validation to the sync push endpoint (`apps/api/src/routes/sync.ts`).
- Remove or implement the photo upload stub.
- Add `db.transaction` wrappers around cart pay and void/refund handlers (some exist, verify all).
- Add a `limit` parameter to list endpoints and paginate the settlement report.

## Scorecard (0–10)

| Category | Score | Justification |
|----------|-------|---------------|
| Functionality & Code Quality | 6/10 | Clean structure and good patterns, but several incomplete stubs, missing validations, and unbounded queries. |
| Testing | 4/10 | Only 33 tests total; critical paths (cart pay, void, sync conflicts, holds) have zero coverage. Tests that exist pass. |
| Security | 4/10 | Session secret exposed locally, weak default seed password, no rate limiting, sync push untyped, no CSRF tokens. |
| Performance & Scalability | 5/10 | SQLite WAL mode is good, but several endpoints load full tables into memory. No pagination on lists. |
| Reliability & Stability | 6/10 | Good use of DB transactions in cart flows, but backup corruption risk, cron job lacks graceful shutdown, and sync error handling is shallow. |
| Observability | 4/10 | Fastify logger enabled, but no structured logs, no correlation IDs, audit plugin swallows all errors silently, and PII may be logged in payloads. |
| Local Deployment & DevOps | 7/10 | Clean Turbo setup, `pnpm dev` / `pnpm test` work, `.env.example` present. Lint script is a no-op. |
| Configuration & Environment | 5/10 | `.env.example` is good, but `.env` exists in working tree with a secret, and no startup validation beyond session secret length. |
| UX | 7/10 | Well-designed mobile-first UI, clear Bahasa Indonesia copy, good offline resilience in POS flow. Some edge cases (network blips during pay) lack clear feedback. |
| Compliance & Legal | 6/10 | No LICENSE file visible, no PII handling policy. Audit log exists but may capture sensitive payload data. |
| Documentation & Knowledge Sharing | 6/10 | PRD and CLAUDE.md are excellent. README is minimal. Inline docs are sparse in complex routes. No "how to debug sync" guide. |

**Average Score: 5.5/10**

## Architecture Snapshot

- **apps/web**: React 19 + Vite + TailwindCSS + vite-plugin-pwa. Dexie (IndexedDB) for local state. TanStack Query with localStorage persistence. Zustand for UI state.
- **apps/api**: Fastify 5 + better-sqlite3 + Drizzle ORM. Session-based auth with `@fastify/cookie` + `@fastify/session`.
- **packages/db**: Drizzle schema + SQLite migrations + hand-authored triggers for append-only enforcement.
- **packages/types**: Zod schemas for API input validation.
- **packages/sync**: Sync protocol types + conflict resolution rules (mostly declarative; not fully wired into API).
- **packages/qr**: Short ID generation + validation utilities.
- **packages/ui**: Empty placeholder package.

**Key data flows:**
1. Cashier scans card → lookup in local Dexie → add to cart → POST `/carts/:id/items` → server locks card in SQLite → response updates local state.
2. Background sync every 60s pulls delta from server → merges into IndexedDB.
3. Pay cart → server creates append-only transaction + transaction_items → marks cards sold.
4. Settlement reads transaction_items (never live cards) to compute owner payouts.

## Findings (Prioritized)

### Critical

#### [Security] [`.env:4`] Hardcoded `SESSION_SECRET` in working directory
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security — Secrets Management
- **Location:** `.env:4` (`SESSION_SECRET=6d99cd416c43f363bedc7fea9e9df823e63aaf6d578b3473c1107141bad0346b`)
- **Problem:** A `.env` file exists in the repo root with a real session secret. While `.gitignore` lists `.env`, the file is present on disk and could be accidentally committed via `git add -f`, included in a zip backup, or exposed via file-sharing.
- **Impact:** Session hijacking, privilege escalation, and complete authentication bypass if the secret is leaked.
- **Recommendation:** Remove the `.env` file from the working directory immediately. Store secrets in a password manager or environment-specific location outside the repo. Add `.env` to `.gitignore` (already present) and add a pre-commit hook or documentation reminding developers never to force-add `.env`.
- **Suggested fix:**
  ```bash
  rm .env
  cp .env.example .env.local  # outside repo or in home dir
  ```

#### [Security] [`apps/api/src/routes/sync.ts:109-174`] Sync push endpoint accepts untyped payloads
- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security — Input Validation
- **Location:** `apps/api/src/routes/sync.ts:109-174`
- **Problem:** The `/sync/push` handler casts `request.body` directly to `any` without Zod validation:
  ```ts
  const body = request.body as {
    ops: Array<{ type: string; clientId: string; payload: Record<string, unknown> }>;
  };
  ```
  It then spreads `op.payload` directly into Drizzle insert calls via `as unknown as typeof cards.$inferInsert`.
- **Impact:** An authenticated attacker can inject arbitrary columns/values into `cards` and `transactions` tables, bypassing schema constraints, setting internal fields (e.g., `version`, `oversold`), or causing application crashes.
- **Recommendation:** Validate the entire request body with the existing `SyncPushRequestSchema` from `@kolektapos/sync`. Validate each op's payload against `CreateCardSchema` / `CreateCartSchema` etc. before inserting. Reject unknown keys.
- **Suggested fix:**
  ```ts
  import { SyncPushRequestSchema } from "@kolektapos/sync";
  const body = SyncPushRequestSchema.safeParse(request.body);
  if (!body.success) return reply.status(400).send({ error: body.error.flatten() });
  ```

#### [Security] [`packages/db/src/seed.ts:62-63`] Weak default admin password seeded when env vars missing
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security — Auth / Secure Defaults
- **Location:** `packages/db/src/seed.ts:62-63`
- **Problem:** If `ADMIN_EMAIL` and `ADMIN_PASSWORD` are not set, the seed creates an admin with email `admin@kolekta.id` and password `changeme`, hashed with SHA-256 (not bcrypt).
- **Impact:** Anyone who can reach the server can log in as admin with a well-known password. The SHA-256 prefix in `auth.ts` means this weak hash is accepted at login.
- **Recommendation:** Do not create an admin user if `ADMIN_PASSWORD` is not set. If you must auto-create one, generate a random password and print it to stdout once, or require the admin to run a CLI command to create the first user.
- **Suggested fix:**
  ```ts
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.log("[seed] ADMIN_PASSWORD not set; skipping admin user creation.");
    return;
  }
  ```

#### [Security] [`apps/api/src/routes/auth.ts:16-57`] No rate limiting on login endpoint
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security — Brute Force Protection
- **Location:** `apps/api/src/routes/auth.ts:16-57`
- **Problem:** `POST /auth/login` has no rate limiting, IP blocking, or account lockout. bcrypt compare is async but not throttled.
- **Impact:** Credential stuffing and brute-force attacks against the single admin account or any cashier account.
- **Recommendation:** Add `fastify-rate-limit` or a simple in-memory rate limiter per IP on `/auth/login`. Consider adding a short delay (100-200ms) on failed attempts and a max-failures lockout.

#### [Functionality] [`apps/api/src/routes/sync.ts:182-199`] Photo upload endpoint is a non-functional stub
- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/sync.ts:182-199`
- **Problem:** `POST /sync/photo/:cardClientId` does not actually handle multipart uploads. It ignores the request body, constructs a fake path string, and updates the DB. The client (`IntakePage.tsx:274-280`) sends a `FormData` with a photo, but the server never reads it.
- **Impact:** Photos are lost. The `pendingPhotos` table in IndexedDB will accumulate orphaned blobs. Users believe photos are saved but they are not.
- **Recommendation:** Implement multipart handling with `@fastify/multipart` or a busboy-based parser. Write the file to `PHOTO_STORAGE_PATH`. Return the canonical URL. Also implement a backfill endpoint for pending photos.

### High

#### [Performance] [`apps/api/src/routes/settlement.ts:24-96`] Settlement report loads all transactions and items into memory
- **Severity / Confidence / Effort:** High / High / M
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/routes/settlement.ts:24-96`
- **Problem:** The settlement endpoint selects **all** transactions for an event, then all transaction items for those IDs, then all users for owner IDs, building maps in memory. For a large event (10k+ sales), this is unbounded memory usage in Node.js.
- **Impact:** Server crashes with out-of-memory errors on large events. Convention booths can process hundreds of transactions per day.
- **Recommendation:** Push aggregation to SQLite with a raw SQL query using `SUM()` and `GROUP BY`. Drizzle supports raw SQL via `db.run(sql\`...\`)`.
- **Suggested fix:**
  ```ts
  const breakdown = db.all(sql`
    SELECT owner_user_id_snapshot as ownerId, SUM(sold_price_idr) as totalPayoutIdr, COUNT(*) as itemsSold
    FROM transaction_items
    WHERE transaction_id IN (SELECT id FROM transactions WHERE event_id = ${eventId} AND kind = 'sale')
    GROUP BY owner_user_id_snapshot
  `);
  ```

#### [Performance] [`apps/api/src/routes/settlement.ts:161-218`] Monthly report loads all transactions into memory
- **Severity / Confidence / Effort:** High / High / M
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/routes/settlement.ts:161-218`
- **Problem:** `GET /reports/monthly` calls `db.select().from(transactions).all()` — loading the entire transaction history — then filters in JS.
- **Impact:** Unbounded memory growth as the database ages. O(n) filtering in JS instead of O(1) index scan in SQLite.
- **Recommendation:** Filter by `createdAt` / `paidAt` range directly in the SQL query using Drizzle's `gt`/`lt` operators.

#### [Reliability] [`apps/api/src/routes/backup.ts:13-39`] Backup streams live SQLite file without snapshot
- **Severity / Confidence / Effort:** High / High / M
- **Category:** Reliability & Stability
- **Location:** `apps/api/src/routes/backup.ts:13-39`
- **Problem:** The backup endpoint creates a read stream of the SQLite DB file while the app is actively writing to it. SQLite WAL mode reduces but does not eliminate the risk of a torn/corrupt backup if a checkpoint occurs mid-stream.
- **Impact:** Restored backups may be corrupt or fail to open. The `-wal` and `-shm` files are not included in the archive, making recovery inconsistent.
- **Recommendation:** Use SQLite's built-in backup API (`backup()` method in `better-sqlite3`) to copy to a temp file, then stream that temp file. Include `-wal` and `-shm` files, or run `PRAGMA wal_checkpoint(TRUNCATE)` before backup.
- **Suggested fix:**
  ```ts
  const backupPath = `${dbPath}.tmp-backup`;
  sqlite.backup(backupPath).then(() => {
    archive.append(createReadStream(backupPath), { name: "kolektapos.db" });
    // ... finalize, then unlink backupPath
  });
  ```

#### [Reliability] [`apps/api/src/jobs/cart-sweeper.ts:29-131`] Cron job lacks graceful shutdown
- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Reliability & Stability
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:29-131`
- **Problem:** `startCartSweeper` returns a `cron.ScheduledTask`, but `server.ts` never stores or stops it. On SIGINT/SIGTERM, the cron task may fire mid-shutdown while the DB connection is closing.
- **Impact:** Potential crashes during shutdown, or DB locks preventing clean exit.
- **Recommendation:** Store the task reference in `server.ts` and register Fastify `onClose` hook to stop it. Also stop the sweeper before running the backup.

#### [Testing] Missing tests for all business-critical routes
- **Severity / Confidence / Effort:** High / High / L
- **Category:** Testing
- **Location:** `apps/api/src/routes/carts.ts`, `transactions.ts`, `sync.ts`, `holds.ts`, `settlement.ts`
- **Problem:** Only `auth.test.ts` (4 tests), `triggers.test.ts` (6 tests), and small package unit tests exist. There are **zero** tests for: cart creation, cart pay, cart abandon, item add/remove, void/refund, hold create/release, sync push/pull, settlement math, oversold handling, and backup.
- **Impact:** Refactors to cart or transaction logic risk silent regressions in the most critical business logic (money handling).
- **Recommendation:** Prioritize integration tests for `carts.ts` (happy path + oversold) and `transactions.ts` (void/refund). Use the existing in-memory SQLite + Fastify pattern from `auth.test.ts`.

#### [Security] [`apps/api/src/plugins/audit.ts:8-41`] Audit plugin logs full response payloads without redaction
- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Security — Sensitive Data Exposure
- **Location:** `apps/api/src/plugins/audit.ts:8-41`
- **Problem:** The audit plugin stores `payload.slice(0, 2000)` in `diff_json`. If a route returns user data (e.g., `/users` listing), password hashes, session tokens, or PII could be written to the audit log. The `catch` block also silently swallows all audit insert errors.
- **Impact:** Sensitive data exposure in audit logs. Failed audit writes are invisible.
- **Recommendation:** Redact known sensitive fields (`passwordHash`, `session`, `token`) before logging. Log only entity IDs and mutation summaries, not full payloads. At minimum, log audit insert failures to the Fastify logger instead of swallowing them.

### Medium

#### [Functionality] [`apps/api/src/routes/sync.ts:51-55`] Initial pull queries wrong card status
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/sync.ts:51-55`
- **Problem:** The comment says "All non-sold + available" but the code queries `eq(cards.status, "sold")`. Two lines later it queries `db.select().from(cards).all()` (all cards), making the first query redundant and confusing.
- **Impact:** Wasted query + confusing code. No functional bug because `allCards` overwrites the result.
- **Recommendation:** Remove the redundant `cardRows` query.

#### [Functionality] [`apps/web/src/pages/POSPage.tsx:616-682`] Client-side override check bypasses server validation
- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/pages/POSPage.tsx:616-682`
- **Problem:** The POS page checks `if (finalPrice < bottom)` and blocks non-admin users. However, the `requiresAdminOverride` flag is sent to the server, but the server route (`carts.ts:139-181`) only checks the discount percentage for fixed-price cards, not whether the admin actually authorized a below-bottom sale for negotiable cards on the server side.
- **Impact:** A malicious or buggy client could set `requiresAdminOverride: true` and sell below bottom price without actual admin involvement, if the server doesn't re-validate.
- **Recommendation:** On the server, verify that `requiresAdminOverride` is true **only** when the requesting user's session role is `admin`, or reject the request.

#### [Reliability] [`apps/web/src/lib/background-sync.ts:122-130`] Background sync errors are swallowed silently
- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability & Stability
- **Location:** `apps/web/src/lib/background-sync.ts:122-130`
- **Problem:** `deltaSyncPull` errors are caught and logged to `console.warn`, but the user is never notified. If sync is failing (e.g., server down, schema mismatch), cashiers will continue working with stale data indefinitely.
- **Impact:** Silent data divergence between devices. Oversold conflicts become more likely.
- **Recommendation:** Surface sync failures in the UI (e.g., a persistent "Sync failed" banner or dot). Consider exponential backoff instead of fixed 60s intervals.

#### [Reliability] [`apps/web/src/lib/background-sync.ts:106-113`] Sync cursor can move forward even if changes fail to apply
- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability & Stability
- **Location:** `apps/web/src/lib/background-sync.ts:106-113`
- **Problem:** The cursor is updated to `response.newCursor` regardless of whether all changes were successfully applied to IndexedDB. If a single change fails (e.g., schema mismatch), that change is never retried.
- **Impact:** Permanent data loss on the client. Missing cards or transactions.
- **Recommendation:** Only advance the cursor after all changes are successfully applied. If any change fails, keep the old cursor and retry on next sync.

#### [Performance] [`apps/web/src/lib/sync.ts:16-36`] Initial sync loads entire tables with no pagination
- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Performance & Scalability
- **Location:** `apps/web/src/lib/sync.ts:16-36`
- **Problem:** `fetchAndSync` calls `api.cards.list()`, `api.users.list()`, etc., which return every row in the table. For a convention with 5,000 cards, this is a large JSON payload and memory spike in the browser.
- **Impact:** Slow initial load, potential browser crash on low-end devices, large memory footprint.
- **Recommendation:** Implement paginated initial sync (cursor-based chunks) or limit the fields returned for the initial pull.

#### [UX] [`apps/web/src/pages/POSPage.tsx:726-747`] Payment failure leaves cart in ambiguous state
- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** User Experience (UX)
- **Location:** `apps/web/src/pages/POSPage.tsx:726-747`
- **Problem:** If `api.carts.pay` fails after the server has already committed the transaction (e.g., network timeout), the client does not attempt to reconcile. It shows a generic error and the cart remains "draft" locally, but cards may already be "sold" on the server.
- **Impact:** Cashier confusion, potential double-charge or cart abandonment with already-sold cards.
- **Recommendation:** Implement idempotent pay with `transactionClientId`. On network failure, query `/transactions` by `clientId` to check if the transaction already succeeded before showing an error.

#### [Functionality] [`apps/api/src/routes/cards.ts:15-18`] List cards returns full table with no pagination
- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/routes/cards.ts:15-18`
- **Problem:** `GET /cards` selects every card in the database with no limit, offset, or pagination.
- **Impact:** Unbounded response size. Browser and server memory pressure.
- **Recommendation:** Add `limit`/`offset` query parameters, or implement cursor-based pagination. Default to a reasonable limit (e.g., 500).

### Low

#### [Maintainability] [`packages/ui/package.json`] Empty `ui` package
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Functionality & Code Quality
- **Location:** `packages/ui/package.json`
- **Problem:** The `ui` package has no source files and is not used. All UI components live in `apps/web/src/components`.
- **Impact:** Minor confusion for new developers. Monorepo bloat.
- **Recommendation:** Either populate `packages/ui` with shared shadcn/ui components and migrate `MobileAppBar`, `MaskedAmount`, etc., or remove the package.

#### [Maintainability] [`package.json:8-9`] Lint script is a no-op
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Local Deployment & DevOps
- **Location:** `package.json:8-9` and all workspace `package.json` files
- **Problem:** `pnpm lint` runs `turbo run lint`, but no package defines a `lint` script. No ESLint, Prettier, or biome configuration is present.
- **Impact:** No automated style enforcement. Inconsistent formatting across files.
- **Recommendation:** Add ESLint (with `@typescript-eslint`) and Prettier configs. Add `lint` scripts to each package.

#### [Maintainability] Multiple duplicate `genShortId` implementations
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/pages/IntakePage.tsx:12-18`, `apps/web/src/pages/BulkImportPage.tsx:41-47`
- **Problem:** The short ID generation logic is copy-pasted in at least two places, diverging slightly from `packages/qr/src/index.ts`.
- **Impact:** Maintenance risk if the format changes.
- **Recommendation:** Import `generateShortId` from `@kolektapos/qr` in both pages.

#### [UX] [`apps/web/src/pages/IntakePage.tsx:639-643`] Grading companies list differs from schema
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** User Experience (UX)
- **Location:** `apps/web/src/pages/IntakePage.tsx:98`
- **Problem:** `GRADING_COMPANIES = ["PSA", "BGS", "CGC", "ACE", "Other"]` includes "ACE", but the DB schema (`schema.ts:106`) only allows `["PSA", "BGS", "CGC", "SGC", "Other"]`. "ACE" will fail Zod validation on the server.
- **Impact:** Cashier sees a valid option that causes a server error on submit.
- **Recommendation:** Use the `GradingCompanySchema` from `@kolektapos/types` to drive the select options.

#### [Observability] [`apps/api/src/server.ts:32-63`] No health check endpoint
- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Monitoring & Logging (Observability)
- **Location:** `apps/api/src/server.ts:32-63`
- **Problem:** No `/health` or `/ready` endpoint exists. For local operation this is minor, but it prevents simple diagnostics.
- **Impact:** Harder to verify server status without attempting a login.
- **Recommendation:** Add a simple `GET /health` that checks DB connectivity and returns `{ status: "ok", db: "connected" }`.

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths:**
- Clear monorepo boundaries with well-defined package responsibilities.
- Good use of Zod for input validation on most routes (`auth.ts`, `cards.ts`, `users.ts`, `events.ts`).
- Append-only transaction design enforced at both application and database trigger levels.
- Optimistic concurrency (`version` fields) on mutable entities.
- POS flow is well-structured with clear offline-first patterns.

**Issues:**
- Sync push endpoint lacks validation (Critical).
- Photo upload is a non-functional stub (Critical).
- `sync.ts` initial pull has a redundant/confusing query (Medium).
- `IntakePage.tsx` uses a different grading company list than the schema (Low).
- Several pages duplicate short ID generation instead of using the `qr` package (Low).
- `packages/ui` is empty (Low).

**Recommendations:**
- Add Zod validation to all sync endpoints.
- Complete or remove the photo upload stub.
- Deduplicate utility functions into shared packages.
- Populate or remove the empty `ui` package.

### 2) Testing

**Strengths:**
- Test infrastructure is in place (Vitest) and works across all packages.
- Existing tests cover auth login/logout, QR generation, card Zod schemas, sync protocol types, and DB triggers.
- All 33 existing tests pass.

**Issues:**
- Only 33 tests for a full POS system.
- Zero coverage for: cart lifecycle, payment, item add/remove, void/refund, holds, settlement math, sync push/pull, bulk import, and photo upload.
- No e2e or browser tests for the PWA.
- No failure-mode tests (e.g., what happens when two cashiers sell the same card offline).

**Recommendations:**
- Add integration tests for `carts.ts` and `transactions.ts` using the in-memory SQLite pattern from `auth.test.ts`.
- Add at least one test for oversold handling.
- Add a test verifying settlement uses `ownerUserIdSnapshot`, not live `ownerUserId`.
- Consider Playwright for a single happy-path e2e test (login → intake → scan → pay).

### 3) Security

**Strengths:**
- Passwords hashed with bcrypt (cost factor 12) in production flow.
- Session cookies are `httpOnly` and `sameSite: lax`.
- `SESSION_SECRET` length is validated at startup.
- Admin routes protected by `requireAdmin`.

**Issues:**
- `.env` with hardcoded secret exists in working directory (Critical).
- Weak default admin password in seed (Critical).
- No rate limiting on auth (Critical).
- Sync push accepts arbitrary payloads (Critical).
- Audit plugin logs full response payloads without redaction (High).
- No CSRF tokens (Medium — mitigated by SameSite cookies but not sufficient for all threat models).
- `change-password` endpoint allows reuse of the same password (no history check).

**Recommendations:**
- Rotate secrets and remove `.env` from working directory.
- Add `fastify-rate-limit`.
- Validate all sync ops with Zod.
- Redact sensitive fields in audit logs.

### 4) Performance & Scalability

**Strengths:**
- SQLite WAL mode enabled for concurrent readers.
- IndexedDB bulk operations (`bulkPut`) used in initial sync.
- Denormalized cart locks on `cards` table avoid expensive joins at scan time.

**Issues:**
- Settlement and monthly reports load entire tables into JS memory (High).
- `GET /cards` has no pagination (Medium).
- Initial sync fetches every card, user, and event with no chunking (Medium).
- `audit-log` endpoint limits to 500 but has no pagination for deeper history.

**Recommendations:**
- Push aggregations to SQL.
- Add pagination to all list endpoints.
- Chunk initial sync into batches.

### 5) Reliability & Stability

**Strengths:**
- Good use of SQLite transactions in cart add/remove/pay/abandon.
- DB triggers enforce append-only constraints.
- Client has best-effort offline resilience (catch-and-continue patterns in POSPage).
- Cron job sweeps idle carts and expired holds.

**Issues:**
- Backup may stream a corrupt database (High).
- Cron job lacks graceful shutdown (High).
- Background sync silently swallows errors (Medium).
- Sync cursor advances even if changes fail to apply (Medium).
- POS pay failure doesn't reconcile with server (Medium).

**Recommendations:**
- Use SQLite backup API for consistent snapshots.
- Stop cron on Fastify `onClose`.
- Surface sync errors in UI and only advance cursor on success.

### 6) Monitoring & Logging (Observability)

**Strengths:**
- Fastify logger is enabled.
- Audit log table captures mutations.
- Console warnings for sync failures and oversold flags.

**Issues:**
- No structured logging format or correlation IDs.
- Audit plugin silently swallows insert errors.
- No health check endpoint.
- No metrics hooks (even simple counters for sales, errors).
- PII/sensitive data may be in audit logs.

**Recommendations:**
- Add `GET /health`.
- Log audit failures to the Fastify logger.
- Add a simple request log middleware or use Fastify's built-in logging more deliberately.

### 7) Deployment & DevOps (Local-first)

**Strengths:**
- `pnpm dev`, `pnpm test`, `pnpm build`, `pnpm typecheck` all work.
- Turbo pipeline is correctly configured with dependencies.
- `.env.example` documents required variables.
- `better-sqlite3` and `esbuild` are declared as `onlyBuiltDependencies`.

**Issues:**
- `pnpm lint` is a no-op (Low).
- No local SSL/TLS setup documented (relevant for PWA service worker requirements on some browsers).
- No documented procedure for resetting the local DB.

**Recommendations:**
- Add ESLint + Prettier.
- Document local HTTPS setup (e.g., `vite-plugin-mkcert`) if needed for PWA testing.
- Add a `db:reset` script.

### 8) Configuration & Environment Management

**Strengths:**
- `.env.example` is clear and complete.
- Settings table allows runtime configuration.
- Config validation in `session.ts` (secret length check).

**Issues:**
- `.env` file exists in repo directory with a real secret.
- No validation for `DATABASE_PATH`, `PHOTO_STORAGE_PATH`, or `PORT` at startup.
- `PHOTO_STORAGE_PATH` is not created automatically if missing.

**Recommendations:**
- Remove `.env` from working tree.
- Validate all required env vars at startup and fail fast with clear messages.
- Ensure `PHOTO_STORAGE_PATH` directory is created on server boot.

### 9) User Experience (UX)

**Strengths:**
- Excellent mobile-first design with clear visual hierarchy.
- Bahasa Indonesia copy is consistent and appropriate for the target audience.
- Masked amounts with tap-to-reveal protect sensitive pricing.
- Camera scanner + USB HID scanner both feed the same input field.
- Offline resilience: POS works without network.

**Issues:**
- Payment failure gives generic error with no retry/reconcile guidance (Medium).
- Background sync failures are invisible to the user (Medium).
- No loading skeletons; pages show "Memuat…" text.
- `BulkImportPage` does not show a progress bar during row-by-row import, only a count.

**Recommendations:**
- Add a persistent sync status indicator (dot/banner).
- Improve pay failure messaging with a "Check transactions" action.
- Add a visual progress bar for bulk import.

### 10) Compliance & Legal

**Strengths:**
- Audit log exists for data mutation tracking.
- Append-only transactions provide an immutable financial record.

**Issues:**
- No `LICENSE` file in the repository.
- No data retention or PII handling documentation.
- Audit logs may capture sensitive personal data without a retention policy.
- Photos of cards may contain personal information (e.g., faces in background) with no stated handling policy.

**Recommendations:**
- Add a `LICENSE` file.
- Document data retention for audit logs and photos.
- Consider GDPR-style data deletion requests (even for a private tool, good practice).

### 11) Documentation & Knowledge Sharing

**Strengths:**
- `docs/01-prd.md` is exceptionally detailed and well-structured.
- `CLAUDE.md` provides excellent architectural invariants for AI assistants.
- Implementation plan documents milestone sequencing.

**Issues:**
- `README.md` is minimal (only workspace layout and status).
- No "how to run locally" step-by-step guide.
- No troubleshooting guide for common issues (e.g., "sync not working", "DB locked").
- Inline code comments are sparse in complex routes like `carts.ts` and `transactions.ts`.
- No API documentation (OpenAPI/Swagger).

**Recommendations:**
- Expand `README.md` with setup, run, test, and troubleshooting sections.
- Add inline comments explaining the transaction boundary strategy in `carts.ts`.
- Consider adding `@fastify/swagger` for auto-generated API docs.

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)
1. **Rotate session secret** — generate a new secret, remove `.env` from working tree, update `.env.example` to show a placeholder. (S)
2. **Fix seed default password** — do not create admin user if `ADMIN_PASSWORD` is unset. (S)
3. **Add rate limiting** — install `fastify-rate-limit` on `/auth/login`. (S)
4. **Validate sync push** — use `SyncPushRequestSchema` and per-op payload schemas. (M)
5. **Fix grading company mismatch** — use `GradingCompanySchema` in `IntakePage.tsx`. (S)
6. **Remove redundant query** — clean up `sync.ts` initial pull. (S)

### Phase 2: Short-term improvements (1–2 weeks)
1. **Implement or remove photo upload stub** — decide whether photo support is MVP. (M)
2. **Add backup consistency** — use SQLite `backup()` API and include WAL files. (M)
3. **Paginate list endpoints** — add `limit`/`offset` to `/cards`, `/transactions`, `/audit-log`. (M)
4. **Push aggregations to SQL** — rewrite settlement and monthly reports with raw SQL `GROUP BY`. (M)
5. **Add cron graceful shutdown** — stop sweeper on Fastify `onClose`. (S)
6. **Improve sync error handling** — surface failures in UI, only advance cursor on success. (M)
7. **Add critical integration tests** — carts, transactions, void/refund using in-memory DB. (L)
8. **Add linting** — ESLint + Prettier with TypeScript support. (S)

### Phase 3: Longer-term refactors (2–6 weeks)
1. **Expand test coverage** — target 70%+ coverage on `apps/api/src/routes`. (L)
2. **Add e2e test** — single Playwright flow: login → intake → scan → pay → settlement. (L)
3. **Implement paginated initial sync** — chunk large tables during first sync. (M)
4. **Add health check endpoint** — `/health` with DB connectivity check. (S)
5. **Audit log redaction** — strip sensitive fields before writing audit records. (M)
6. **Deduplicate utilities** — move `genShortId` to `@kolektapos/qr`, share validation logic. (S)
7. **Add OpenAPI docs** — `@fastify/swagger` for auto-generated API documentation. (M)
8. **Document operational runbook** — backup/restore, DB reset, common troubleshooting. (M)

## Appendix

### How to run/build/test locally (as verified from repo)
```bash
# Requirements: Node >= 22, pnpm >= 10

# Install dependencies
pnpm install

# Run dev servers (web + api concurrently via Turbo)
pnpm dev

# Build all packages
pnpm build

# Run all tests
pnpm test

# Type check
pnpm typecheck

# API-only dev
pnpm --filter @kolektapos/api dev

# Web-only dev
pnpm --filter @kolektapos/web dev

# DB migrations
pnpm --filter @kolektapos/db db:migrate

# DB seed
pnpm --filter @kolektapos/db db:seed
```

### Notable files reviewed
- `apps/api/src/server.ts`
- `apps/api/src/plugins/session.ts`, `audit.ts`, `auth-guard.ts`
- `apps/api/src/routes/auth.ts`, `cards.ts`, `carts.ts`, `transactions.ts`, `sync.ts`, `backup.ts`, `settlement.ts`, `holds.ts`, `users.ts`, `events.ts`
- `apps/api/src/jobs/cart-sweeper.ts`
- `apps/web/src/App.tsx`, `main.tsx`
- `apps/web/src/pages/POSPage.tsx`, `IntakePage.tsx`, `InventoryPage.tsx`, `ReportsPage.tsx`, `BulkImportPage.tsx`, `LoginPage.tsx`, `AdminPage.tsx`, `UsersAdminPage.tsx`
- `apps/web/src/lib/api.ts`, `db.ts`, `background-sync.ts`, `sync.ts`
- `apps/web/src/store/auth.ts`, `pos.ts`
- `packages/db/src/schema.ts`, `migrate.ts`, `seed.ts`, `triggers.sql`
- `packages/types/src/card.ts`, `cart.ts`, `transaction.ts`
- `packages/sync/src/protocol.ts`, `conflict.ts`
- `packages/qr/src/index.ts`

### Dependency notes
- `better-sqlite3@11.7.0` — native module, requires build tools. Declared in `onlyBuiltDependencies`.
- `bcryptjs@3.0.2` — pure JS bcrypt, acceptable for this workload.
- `fastify@5.2.1` — current major, well-maintained.
- `zod@3.24.1` — used for validation but not consistently on sync endpoints.
- `node-cron@3.0.3` — acceptable for local single-node deployment. Consider `toad-scheduler` for more robust job management if scaling.
- `xlsx@0.18.5` — used for bulk import Excel parsing. No known critical vulnerabilities at this version, but keep updated.
- `html5-qrcode@2.3.8` — camera QR scanning. Works well for the use case.
