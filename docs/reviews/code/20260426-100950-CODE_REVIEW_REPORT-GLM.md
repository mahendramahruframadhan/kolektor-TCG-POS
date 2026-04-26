# Code Review Report – KolektaPOS

**Date:** 2026-04-26 10:09:50
**Reviewer:** GLM (zai-coding-plan/glm-5.1)
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `9bedc2f` — `feat(offline): POS offline cart and payment queue`

## Executive Summary

KolektaPOS is a well-architected, purpose-built local-first POS system for TCG sales at Indonesian conventions. The monorepo (Turbo + pnpm) spans 7 packages/apps with ~130 source files and 21 test files. The codebase demonstrates strong engineering discipline: Zod validation on every input boundary, session-based auth with RBAC, insert-only transactions enforced at both ORM and DB trigger levels, and a thoughtful offline-first sync design with pending transaction queuing.

However, the codebase has several issues that need attention before production use. A critical test failure in `@kolektapos/types` is blocking the full test suite, a `.env` file with a real session secret is committed to the repository (despite being in `.gitignore` — it was previously tracked or force-added), the photo upload endpoint is a stub, and the `category` migration is not registered in the Drizzle journal. The offline POS flow is architecturally sound but has an edge case where offline-created carts are never reconciled with the server.

### Top 5 Risks

- **[Critical] Committed `.env` with real secrets** — SESSION_SECRET and admin credentials are in the working tree. Although `.gitignore` excludes `.env`, the file is present on disk and could be accidentally committed or leaked. (Security)
- **[High] Test suite fails** — `@kolektapos/types` has 2 failing tests because `CreateCardSchema` now requires `category` (min 1) but the test fixtures don't include it. This blocks `pnpm test` from passing. (Testing)
- **[High] Photo upload endpoint is a stub** — `POST /sync/photo/:cardClientId` acknowledges the request but never writes to disk. Photos are lost after upload. (Functionality)
- **[High] Migration 0003 not in Drizzle journal** — `0003_add_category_to_cards.sql` exists but isn't in `_journal.json`, so `drizzle-orm`'s migrator won't apply it on fresh databases. (Reliability)
- **[Medium] Offline cart reconciliation gap** — Offline carts created in IDB are never synced to the server. Only the resulting transaction is flushed. The server has no record of the offline cart, which could affect reporting and cart-sweeper logic. (Functionality)

### Quick Wins

- Fix the 2 failing `CreateCardSchema` tests by adding `category: "TCG"` to test fixtures.
- Add migration 0003 to `_journal.json` (or regenerate with `drizzle-kit generate`).
- Ensure `.env` is removed from git tracking: `git rm --cached .env` if it was ever committed.
- Implement the photo upload endpoint to actually write to `PHOTO_STORAGE_PATH`.
- Add a `lint` script (ESLint is not installed; only `typecheck` is available).

## Scorecard (0–10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | **7/10** | Core POS flow is complete and well-structured. Code is consistent, TypeScript strict mode is enabled, and Zod validates all boundaries. Photo upload and lint are missing. |
| Testing | **5/10** | 21 test files with good coverage of auth, authz, carts, sync, settlement, and backup. But 2 tests currently fail, acceptance test has a seed count mismatch, and major pages (POS, Inventory, Reports) have zero tests. |
| Security | **7/10** | Solid auth (bcrypt + session + httpOnly cookies + SameSite strict + rate limiting). Input validation everywhere. Audit logging with redaction. CORS restricted. But `.env` with real secrets is on disk, no CSRF token, and session secret is loaded before validation in `session.ts`. |
| Performance & Scalability | **7/10** | SQLite + WAL is appropriate for single-booth use. Indexed queries on hot paths. Cart locking is denormalized for fast lookups. Initial sync loads all cards into memory — could be slow with 10k+ cards. |
| Reliability & Stability | **7/10** | Append-only transactions with DB triggers. Optimistic concurrency on mutable entities. Idempotent sync. Background sync with 60s interval. But offline carts never sync, and `create_card` in sync push doesn't set `updatedAt`/`createdAt`/`status`. |
| Observability | **6/10** | Fastify logger enabled. Structured business events (`sale_completed`, `oversold_detected`). Audit log with 90-day pruning to JSONL. But no health metrics, no correlation IDs, and client-side sync errors are only `console.warn`. |
| Local Deployment & DevOps | **8/10** | Clean `pnpm dev` / `pnpm build` / `pnpm test` via Turbo. `.nvmrc` pins Node >=22. `pnpm-lock.yaml` present. Storage directories auto-created. One-command startup. |
| Configuration & Environment | **8/10** | Fail-fast Zod env validation with clear error messages. Cross-field validation (admin creds must be paired, DOMAIN required in production). Placeholder secret rejected. Good separation of dev/prod config. |
| UX | **7/10** | Cashier UI in Bahasa Indonesia per PRD. Scan-first POS flow. Masked prices with tap-hold reveal. Offline banner and blocked states. Responsive mobile design. But no loading states on some async operations, and error messages could be more user-friendly. |
| Compliance & Legal | **6/10** | License is UNLICENSED (proprietary, appropriate for private tool). Audit log and data retention policy exist. But no dependency license audit, and PII (emails, display names) stored in IDB without encryption. |
| Documentation & Knowledge Sharing | **8/10** | Excellent PRD, implementation plan, runbook, and ADRs. Progress tracking by milestone. Onboarding is clear. CONTRIBUTING.md exists. Code has helpful comments at architectural boundaries. |

**Average Score: 6.9/10**

**Summary judgment:** MVP-ready for controlled local use after fixing the 2 failing tests, the migration journal gap, and the `.env` leak. Photo upload and offline cart reconciliation should be addressed before first event deployment.

---

## Architecture Snapshot

### High-level Components

```
kolektapos/
├── apps/api/          Fastify 5 + better-sqlite3 sync server
│                     Auth (session cookie), routes, background jobs
├── apps/web/          React 19 + Tailwind 3 + Vite 6 PWA
│                     Local-first POS with IDB (Dexie), offline queue
├── packages/db/      Drizzle schema + migrations + append-only triggers
├── packages/types/   Zod validation schemas + inferred TS types
├── packages/sync/    Sync protocol schemas + conflict resolution rules
├── packages/qr/      Short ID generation (O-XXXXX format)
└── packages/ui/      Placeholder for shared shadcn/ui (empty)
```

### Key Data Flows

1. **Online POS flow**: Scan → Card lookup (server) → Add to cart → Lock card → Pay → Insert-only transaction → Release locks
2. **Offline POS flow**: Scan → Card lookup (IDB) → Create local cart → Add to cart → Pay → Queue as `pendingTransaction` in IDB → Background sync flushes to server
3. **Sync flow**: 60s background timer → Flush pending tx → Delta pull (cursor-based) → Merge changes into IDB
4. **Background jobs**: Cart sweeper (5min cron) abandons idle carts + expires holds; Audit pruner (daily 03:17) archives to JSONL

### Notable Dependencies/tech Stack

- **Runtime**: Node 22, Fastify 5, React 19, better-sqlite3, Dexie 4
- **Build**: Turbo 2, pnpm 10, Vite 6, TypeScript 5.6+ (strict mode)
- **Validation**: Zod 3.24
- **Auth**: @fastify/session + @fastify/cookie + bcryptjs (cost 12)
- **PWA**: vite-plugin-pwa (Workbox), NetworkFirst for API routes
- **Testing**: Vitest 4, Testing Library, in-memory SQLite for API tests

---

## Findings (Prioritized)

### Critical

#### [C-1] [Security] `.env` file contains real secrets on disk

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security
- **Location:** `.env:3-8`
- **Problem:** The `.env` file contains a real 64-char hex `SESSION_SECRET` and admin credentials (`admin@kolekta.id` / `changeme`). While `.gitignore` excludes `.env`, the file exists in the working directory. If it was ever committed (even briefly), the secret is in git history.
- **Impact:** Session hijacking if the secret leaks. Admin account takeover with known credentials.
- **Recommendation:**
  1. Run `git log --all --full-history -- .env` to check if it was ever committed.
  2. If committed, rotate `SESSION_SECRET` and `ADMIN_PASSWORD` immediately.
  3. Consider using `git secrets` or a pre-commit hook to prevent future leaks.
  4. Change the default admin password from `changeme` before any deployment.

#### [C-2] [Testing] `pnpm test` fails — 2 tests in `@kolektapos/types`

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Testing
- **Location:** `packages/types/src/card.test.ts:15,29`
- **Problem:** `CreateCardSchema` now includes `category: z.string().min(1)` (added in the category feature commit), but the test fixtures for "accepts valid fixed-price card" and "accepts valid negotiable card" don't include a `category` field. Zod's `.min(1)` on the defaulted value means `""` (the default) fails validation.
- **Impact:** The entire monorepo test suite (`pnpm test`) fails. This blocks any CI or pre-merge validation.
- **Recommendation:** Add `category: "TCG"` to both test fixtures in `packages/types/src/card.test.ts:5-14` and `packages/types/src/card.test.ts:18-28`.

---

### High

#### [H-1] [Reliability] Migration 0003 not registered in Drizzle journal

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability & Stability
- **Location:** `packages/db/drizzle/meta/_journal.json:1-27`
- **Problem:** `0003_add_category_to_cards.sql` exists in `packages/db/drizzle/` but `_journal.json` only has entries for 0000, 0001, and 0002. Drizzle's migrator reads the journal to determine which migrations to apply — migration 0003 will be silently skipped on fresh database creation.
- **Impact:** Fresh deployments will be missing the `category` column on `cards`, causing runtime errors when the API tries to read/write card categories.
- **Recommendation:** Add entry to `_journal.json`:
  ```json
  {
    "idx": 3,
    "version": "6",
    "when": 1777000000000,
    "tag": "0003_add_category_to_cards",
    "breakpoints": true
  }
  ```
  Or regenerate with `pnpm --filter @kolektapos/db db:generate` and verify the journal includes all 4 migrations.

#### [H-2] [Functionality] Photo upload endpoint is a stub

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/sync.ts:257-275`
- **Problem:** The `POST /sync/photo/:cardClientId` handler acknowledges the upload and sets `photoPath` on the card, but never actually writes the uploaded file to disk. The comment says "Simplified: just acknowledge the upload" and "Production implementation would write to PHOTO_STORAGE_PATH".
- **Impact:** Card photos uploaded during stock receiving are lost. The path `/storage/photos/{cardClientId}.jpg` is stored but no file exists there.
- **Recommendation:** Implement multipart file handling (e.g., via `@fastify/multipart`) to write the uploaded photo to `PHOTO_STORAGE_PATH`. Also handle the client side: `apps/web` stores blobs in `pendingPhotos` IDB table but the upload mechanism needs to be wired.

#### [H-3] [Functionality] Offline carts never sync to server

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/lib/background-sync.ts:117-152`
- **Problem:** When the POS operates offline, it creates a cart locally in IDB (with `activeCartIsOffline = true`). On payment, only the resulting transaction is queued as a `pendingTransaction` for later flush. The offline cart itself is never sent to the server. The `flush-pending-tx` endpoint creates transactions with `cartId: null`.
- **Impact:** Server-side reporting that joins transactions to carts will show `null` cartId for offline transactions. Cart sweeper cannot clean up these ghost carts. Admin dashboards showing "active carts" won't reflect offline activity.
- **Recommendation:** This is acceptable per the PRD's offline-first design (offline operations bypass the cart flow on the server). Document this as a known gap. Consider adding the cart clientId to the transaction payload for audit trail purposes.

#### [H-4] [Testing] Acceptance test seed count mismatch

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Testing
- **Location:** `packages/db/src/test-acceptance.ts:53`
- **Problem:** The assertion `settingsRows.length === 3` expects 3 settings, but `seed.ts` now seeds 4 settings (`max_line_discount_pct_fixed`, `max_transaction_discount_pct`, `cart_idle_ttl_minutes`, `default_landing_page`).
- **Impact:** The M1 acceptance test (`tsx src/test-acceptance.ts`) will fail, which blocks manual acceptance verification.
- **Recommendation:** Update the assertion to `settingsRows.length === 4` or `settingsRows.length >= 3`.

#### [H-5] [Security] Session secret read before validation

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `apps/api/src/plugins/session.ts:6-8`, `apps/api/src/server.ts:42,117`
- **Problem:** `sessionPlugin` reads `process.env.SESSION_SECRET` directly and only checks length (line 7: `secret.length < 32`). The more thorough validation in `config.ts` (which rejects the placeholder value) runs at line 42 of `server.ts`, but `sessionPlugin` is registered at line 117 — the ordering is correct. However, `sessionPlugin` duplicates the validation rather than receiving the validated config.
- **Impact:** If `sessionPlugin` is ever used in a context where `loadConfig()` wasn't called first (e.g., in tests), the weaker validation would allow the placeholder secret.
- **Recommendation:** Pass the validated config to `sessionPlugin` instead of reading `process.env` directly. Or ensure `loadConfig()` is always called before session setup.

#### [H-6] [Security] No CSRF protection

- **Severity / Confidence / Effort:** High / Medium / M
- **Category:** Security
- **Location:** `apps/api/src/server.ts` (missing), `apps/api/src/plugins/session.ts`
- **Problem:** The API uses cookie-based session auth with `sameSite: "strict"` and CORS with credentials. While `sameSite: strict` provides strong CSRF protection for same-origin requests, it does not protect against subdomains or scenarios where the cookie policy is relaxed. There is no explicit CSRF token mechanism.
- **Impact:** For a local-network deployment, this is low risk. But if the app is ever exposed on a public domain, `sameSite: strict` alone may not be sufficient (older browsers, redirect-based attacks).
- **Recommendation:** For the current threat model (local network, same-site only), `sameSite: strict` is adequate. Document this as an accepted risk. If deploying publicly, add `@fastify/csrf-protection`.

---

### Medium

#### [M-1] [Functionality] `create_card` in sync push doesn't set server-managed fields

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/sync.ts:203-204`
- **Problem:** When creating a card via sync push, the code does `db.insert(cards).values({ id, clientId: op.clientId, ...payloadParsed.data })`. The `payloadParsed.data` includes `photoPath` from the client, but the server doesn't set `status`, `oversold`, `lockedByCartId`, etc. — these rely on Drizzle column defaults (`status: "available"`, `oversold: false`). However, `createdAt` and `updatedAt` use `sql\`(strftime('%s','now'))\`` as defaults, which means they're set at INSERT time. The schema correctly has defaults for all server-managed fields.
- **Impact:** Low — Drizzle defaults handle this correctly. But the `category` field has `default("")` in the schema, which means cards pushed without `category` will have an empty string, potentially causing validation issues downstream (since `CreateCardSchema` requires `category: min(1)`).
- **Recommendation:** Verify that `CreateCardPushPayloadSchema` includes `category` field. Currently it does not — add `category: z.string().min(1).default("")` to match `CreateCardSchema`. This is a real inconsistency between the push schema and the create schema.

#### [M-2] [Reliability] Dual unique indexes on same columns

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability & Stability
- **Location:** `packages/db/src/schema.ts:70,135-136`
- **Problem:** The `cards` table has `.unique()` on both `clientId` (line 70) and `shortId` (line 72) column definitions, plus `uniqueIndex("cards_client_id_idx").on(t.clientId)` and `uniqueIndex("cards_short_id_idx").on(t.shortId)` in the index builder (lines 135-136). This creates duplicate unique constraints in SQLite. Same pattern for `carts.clientId` and `transactions.clientId`, and `users.email`.
- **Impact:** Performance overhead from maintaining two identical indexes. Minor storage waste. No functional impact since both enforce the same constraint.
- **Recommendation:** Remove either the `.unique()` on the column definition or the `uniqueIndex()` in the builder. The `uniqueIndex()` approach is preferred since it gives explicit index names.

#### [M-3] [Reliability] `flushPendingTransactions` marks all as "syncing" before batch

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability & Stability
- **Location:** `apps/web/src/lib/background-sync.ts:125-129`
- **Problem:** Before calling `api.sync.flushPendingTx(pending)`, all pending transactions are marked as `"syncing"` via `Promise.all(...)`. If the network request fails, these transactions remain stuck in `"syncing"` status forever — they're never reset to `"pending"` for retry.
- **Impact:** Offline transactions can get stuck in `"syncing"` state and never be retried, resulting in permanent data loss (the transaction exists only in IDB but is never sent to the server).
- **Recommendation:** Add error handling that resets `"syncing"` transactions back to `"pending"` on failure:
  ```typescript
  try {
    const response = await api.sync.flushPendingTx(pending);
    // ... handle response
  } catch (err) {
    // Reset syncing back to pending for retry
    for (const tx of pending) {
      await idb.pendingTransactions.update(tx.clientId, { syncStatus: "pending" });
    }
    throw err;
  }
  ```

#### [M-4] [Performance] Initial sync loads all cards into memory

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/routes/sync.ts:113`
- **Problem:** `const allCards = db.select().from(cards).all()` loads every card into memory at once. For the expected use case (single booth, maybe 1000-5000 cards), this is fine. But if the dataset grows (multiple events, 10k+ cards), this could cause memory pressure and slow response times.
- **Impact:** Slow initial sync for large datasets. Memory pressure on the server.
- **Recommendation:** Consider streaming or paginating the initial pull response. For the current MVP scale, this is acceptable. Document the expected card count limit.

#### [M-5] [Reliability] `Math.random()` for short ID generation

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability & Stability
- **Location:** `packages/qr/src/index.ts` (uses `Math.random()`)
- **Problem:** Short IDs are generated using `Math.random()` which is not cryptographically secure and has collision potential due to its limited entropy. The server-side uniqueness constraint catches collisions, but `Math.random()` could theoretically produce predictable sequences.
- **Impact:** For a POS system with ~5000 cards and 7-char IDs (36^6 ≈ 2.2 billion possibilities), collision probability is negligible. But if the PRNG state is shared, generated IDs could be somewhat predictable.
- **Recommendation:** Replace with `crypto.getRandomValues()` for better randomness. This is a minor improvement since the server uniqueness constraint is the real safeguard.

#### [M-6] [Testing] No tests for POS page, Inventory, Reports, Admin, or sync client

- **Severity / Confidence / Effort:** Medium / High / L
- **Category:** Testing
- **Location:** `apps/web/src/pages/*.tsx` (no test files)
- **Problem:** The web app has 18 page components with zero page-level tests. Only the offline mode components (guard, banner, toggle) and utility hooks have tests. The critical POS checkout flow, inventory management, report generation, and admin settings have no test coverage.
- **Impact:** Regressions in the cashier flow (the most critical user journey) won't be caught by automated tests.
- **Recommendation:** Prioritize tests for:
  1. `POSPage.tsx` — scan, add to cart, pay flow (both online and offline)
  2. `StockReceivePage.tsx` — card creation with short ID
  3. `ReportsPage.tsx` — report rendering and CSV export
  4. `AdminPage.tsx` — settings validation

#### [M-7] [Reliability] `test-setup.ts` uses `require()` in ESM context

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability & Stability
- **Location:** `packages/db/src/test-setup.ts`
- **Problem:** The test setup file uses `require('node:crypto')` to polyfill `globalThis.crypto`. The package is `"type": "module"`. While Vitest handles this, it could fail in strict ESM contexts or if the test runner changes.
- **Recommendation:** Use `import { webcrypto } from 'node:crypto'` instead of `require()`.

#### [M-8] [Observability] Client-side sync errors only logged to console

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Monitoring & Logging
- **Location:** `apps/web/src/lib/background-sync.ts:174`
- **Problem:** Background sync failures are logged via `console.warn("[sync] Background sync failed:", err)`. There's no structured error reporting, no retry count tracking, and no user-visible notification of persistent sync failures.
- **Impact:** Sync failures are invisible to operators. If transactions are stuck in `"syncing"` or `"error"` state, nobody will know until they check the browser console.
- **Recommendation:** Add a visible sync error indicator in the UI (e.g., the SyncDot component already shows error state, but could include a count or last error message). Consider logging to the server when possible.

---

### Low

#### [L-1] [Code Quality] `packages/ui` is an empty scaffold

- **Severity / Confidence / Effort:** Low / High / —
- **Category:** Functionality & Code Quality
- **Location:** `packages/ui/package.json`
- **Problem:** The UI package exists as a placeholder with no source files, no tsconfig, and no exports. Components are built directly in `apps/web`.
- **Impact:** No functional impact. The package can be removed or populated later.
- **Recommendation:** Either remove the empty package to avoid confusion, or add a README explaining it's reserved for future use.

#### [L-2] [Code Quality] `api.ts` uses `unknown` types extensively

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/lib/api.ts:88-98,100-101,109-119`
- **Problem:** Most API client methods return `unknown` or accept `unknown` body parameters. For example, `cards.create(body: unknown)`, `holds.create(body: unknown)`, `transactions.void(id, body: unknown)`.
- **Impact:** Loss of type safety at the API boundary. Typos or missing fields in request bodies won't be caught at compile time.
- **Recommendation:** Type the API client methods with the same Zod-inferred types from `@kolektapos/types`.

#### [L-3] [Code Quality] No linting configured

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Functionality & Code Quality
- **Location:** Root `package.json` (no eslint dependency)
- **Problem:** The `lint` script (`turbo run lint`) exists but ESLint is not installed. Running `pnpm lint` produces an error.
- **Impact:** No automated code style enforcement. Inconsistent formatting or anti-patterns won't be caught.
- **Recommendation:** Add ESLint with a TypeScript-aware config (e.g., `eslint-config-next` or a flat config). Alternatively, remove the `lint` script from `turbo.json` and `package.json` to avoid confusion.

#### [L-4] [Code Quality] `as` type assertions on request params

- **Severity / Confidence / Effort:** Low / High / —
- **Category:** Functionality & Code Quality
- **Location:** Multiple route files, e.g., `apps/api/src/routes/carts.ts:79,98,255`
- **Problem:** Route params and query params use `request.params as { id: string }` and `request.query as Record<string, string>` without runtime validation. Fastify route schemas could provide this automatically.
- **Impact:** No runtime protection against malformed route params. In practice, Fastify's router ensures the URL matches, so the `id` will always be present.
- **Recommendation:** Add Fastify route schema definitions for params/query, which would provide both runtime validation and OpenAPI documentation.

#### [L-5] [Observability] No correlation/request IDs

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Monitoring & Logging
- **Location:** API-wide
- **Problem:** There is no request ID or correlation ID in logs. When debugging issues, it's difficult to trace a specific request across multiple log entries.
- **Impact:** Harder to debug production issues, especially with concurrent requests.
- **Recommendation:** Add `@fastify/request-id` plugin to generate and log request IDs.

#### [L-6] [Code Quality] `oversold` field default is `false` but insert may set it redundantly

- **Severity / Confidence / Effort:** Low / High / —
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/carts.ts:434`
- **Problem:** `oversold: alreadySold ? true : false` — when `alreadySold` is false, this explicitly sets `oversold: false` which is already the default. Not a bug, but redundant.
- **Impact:** No functional impact.
- **Recommendation:** Use `oversold: alreadySold || undefined` to only set the field when true, relying on the default.

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths:**
- Clean monorepo structure with clear package boundaries
- Consistent Zod validation on every input boundary (env, route bodies, sync payloads)
- Insert-only transactions enforced at both ORM and DB trigger levels
- Optimistic concurrency via `version` field on mutable entities
- Idempotent operations via `clientId` UUID
- Owner snapshot at sale time for settlement correctness
- Cart locking denormalized for fast scan-screen display
- Strong TypeScript configuration (strict, noUncheckedIndexedAccess, noImplicitOverride)

**Issues:**
- Photo upload is a stub (H-2)
- Offline carts never sync to server (H-3)
- `CreateCardPushPayloadSchema` missing `category` field (M-1)
- No linting configured (L-3)
- API client uses `unknown` types (L-2)

**Recommendations:**
1. Implement photo upload endpoint (H-2)
2. Add `category` to `CreateCardPushPayloadSchema` (M-1)
3. Type the API client methods properly (L-2)
4. Add ESLint configuration (L-3)

### 2) Testing

**Strengths:**
- 21 test files covering auth, authz, carts, sync, settlement, backup, flush-pending-tx
- Tests use real bcrypt hashing and in-memory SQLite with full schema
- Authz boundary tests verify cashier vs admin access patterns
- Sync tests verify no password hash leaks and strict schema enforcement

**Issues:**
- 2 tests fail due to missing `category` in test fixtures (C-2)
- Acceptance test has seed count mismatch (H-4)
- Zero page-level tests for the web app's 18 pages (M-6)
- No integration tests for the offline POS flow
- No test for the cart sweeper background job
- No test for the audit pruner

**Recommendations:**
1. Fix failing tests immediately (S effort)
2. Fix acceptance test count (S effort)
3. Add POS page tests for online and offline flows (L effort)
4. Add cart sweeper job test (M effort)

### 3) Security

**Strengths:**
- bcrypt with cost factor 12 for password hashing
- httpOnly, SameSite=strict session cookies with 30-day rolling expiry
- Rate limiting on login (20/min) and change-password (10/min)
- Strict CORS with explicit allowlist
- Helmet for HTTP security headers
- Audit logging with sensitive data redaction
- `userDto` strips `passwordHash` from all responses
- Sync push uses `.strict()` schemas to reject unknown fields
- `cashierUserId` derived from session, never client-controlled
- Admin override gate prevents cashier from setting `requiresAdminOverride`
- Price floors enforced server-side

**Issues:**
- `.env` with real secrets on disk (C-1)
- Session secret read before full validation (H-5)
- No CSRF token (H-6, accepted risk for local deployment)
- `passwordHash` column in DB schema is not encrypted at rest
- IDB stores `bottomPriceIdr` and other sensitive data in clear

**Recommendations:**
1. Rotate secrets if `.env` was ever committed (S effort)
2. Pass validated config to `sessionPlugin` (S effort)
3. Document CSRF as accepted risk for local deployment

### 4) Performance & Scalability

**Strengths:**
- SQLite with WAL mode is appropriate for single-booth use
- Indexed queries on hot paths (card shortId, status, ownerUserId)
- Cart locking denormalized for fast lookups during scan
- Settings read from DB (not IDB) for server-side validation
- `inArray` used for batch card lookups in pay flow

**Issues:**
- Initial sync loads all cards into memory (M-4)
- Settlement report uses in-memory aggregation (acceptable for MVP scale)
- No pagination on sync pull response
- `bulkPut` during sync writes all changes without batching

**Recommendations:**
1. For current MVP scale (<5000 cards), no action needed
2. If dataset grows, add pagination to initial sync pull
3. Consider streaming sync response for large datasets

### 5) Reliability & Stability

**Strengths:**
- Append-only transactions with DB-level trigger enforcement
- Optimistic concurrency prevents lost updates on mutable entities
- Idempotent operations prevent duplicate creates
- Atomic database transactions for cart locking, pay flow, void/refund
- Background sync with automatic retry (every 60s)
- Cart sweeper prevents stale locks from accumulating

**Issues:**
- Migration 0003 not in journal (H-1)
- `flushPendingTransactions` can leave transactions stuck in "syncing" (M-3)
- Offline carts never reconciled with server (H-3)
- `Math.random()` for short IDs (M-5)

**Recommendations:**
1. Fix migration journal (S effort)
2. Add error recovery for stuck "syncing" transactions (S effort)
3. Accept offline cart gap as documented design decision

### 6) Monitoring & Logging (Observability)

**Strengths:**
- Fastify logger enabled with structured output
- Business events logged: `sale_completed`, `oversold_detected`
- Audit log with 90-day retention, pruned to JSONL files
- Health endpoint with DB connectivity check
- SyncDot component shows sync state to users

**Issues:**
- No request IDs / correlation IDs (L-5)
- Client-side sync errors only to `console.warn` (M-8)
- No metrics or tracing hooks
- Audit log doesn't capture failed operations (only 2xx mutations)

**Recommendations:**
1. Add `@fastify/request-id` for request correlation (S effort)
2. Enhance SyncDot to show pending count and last error (S effort)
3. Consider logging failed auth attempts at warn level

### 7) Deployment & DevOps (Local-first)

**Strengths:**
- Clean `pnpm dev` / `pnpm build` / `pnpm test` via Turbo
- `.nvmrc` pins Node >=22
- `pnpm-lock.yaml` ensures reproducible installs
- Storage directories auto-created on startup
- `.env.example` with clear instructions
- `tsx watch` for API hot reload during development

**Issues:**
- `pnpm lint` doesn't work (no ESLint installed)
- No production build verification (build step not tested)
- No database backup automation (manual backup via API endpoint only)

**Recommendations:**
1. Either add ESLint or remove the lint script
2. Verify `pnpm build` produces a working production build

### 8) Configuration & Environment Management

**Strengths:**
- Fail-fast Zod env validation with clear error messages
- Cross-field validation (admin creds must be paired)
- Placeholder SESSION_SECRET explicitly rejected
- DOMAIN required in production for CORS
- Separate `.env.example` with documentation
- Config loaded once at boot, not per-request

**Issues:**
- `sessionPlugin` duplicates SESSION_SECRET validation (H-5)
- Default admin password in `.env.example` is empty (safe)
- Default admin password in actual `.env` is `changeme` (C-1)

**Recommendations:**
1. Pass validated config to sessionPlugin
2. Ensure `.env` is never committed to git

### 9) User Experience (UX)

**Strengths:**
- Cashier-facing UI entirely in Bahasa Indonesia
- Scan-first POS flow with camera viewfinder
- Masked prices with tap-hold reveal for bottom prices
- Offline banner and blocked state indicators
- Quick-amount buttons for cash payment
- Responsive mobile-first design with portrait orientation
- Accessible dialog component with focus trap and ARIA attributes

**Issues:**
- Some pages may have no loading state during async operations
- Error messages from API are sometimes raw JSON (e.g., Zod flattened errors)
- No undo/confirmation for destructive actions (abandon cart, void transaction)
- POSPage is 1324 lines — difficult to navigate and maintain

**Recommendations:**
1. Add loading spinners/skeletons for async operations
2. Map API error responses to user-friendly Bahasa Indonesia messages
3. Add confirmation dialogs for destructive actions
4. Consider splitting POSPage into smaller components

### 10) Compliance & Legal

**Strengths:**
- License field is `UNLICENSED` (proprietary, appropriate for private tool)
- Audit log tracks all mutations with user attribution
- Data retention policy document exists (`docs/data-retention-policy.md`)
- Passwords stored as bcrypt hashes, never logged

**Issues:**
- No dependency license audit
- PII (emails, display names) stored unencrypted in IDB
- No data export/delete capability for individual users
- `xlsx` package (`packages/web`) has historical licensing concerns (SheetJS community edition)

**Recommendations:**
1. Run `pnpm licenses list` to audit dependency licenses
2. Note that `xlsx` v0.18.5 is Apache-2.0 community edition — verify this is acceptable
3. Consider encryption for sensitive IDB data in future versions

### 11) Documentation & Knowledge Sharing

**Strengths:**
- Excellent PRD (`docs/01-prd.md`) as source of truth
- Implementation plan with phased milestones
- 6 ADRs documenting key architectural decisions
- Runbook for operations (`docs/03-runbook.md`)
- Progress tracking per milestone and hardening phase
- Accessibility audit report
- Previous code review reports with multiple agent inputs
- `CONTRIBUTING.md` and `CLAUDE.md` for AI-assisted development

**Issues:**
- No inline API documentation (OpenAPI schema defined but route schemas not populated)
- POSPage code lacks JSDoc for complex functions
- No "how to debug" guide for common issues
- No changelog or release notes

**Recommendations:**
1. Add Fastify route schemas for automatic OpenAPI documentation
2. Add JSDoc to complex POS flow functions
3. Create a troubleshooting section in the runbook

---

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

| Item | Effort | Category |
|---|---|---|
| Fix 2 failing `CreateCardSchema` tests (add `category` field) | S | Testing |
| Add migration 0003 to `_journal.json` | S | Reliability |
| Fix acceptance test seed count assertion (3 → 4) | S | Testing |
| Verify `.env` is not in git history; rotate secrets if needed | S | Security |
| Change admin password from `changeme` to a real password | S | Security |

### Phase 2: Short-term improvements (1–2 weeks)

| Item | Effort | Category |
|---|---|---|
| Implement photo upload endpoint (write to `PHOTO_STORAGE_PATH`) | M | Functionality |
| Add error recovery for stuck "syncing" transactions in background-sync | S | Reliability |
| Add `category` to `CreateCardPushPayloadSchema` | S | Functionality |
| Pass validated config to `sessionPlugin` instead of reading env directly | S | Security |
| Type the API client methods with proper interfaces | M | Code Quality |
| Add request IDs via `@fastify/request-id` | S | Observability |
| Remove duplicate unique indexes (`.unique()` + `uniqueIndex()`) | S | Performance |
| Add ESLint configuration or remove lint script | M | Code Quality |

### Phase 3: Longer-term refactors (2–6 weeks)

| Item | Effort | Category |
|---|---|---|
| Add POS page tests (online + offline flow) | L | Testing |
| Add cart sweeper and audit pruner job tests | M | Testing |
| Split POSPage (1324 lines) into focused sub-components | L | Code Quality |
| Add loading states and user-friendly error messages | M | UX |
| Add confirmation dialogs for destructive actions | M | UX |
| Add Fastify route schemas for OpenAPI docs | M | Documentation |
| Paginate initial sync pull for large datasets | M | Performance |
| Dependency license audit | S | Compliance |
| Replace `Math.random()` with `crypto.getRandomValues()` in QR package | S | Reliability |

---

## Appendix

### How to run/build/test locally (as verified from repo)

```bash
# Prerequisites: Node >=22, pnpm >=10
nvm use                  # reads .nvmrc
pnpm install             # install all workspace deps
pnpm dev                 # start API (tsx watch) + web (vite) in parallel
pnpm build               # build all packages (typecheck + tsc + vite build)
pnpm test                # run all tests (currently fails — 2 tests in @kolektapos/types)
pnpm typecheck           # TypeScript check (passes)
pnpm lint                # BROKEN — ESLint not installed
```

### Notable files reviewed

- `apps/api/src/server.ts` — API entry point
- `apps/api/src/config.ts` — env validation
- `apps/api/src/plugins/session.ts` — session management
- `apps/api/src/plugins/auth-guard.ts` — auth middleware
- `apps/api/src/plugins/audit.ts` — audit logging
- `apps/api/src/routes/carts.ts` — core POS cart/pay flow (550 lines)
- `apps/api/src/routes/sync.ts` — PWA sync protocol (276 lines)
- `apps/api/src/routes/flush-pending-tx.ts` — offline transaction flush (148 lines)
- `apps/api/src/routes/settlement.ts` — per-event settlement reports
- `apps/api/src/jobs/cart-sweeper.ts` — background cart cleanup
- `apps/web/src/pages/POSPage.tsx` — POS checkout flow (1324 lines)
- `apps/web/src/lib/db.ts` — IDB schema (Dexie)
- `apps/web/src/lib/background-sync.ts` — sync engine
- `apps/web/src/lib/api.ts` — API client
- `packages/db/src/schema.ts` — Drizzle schema (314 lines)
- `packages/db/src/triggers.sql` — append-only enforcement
- `packages/db/src/seed.ts` — seed data
- `packages/types/src/card.ts` — card validation schemas
- `packages/sync/src/protocol.ts` — sync protocol schemas
- `packages/sync/src/conflict.ts` — conflict resolution rules

### Dependency notes

- **`xlsx` v0.18.5** (apps/web): Apache-2.0 community edition. Used for bulk import. Consider evaluating if the license terms are acceptable for this private tool.
- **`html5-qrcode` v2.3.8** (apps/web): Apache-2.0. Used for camera scanner.
- **`bcryptjs` v3.0.2**: Pure JS bcrypt. No native compilation required. Cost factor 12 is appropriate.
- **`better-sqlite3` v11.7.0**: Native SQLite binding. Requires compilation during install.
- **`archiver` v7.0.1**: Used for backup zip creation. MIT license.
- All other dependencies appear to be standard MIT/Apache-2.0 licensed packages.
