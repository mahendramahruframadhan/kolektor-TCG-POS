# Code Review Report -- KolektaPOS

**Date:** 2026-04-24 02:20:32
**Reviewer:** OpenCode (zai-coding-plan/glm-5.1)
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `262c07e` -- 🧹 Simplify: remove dead code, extract shared util, fix perf issues

---

## Executive Summary

KolektaPOS is a well-structured monorepo implementing a local-first POS system for TCG sales booths. The architecture is sound: Fastify + SQLite backend, React + IndexedDB PWA frontend, with a clean Drizzle ORM schema, Zod-validated types, and proper sync protocol definitions. The codebase is at a mature MVP stage with end-to-end cart/checkout flows, reports, admin tooling, and background sync all wired up.

However, several issues need attention before production use. The most critical are: (1) SHA-256 password hashing support in the login path (the seed creates weak hashes, and the auth route accepts them), (2) missing admin-only guards on void/refund operations, (3) an unvalidated sync push endpoint that accepts arbitrary payload shapes, and (4) a `lastActivityAt` unit mismatch (ms vs seconds) in the POS cart creation that will cause the cart sweeper to incorrectly calculate idle TTL. The code quality is generally high with consistent patterns, but test coverage is thin outside of packages, and there are several medium-severity issues around duplicate code, missing pagination, and configuration gaps.

**Top 5 Risks:**
- **[Critical]** SHA-256 password hashing accepted in production login path -- trivially brute-forceable (`apps/api/src/routes/auth.ts:36-42`)
- **[Critical]** Void/refund transactions allowed by any authenticated user, not admin-only -- financial loss risk (`apps/api/src/routes/transactions.ts:63-78`)
- **[Critical]** Sync push endpoint accepts raw unvalidated payloads -- data injection/corruption risk (`apps/api/src/routes/sync.ts:140`)
- **[High]** `lastActivityAt` stored in milliseconds in POS cart creation but compared as seconds in cart sweeper -- carts abandoned immediately or never (`apps/web/src/pages/POSPage.tsx:609` vs `apps/api/src/jobs/cart-sweeper.ts:34`)
- **[High]** No CORS plugin on Fastify server -- PWA API calls will fail in production cross-origin deployment (`apps/api/src/server.ts`)

**Quick Wins:**
- Add `requireAdmin` preHandler to void/refund routes (1 line each)
- Add `@fastify/cors` plugin in server.ts
- Fix `POSPage.tsx:609` to use `Math.floor(Date.now() / 1000)` instead of `Date.now()`
- Remove SHA-256 auth support or gate it behind `NODE_ENV !== 'production'`
- Validate sync push payloads with Zod schemas before DB insert

---

## Scorecard (0-10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | 7/10 | Well-structured, consistent patterns, good error handling. Business logic largely correct. Deductions for auth weakness, duplicate utility functions, and minor logic bugs. |
| Testing | 4/10 | Package-level tests exist (QR, types, sync protocol, DB triggers, auth routes). No integration/e2e tests. Cart, transaction, settlement, and POS flows are untested. Web component tests are minimal. |
| Security | 4/10 | Session management is solid. But: SHA-256 auth fallback, no CORS, unvalidated sync push, no rate limiting, missing admin guards on financial operations. |
| Performance & Scalability | 6/10 | SQLite WAL mode, indexed columns, Drizzle ORM. But: no pagination on list endpoints, full-table scans on monthly reports, double-fetch in sync pull. Acceptable for 11-user single-booth use case. |
| Reliability & Stability | 7/10 | Append-only triggers, optimistic concurrency, idempotent cart/transaction creation, cart sweeper. Deductions for the ms/s timestamp bug and missing graceful shutdown. |
| Observability | 5/10 | Fastify logger enabled, audit log plugin, cart sweeper logging. But: no structured log format, no health endpoint, no metrics hooks, audit silently swallows errors. |
| Local Deployment & DevOps | 7/10 | pnpm + Turbo monorepo works well. `.env.example` provided. Vite proxy for dev. Deductions for no `build` script in API (uses `tsc`), no production start docs, dist/ committed. |
| Configuration & Environment | 6/10 | `.env` with sensible defaults, `.env.example` template. But: `UpdateSettingSchema` accepts `z.unknown()`, no startup validation beyond session secret, no config documentation. |
| UX | 7/10 | Bahasa Indonesia cashier UI, masked amounts, camera scanner, mobile-first design. Deductions for no offline error feedback banner, no loading states on some actions. |
| Compliance & Legal | 5/10 | No `LICENSE` file. No dependency attribution. PII (emails) stored without explicit data handling notes. Acceptable for private 11-user app but should be addressed. |
| Documentation & Knowledge Sharing | 6/10 | PRD and implementation plan are excellent. README is stale ("no source code yet"). No runbook for local setup. `docs/03-runbook.md` exists but not reviewed for accuracy. |

**Average Score: 5.8/10**

---

## Architecture Snapshot

**High-level components:**
- `apps/api` -- Fastify + better-sqlite3 + Drizzle ORM. REST API with session-based auth.
- `apps/web` -- React 19 + Tailwind + Vite PWA. IndexedDB (Dexie) for offline-first. TanStack Query for server state, Zustand for UI state.
- `packages/db` -- Drizzle schema + migrations + SQLite triggers (append-only enforcement).
- `packages/types` -- Zod schemas + inferred TypeScript types for all entities.
- `packages/sync` -- Sync protocol definitions (push/pull schemas) + conflict resolution rules.
- `packages/qr` -- Short card ID generation (O-XXXXX format) + validation.
- `packages/ui` -- Empty placeholder (no shared UI components yet).

**Key data flows:**
1. **Intake:** Client creates card with short ID → POST `/cards` → server stores + returns → client persists to IndexedDB.
2. **Checkout:** Scan card → add to cart (POST `/carts/:id/items`) → pay (POST `/carts/:id/pay`) → transaction + transaction_items created → cards marked sold.
3. **Sync:** Background 60s interval → GET `/sync/pull` delta → merge to IDB. POST `/sync/push` for offline-created cards/transactions.

**Notable dependencies/tech stack:**
- Fastify 5, better-sqlite3, Drizzle ORM, node-cron
- React 19, Vite 6, Dexie 4, TanStack Query 5, Zustand 5, html5-qrcode, xlsx
- Zod 3, Vitest 4, Tailwind CSS 3

---

## Findings (Prioritized)

### Critical

#### C-1. SHA-256 Password Accepted in Production Auth Path
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:36-42`
- **Problem:** The login handler accepts `sha256:` prefixed password hashes (intended for seed/dev only) without any environment gate. The seed creates the admin user with a plain SHA-256 hash, and this hash is accepted in production.
- **Impact:** SHA-256 without salt is trivially brute-forceable. If the DB is exfiltrated, all sha256-prefixed passwords are immediately crackable. The admin account is the most affected since seed creates it with this weak hash.
- **Recommendation:** Either (a) remove SHA-256 support entirely and use bcrypt in seed too, or (b) gate it behind `process.env.NODE_ENV !== 'production'`. Also, add a migration to re-hash any existing sha256 passwords on first successful bcrypt login.
- **Notes:**
  ```typescript
  // Option (b): gate behind dev-only
  if (passwordHash.startsWith("sha256:") && process.env.NODE_ENV === "production") {
    return reply.status(401).send({ error: "Password hash needs migration. Contact admin." });
  }
  ```

#### C-2. Void/Refund Transactions Allowed by Any Authenticated User
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security, Functionality
- **Location:** `apps/api/src/routes/transactions.ts:63-78`
- **Problem:** Both `POST /transactions/:id/void` and `POST /transactions/:id/refund` use `{ preHandler: requireAuth }` instead of `{ preHandler: requireAdmin }`. Any cashier can void/refund any transaction.
- **Impact:** Financial loss -- a cashier could void their own sales and pocket cash. PRD design rules imply void/refund should be admin-controlled operations.
- **Recommendation:** Change preHandler to `requireAdmin` for both routes.
- **Notes:**
  ```typescript
  app.post("/transactions/:id/void", { preHandler: requireAdmin }, async (request, reply) => { ... });
  app.post("/transactions/:id/refund", { preHandler: requireAdmin }, async (request, reply) => { ... });
  ```

#### C-3. Sync Push Endpoint Accepts Unvalidated Payloads
- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security, Data Integrity
- **Location:** `apps/api/src/routes/sync.ts:140`
- **Problem:** The sync push handler inserts `op.payload` directly into the database with `as unknown as typeof cards.$inferInsert`. No Zod validation is applied. The payload is a `Record<string, unknown>` with no shape enforcement.
- **Impact:** Malicious or buggy clients can inject arbitrary fields, overwrite protected columns, or insert malformed data. Bypasses all the Zod schemas defined in `packages/types`.
- **Recommendation:** Validate each op with the appropriate Zod schema before insert. Map `op.type` to the corresponding schema (e.g., `create_card` → `CreateCardSchema`).
- **Notes:**
  ```typescript
  case "create_card": {
    const parsed = CreateCardSchema.safeParse(op.payload);
    if (!parsed.success) {
      results.push({ clientId: op.clientId, status: "rejected", reason: parsed.error.message });
      break;
    }
    // ... insert parsed.data instead of op.payload
  }
  ```

#### C-4. Cart `lastActivityAt` Unit Mismatch (ms vs seconds)
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality, Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:609` vs `apps/api/src/jobs/cart-sweeper.ts:34`
- **Problem:** When the POS page creates a local cart in IndexedDB (`POSPage.tsx:609`), it sets `lastActivityAt: Date.now()` which returns **milliseconds**. The cart sweeper (`cart-sweeper.ts:34`) computes `cutoffSec = nowSec - ttlMinutes * 60` using **seconds**. The server-side cart creation (`carts.ts:59`) correctly uses `Math.floor(Date.now() / 1000)`.
- **Impact:** If the client creates the cart (offline), the `lastActivityAt` will be ~1.7 trillion (ms). The sweeper compares this against a cutoff of ~1.7 billion (seconds). Since `1.7T > 1.7B`, the cart will **never** be swept as idle. Conversely, if the cart were somehow stored with seconds but compared with ms-based values, it would be swept immediately.
- **Recommendation:** Change `POSPage.tsx:609` to `lastActivityAt: Math.floor(Date.now() / 1000)`.
- **Notes:** This also affects `POSPage.tsx:665` where `lockedAt: Date.now()` is used (same ms/seconds issue for the lock timestamp).

---

### High

#### H-1. No CORS Plugin on Fastify Server
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security, Configuration
- **Location:** `apps/api/src/server.ts`
- **Problem:** `@fastify/cors` is not registered. In production, the PWA will be served from `pos.kolekta.id` and the API must accept cross-origin requests. In dev, Vite proxy handles this, but production needs CORS headers.
- **Impact:** PWA cannot communicate with the API server in production deployment.
- **Recommendation:** Install `@fastify/cors` and register it with appropriate origin.
- **Notes:**
  ```typescript
  import cors from "@fastify/cors";
  await app.register(cors, { origin: process.env.DOMAIN ? `https://${process.env.DOMAIN}` : true, credentials: true });
  ```

#### H-2. No Rate Limiting on Login Endpoint
- **Severity / Confidence / Effort:** High / High / M
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:16`
- **Problem:** `POST /auth/login` has no rate limiting or account lockout mechanism.
- **Impact:** Brute-force attacks against passwords, especially the weak SHA-256 seeded passwords.
- **Recommendation:** Add `@fastify/rate-limit` or a simple in-memory rate limiter for login attempts.

#### H-3. Short ID Uniqueness Not Checked on Card Creation
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality, Data Integrity
- **Location:** `apps/api/src/routes/cards.ts:57-58`
- **Problem:** `POST /cards` checks for `clientId` uniqueness but does NOT check if `shortId` already exists before inserting. The sync push endpoint (`sync.ts:130-136`) does check for duplicate short IDs, but the direct card creation route doesn't.
- **Impact:** Two cards with the same short ID could be created via the REST API, violating the unique constraint at the DB level (which would throw a 500 error, not a graceful 409).
- **Recommendation:** Add a short ID uniqueness check before insert in `cards.ts`, similar to the sync push path.
- **Notes:**
  ```typescript
  const shortIdExists = db.select().from(cards).where(eq(cards.shortId, body.data.shortId)).get();
  if (shortIdExists) {
    return reply.status(409).send({ error: "Short ID already exists", existingCardId: shortIdExists.id });
  }
  ```

#### H-4. Duplicate `getCartIdleTtl` Function
- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Code Quality, Maintainability
- **Location:** `apps/api/src/routes/carts.ts:23-35` and `apps/api/src/jobs/cart-sweeper.ts:10-22`
- **Problem:** The `getCartIdleTtl` / `getCartIdleTtlMinutes` function is duplicated across two files with identical logic.
- **Impact:** If the logic changes (e.g., adding a new setting key or default), both copies must be updated. Risk of divergence.
- **Recommendation:** Extract to a shared utility module (e.g., `apps/api/src/utils/settings.ts`) and import from both consumers.

#### H-5. Sync Pull Fetches All Cards Twice on Initial Sync
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Performance
- **Location:** `apps/api/src/routes/sync.ts:51-56`
- **Problem:** The initial pull (`cursor === 0`) fetches `cardRows` filtered by `status === 'sold'` (line 54, with an incorrect comment saying "non-sold + available"), then immediately fetches `allCards` unconditionally (line 56). The `cardRows` variable is never used.
- **Impact:** Wasted query on initial sync. Double data transfer for cards.
- **Recommendation:** Remove the unused `cardRows` query (lines 51-55) and keep only `allCards`.

#### H-6. `packages/db/src/test-setup.ts` Uses `require()` in ESM Module
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality, Testing
- **Location:** `packages/db/src/test-setup.ts:7-8`
- **Problem:** Uses `require('node:crypto')` with `@ts-ignore` in a package with `"type": "module"` and `verbatimModuleSyntax: true` in tsconfig. This will fail at runtime.
- **Impact:** DB package tests may fail to run or silently skip the crypto setup.
- **Recommendation:** Use `await import('node:crypto')` instead of `require()`, matching the pattern in `apps/api/src/test-setup.ts`.

#### H-7. No Graceful Shutdown for Cart Sweeper Cron
- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Reliability
- **Location:** `apps/api/src/server.ts:60` and `apps/api/src/jobs/cart-sweeper.ts:29`
- **Problem:** `startCartSweeper` returns a `ScheduledTask` but it's not stored or stopped on process exit. The server has no SIGTERM/SIGINT handler.
- **Impact:** On process restart, the cron task may not clean up properly. SQLite WAL file may not be checkpointed.
- **Recommendation:** Store the task reference and add process signal handlers.
- **Notes:**
  ```typescript
  const sweeperTask = startCartSweeper(db);
  process.on("SIGTERM", async () => { sweeperTask.stop(); await app.close(); process.exit(0); });
  ```

---

### Medium

#### M-1. `GRADING_COMPANIES` Mismatch Between Client and Server
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality, Data Integrity
- **Location:** `apps/web/src/pages/IntakePage.tsx:98` vs `packages/types/src/card.ts:15`
- **Problem:** IntakePage offers `ACE` as a grading company option, but the Zod schema in `card.ts` defines `SGC` instead. The schema validates server-side, so `ACE` submissions would be rejected.
- **Impact:** Users can select "ACE" in the intake form but the API will reject it.
- **Recommendation:** Align both lists. Either add `ACE` to the schema or replace it with `SGC` in the UI.

#### M-2. `UpdateSettingSchema` Accepts `z.unknown()` -- No Validation
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security, Configuration
- **Location:** `packages/types/src/settings.ts:4`
- **Problem:** The `UpdateSettingSchema` defines `value: z.unknown()`, allowing any value to be stored in settings.
- **Impact:** Malformed settings values could break downstream consumers (e.g., `getCartIdleTtlMinutes` expects a number). A bad actor could inject arbitrary JSON.
- **Recommendation:** Create typed schemas for known settings keys, or at minimum validate that the value is a primitive (string, number, boolean).

#### M-3. No Pagination on List Endpoints
- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Performance, Scalability
- **Location:** `apps/api/src/routes/cards.ts:16`, `apps/api/src/routes/transactions.ts:24-31`, `apps/api/src/routes/users.ts:16`
- **Problem:** All list endpoints return complete datasets with no pagination. `GET /cards` returns all cards, `GET /transactions` returns all transactions.
- **Impact:** At scale (thousands of cards/transactions), responses will be large and slow. For the 11-user single-booth use case this is acceptable initially but will degrade with data accumulation.
- **Recommendation:** Add `limit`/`offset` query parameters with sensible defaults (e.g., 100 items max).

#### M-4. Monthly Report Loads All Transactions Into Memory
- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Performance
- **Location:** `apps/api/src/routes/settlement.ts:175-176`
- **Problem:** `GET /reports/monthly` fetches ALL transactions from the DB (`db.select().from(transactions).all()`) then filters in JavaScript.
- **Impact:** As transaction count grows, this becomes increasingly expensive. The DB should filter by date range.
- **Recommendation:** Use Drizzle's `between()` or `gt()/lt()` to filter at the SQL level instead of in-memory.

#### M-5. `settings.ts` GET Endpoint `JSON.parse` Without try/catch
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/settings.ts:18`
- **Problem:** `JSON.parse(row.valueJson)` is called without error handling. If a settings row has malformed JSON, the entire `/settings` endpoint returns a 500.
- **Impact:** A single malformed setting breaks the settings page for all users.
- **Recommendation:** Wrap in try/catch and skip/log malformed entries.

#### M-6. Audit Plugin Silently Swallows All Errors
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Observability
- **Location:** `apps/api/src/plugins/audit.ts:35-37`
- **Problem:** The audit `catch` block is completely empty -- no logging at all.
- **Impact:** Audit failures are invisible. If the audit_log table is corrupted or triggers block inserts, there's no way to detect it.
- **Recommendation:** Add at minimum `console.error("[audit] Failed to write audit log:", err);` or use Fastify's logger.

#### M-7. Test Files Not Excluded from TypeScript Compilation
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Build, Configuration
- **Location:** `apps/api/tsconfig.json`, `packages/db/tsconfig.json`
- **Problem:** Test files (e.g., `*.test.ts`) are not excluded from `tsc` compilation. The `tsconfig.json` files inherit `exclude: ["node_modules", "dist", "build", ".turbo"]` from base but don't exclude test files. This means `tsc` type-checks test-specific imports (like `vitest`, `@testing-library/react`) that may not be in the package's dependencies.
- **Impact:** Build may fail or produce unwanted `.js` files for test modules.
- **Recommendation:** Add `"test": true` to tsconfig or add `*.test.ts` to excludes.

#### M-8. Payment Channel Update Doesn't Bump `updatedAt`
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality
- **Location:** `apps/api/src/routes/payment-channels.ts:39`
- **Problem:** `PATCH /payment-channels/:id` calls `.set(body.data)` without adding `updatedAt`. Other update endpoints (cards, events, users) correctly set `updatedAt`.
- **Impact:** Payment channel changes won't be detected by delta sync (which uses `updatedAt > cursor`).
- **Recommendation:** Add `updatedAt: Math.floor(Date.now() / 1000)` to the `.set()` call.

#### M-9. `packages/ui` Is an Empty Package
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Code Quality
- **Location:** `packages/ui/package.json`
- **Problem:** The `@kolektapos/ui` package contains only a bare `package.json` with no source files, no exports, and no scripts.
- **Impact:** Adds unnecessary workspace overhead. The PRD mentions shadcn/ui components should live here but none exist.
- **Recommendation:** Either populate it with shared components or remove it from the workspace until needed.

#### M-10. No `LICENSE` File
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Compliance & Legal
- **Location:** Repository root
- **Problem:** No `LICENSE` file exists in the repository.
- **Impact:** Legal ambiguity about usage rights. Even for a private project, a license file clarifies ownership and terms.
- **Recommendation:** Add a LICENSE file appropriate for a private/closed-source project.

---

### Low

#### L-1. `README.md` Is Stale
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Documentation
- **Location:** `README.md:25`
- **Problem:** README says "Pre-implementation. Monorepo scaffold only; no source code yet." but the repo now has substantial implementation.
- **Recommendation:** Update README with actual setup/run instructions, current status, and architecture overview.

#### L-2. `dist/` Directory Committed for `apps/web`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Build, Code Quality
- **Location:** `apps/web/dist/`
- **Problem:** Built JavaScript files from `apps/web/dist/` are committed to the repository. These should be generated at build time.
- **Impact:** Repository bloat, potential for stale build artifacts.
- **Recommendation:** Add `apps/web/dist/` to `.gitignore` (it's already covered by the root-level `dist` entry, but verify these files are actually tracked).

#### L-3. SQLite Database Files Present in `apps/api/storage/`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Code Quality
- **Location:** `apps/api/storage/kolektapos.sqlite*`
- **Problem:** The SQLite database file and its WAL/SHM files are present in the repo directory. While `.gitignore` has `*.sqlite*` and `storage/`, these files are on disk and may have been committed before the gitignore rules.
- **Impact:** Risk of committing database files with test/development data.
- **Recommendation:** Verify these are not tracked with `git ls-files apps/api/storage/`.

#### L-4. `Uuid` Used Instead of `crypto.randomUUID()` in Web App
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Dependencies
- **Location:** `apps/web/src/pages/POSPage.tsx:9`, `apps/web/src/pages/IntakePage.tsx:3`
- **Problem:** The `uuid` package is imported for UUID generation, but `crypto.randomUUID()` is available in all modern browsers and already used in the API server.
- **Impact:** Unnecessary dependency.
- **Recommendation:** Replace `uuid` usage with `crypto.randomUUID()` to reduce bundle size.

#### L-5. `xlsx` Dependency Is Heavy for Bulk Import Only
- **Severity / Confidence / Effort:** Low / Medium / M
- **Category:** Performance, Dependencies
- **Location:** `apps/web/package.json:28`
- **Problem:** The `xlsx` package is a full-featured spreadsheet library (~2MB) used only for bulk card import.
- **Impact:** Increases PWA bundle size significantly.
- **Recommendation:** Consider dynamic import (`import('xlsx')`) or a lighter alternative to avoid loading it on the main bundle.

#### L-6. Receipt Print Window Uses `document.write`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Code Quality
- **Location:** `apps/web/src/pages/POSPage.tsx:351-381`
- **Problem:** The receipt print function uses `document.write()` which is a deprecated pattern and can cause issues with some browser extensions.
- **Impact:** Minor -- works in practice but not best practice.
- **Recommendation:** Consider using `Blob` + `URL.createObjectURL()` or an iframe approach instead.

#### L-7. `@ts-ignore` Used in `packages/db/src/test-setup.ts`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Code Quality
- **Location:** `packages/db/src/test-setup.ts:8`
- **Problem:** `@ts-ignore` suppresses a TypeScript error that should be fixed properly.
- **Impact:** Masks type safety issues.
- **Recommendation:** Fix the type issue properly when migrating to `await import()`.

#### L-8. `cameraScanner` Module-Level Counter Not Safe for HMR
- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Functionality (Dev Only)
- **Location:** `apps/web/src/components/CameraScanner.tsx:12`
- **Problem:** `let counter = 0` is module-level state. During Vite HMR, the module may not be re-evaluated, leading to duplicate DOM IDs.
- **Impact:** Only affects development. In production, each mount gets a unique ID.
- **Recommendation:** Use `useId()` from React 19 or a ref-based counter.

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths:**
- Clean monorepo structure with well-separated concerns (db, types, sync, qr)
- Zod schemas enforce runtime validation at API boundaries
- Optimistic concurrency via `version` field is consistently implemented across mutable entities
- Append-only triggers for transactions/transaction_items/audit_log at the DB level provide strong data integrity guarantees
- Idempotent operations via `clientId` on cards, carts, and transactions
- Cart-locking is denormalized onto `cards` for fast lookup, as specified by PRD
- Owner snapshot (`ownerUserIdSnapshot`) correctly used in settlement calculations

**Issues:**
- SHA-256 auth fallback (C-1) undermines the otherwise solid bcrypt-based auth
- Void/refund lacks admin guard (C-2)
- Cart timestamp unit mismatch (C-4) will cause sweep bugs
- Duplicate utility functions across files
- GRADING_COMPANIES mismatch between client and server
- Payment channel update doesn't set `updatedAt`, breaking delta sync

**Recommendations:**
- Fix C-1 through C-4 as immediate priorities
- Extract shared utilities (`getCartIdleTtl`, `formatTimestamp`) into common modules
- Add integration tests for the complete checkout flow (cart create → add items → pay → receipt)

### 2) Testing

**Strengths:**
- Unit tests exist for QR generation/validation (comprehensive)
- Zod schema tests for card types (valid/invalid fixed/negotiable cards)
- Sync protocol schema tests
- DB trigger tests for append-only enforcement
- Auth route integration tests (login/logout/me)
- MaskedAmount component tests
- useTapHoldReveal hook tests

**Issues:**
- **No tests for cart operations** (create, add item, remove item, pay, abandon) -- this is the most critical business flow
- **No tests for transaction void/refund** -- financial operations
- **No tests for settlement calculations** -- payout accuracy
- **No tests for sync push/pull** -- data consistency
- **No tests for holds** (create, release, expire)
- **No tests for reports** (daily, monthly, inventory value)
- Auth tests share state between test cases (no isolation)
- Test setup in `packages/db` uses `require()` which may not work with ESM

**Recommendations:**
- Prioritize cart integration tests (highest business value)
- Add test isolation via per-test database instances
- Add tests for void/refund authorization (admin vs cashier)
- Add settlement calculation tests with known data
- Consider using `beforeEach` with fresh DB instances instead of `beforeAll` shared state

### 3) Security

**Strengths:**
- Session management with `@fastify/session` + `@fastify/cookie` with proper settings (httpOnly, sameSite, 30-day rolling)
- SESSION_SECRET minimum length enforced (32 chars)
- bcrypt with cost factor 12 for production passwords
- Auth guard middleware (`requireAuth`, `requireAdmin`)
- Input validation via Zod on most routes
- `.env` excluded from git

**Issues:**
- SHA-256 auth fallback (C-1) -- critical
- No CORS plugin (H-1) -- API inaccessible in production cross-origin
- No rate limiting on login (H-2)
- Void/refund not admin-only (C-2)
- Sync push unvalidated (C-3) -- data injection
- No CSRF protection (mitigated by sameSite cookies + API-only usage)
- Audit log stores up to 2000 chars of response payload (`audit.ts:32`) which could contain sensitive data
- Admin password defaults to "changeme" in seed (`seed.ts:63`) -- must be changed immediately

**Recommendations:**
- Fix C-1, C-2, C-3 as immediate priorities
- Add `@fastify/cors` (H-1)
- Add rate limiting on auth endpoints (H-2)
- Redact sensitive fields from audit log payloads
- Document that ADMIN_PASSWORD must be changed from default

### 4) Performance & Scalability

**Strengths:**
- SQLite WAL mode for concurrent reads
- Indexed columns on frequently queried fields (cards.status, cards.ownerUserId, transactions.eventId, etc.)
- Drizzle ORM generates efficient SQL
- IndexedDB (Dexie) on client with indexed fields for fast local queries
- Dexie `bulkPut` for batch sync operations

**Issues:**
- No pagination on list endpoints (M-3)
- Monthly report loads all transactions (M-4)
- Initial sync double-fetches cards (H-5)
- Cart sweeper releases locks one-by-one in a loop instead of batch (could use `inArray`)
- No database connection pooling configuration (better-sqlite3 is synchronous, so less relevant, but WAL settings could be tuned)
- Vite build includes `xlsx` in the main bundle

**Recommendations:**
- Remove unused `cardRows` query in sync pull (H-5)
- Add SQL-level date filtering for monthly report (M-4)
- Consider batch card lock release in cart sweeper using `inArray`
- Lazy-load `xlsx` via dynamic import
- For the 11-user scale, current performance is adequate; these are improvements for data accumulation over time

### 5) Reliability & Stability

**Strengths:**
- Append-only transactions enforced at DB level (triggers) AND respected in code (never UPDATE/DELETE)
- Optimistic concurrency via `version` field prevents silent overwrites
- Idempotent operations via `clientId` on all creatable entities
- DB transactions used for multi-table operations (cart pay, void/refund, cart abandon)
- Cart sweeper with TTL-based cleanup
- Best-effort offline handling in POS page (continues local cleanup even if server fails)

**Issues:**
- Cart `lastActivityAt` unit mismatch (C-4) breaks sweep logic
- No graceful shutdown (H-7)
- Audit plugin silently swallows errors (M-6)
- Settings `JSON.parse` without try/catch (M-5)
- No retry logic on sync push failures (individual ops are atomic but no retry at batch level)
- POS page catches errors with empty catch blocks (`POSPage.tsx:720-722`, `POSPage.tsx:767-769`)

**Recommendations:**
- Fix C-4 timestamp unit mismatch
- Add graceful shutdown handlers (H-7)
- Add error logging in audit plugin catch
- Add try/catch around `JSON.parse` in settings
- Consider adding retry logic for failed sync push ops

### 6) Monitoring & Logging (Observability)

**Strengths:**
- Fastify logger enabled (`logger: true` in `build()`)
- Audit log plugin captures mutating operations
- Cart sweeper logs sweep results
- Background sync logs warnings on failure

**Issues:**
- No structured log format (plain console.log in cart sweeper)
- No health check endpoint
- No metrics or tracing hooks
- Audit plugin silently swallows errors (M-6)
- Client-side sync errors logged to console only (no user-facing feedback)
- No request correlation IDs

**Recommendations:**
- Add `GET /health` endpoint returning DB connectivity + basic stats
- Use Fastify's logger (`request.log`) consistently instead of `console.log`
- Add user-facing sync status indicator (partially done with `SyncDot` component)
- Log audit failures instead of silently swallowing them

### 7) Deployment & DevOps (Local-first)

**Strengths:**
- Standard Turbo + pnpm monorepo with well-defined task pipeline
- Vite dev server with proxy configuration for API
- `.nvmrc` pins Node version (22)
- `pnpm-lock.yaml` ensures reproducible installs
- Drizzle migrations run on server startup

**Issues:**
- API `build` script uses `tsc` which outputs to `dist/` but the `start` script runs `node dist/server.js` -- however, test files may also be compiled
- No production build/start documentation
- `apps/web/dist/` contains pre-built files that may be stale
- No production static file serving configuration (need to serve the PWA build from the API server or a reverse proxy)

**Recommendations:**
- Document how to build and run in production mode
- Add a `serve` script or reverse proxy config for serving the built PWA
- Verify that `tsc` excludes test files from compilation output
- Clean up `apps/web/dist/` and ensure it's in `.gitignore`

### 8) Configuration & Environment Management

**Strengths:**
- `.env.example` documents all required variables
- `.env` is in `.gitignore`
- SESSION_SECRET minimum length validated at startup
- Sensible defaults (PORT 3001, 30-minute cart TTL)

**Issues:**
- `UpdateSettingSchema` accepts any value (`z.unknown()`) -- no validation
- No validation of `DOMAIN` or `PORT` format at startup
- Default admin password "changeme" is not flagged as insecure
- No documentation of all config variables and their effects
- `packages/ui` empty package serves no purpose

**Recommendations:**
- Validate settings values with per-key schemas
- Warn if SESSION_SECRET matches the `.env.example` value
- Document all configuration variables

### 9) User Experience (UX)

**Strengths:**
- Mobile-first design with rounded corners, generous touch targets
- Bahasa Indonesia cashier-facing UI as specified by PRD
- Bottom price masking with tap-and-hold reveal (5s auto-hide)
- Camera QR scanner integration
- Quick cash amount buttons in payment modal
- Masked amounts with eye-icon toggle
- Receipt printing with formatted popup window

**Issues:**
- No visual offline indicator when network is unavailable (SyncDot exists but no prominent banner)
- No feedback when background sync fails
- Login page has English "Email address" label while rest is Bahasa Indonesia
- No empty state guidance when no active event exists (POS page should prompt to create/activate event)
- Cart abandon button is small and easy to accidentally tap

**Recommendations:**
- Add prominent offline/online status banner
- Localize all UI text consistently to Bahasa Indonesia
- Add guidance when POS can't create cart (no active event)
- Consider a confirmation dialog for cart abandon

### 10) Compliance & Legal

- No `LICENSE` file in repository
- No dependency attribution or license audit
- User emails stored in plaintext in `users` table (acceptable for 11 known users)
- No data retention policy documented
- Audit log captures response payloads (up to 2000 chars) which may contain PII
- No cookie consent (not needed for private app, but worth noting)

**Recommendations:**
- Add a LICENSE file
- Run a dependency license audit
- Consider redacting email addresses from audit log payloads
- Document data retention expectations

### 11) Documentation & Knowledge Sharing

**Strengths:**
- Excellent PRD (`docs/01-prd.md`) with detailed architecture, business rules, and feature specifications
- Implementation plan with milestone tracking
- CLAUDE.md provides clear guidance for AI-assisted development
- Milestone progress files (m1 through m9)

**Issues:**
- README is stale ("no source code yet")
- No local setup/run guide in README
- No troubleshooting documentation
- No architecture diagram or module dependency map
- PRD references features by ID (F1, F2, etc.) but there's no quick-reference feature index

**Recommendations:**
- Update README with current status, setup instructions, and how to run dev/build/test
- Add a brief architecture overview to README
- Create a feature ID quick-reference table

---

## Recommended Action Plan

### Phase 1: Immediate Fixes (0-3 days)

| Item | Effort | Description |
|---|---|---|
| Fix void/refund admin guard | S | Add `requireAdmin` to void/refund routes (`transactions.ts:63-78`) |
| Fix SHA-256 auth gate | S | Gate SHA-256 behind dev-only or remove entirely (`auth.ts:36-42`) |
| Fix `lastActivityAt` unit | S | Change `Date.now()` to `Math.floor(Date.now() / 1000)` in `POSPage.tsx:609,665` |
| Add CORS plugin | S | Install + register `@fastify/cors` in `server.ts` |
| Remove dead sync query | S | Delete unused `cardRows` query in `sync.ts:51-55` |
| Fix `test-setup.ts` ESM | S | Replace `require()` with `await import()` in `packages/db/src/test-setup.ts` |
| Add short ID uniqueness check | S | Check `shortId` before insert in `cards.ts` POST handler |

### Phase 2: Short-term Improvements (1-2 weeks)

| Item | Effort | Description |
|---|---|---|
| Validate sync push payloads | M | Add Zod validation to sync push endpoint for each op type |
| Add rate limiting | M | Install `@fastify/rate-limit` and configure for auth endpoints |
| Add graceful shutdown | S | Store sweeper task, add SIGTERM/SIGINT handlers |
| Fix GRADING_COMPANIES mismatch | S | Align client and server grading company lists |
| Fix payment channel `updatedAt` | S | Add timestamp to PATCH handler |
| Add `JSON.parse` error handling | S | Wrap settings.ts parse in try/catch |
| Add health endpoint | S | Implement `GET /health` |
| Update README | M | Rewrite with current status, setup, architecture |
| Add LICENSE | S | Add appropriate license file |

### Phase 3: Longer-term Refactors (2-6 weeks)

| Item | Effort | Description |
|---|---|---|
| Add cart integration tests | M | Test full cart lifecycle (create → add → pay → void) |
| Add settlement calculation tests | M | Verify payout accuracy with known data |
| Add pagination to list endpoints | M | Implement limit/offset with defaults |
| Optimize monthly report query | M | Add SQL-level date filtering |
| Extract shared utilities | S | Create `utils/settings.ts` for shared `getCartIdleTtl` |
| Validate settings values | M | Create per-key schemas for known settings |
| Lazy-load xlsx | S | Dynamic import for bulk import only |
| Remove uuid dependency | S | Replace with `crypto.randomUUID()` in web app |
| Add offline status banner | M | Prominent UI indicator for network state |
| Populate `packages/ui` | L | Extract shared components (StatusBadge, MobileAppBar, etc.) |

---

## Appendix

### How to Run/Build/Test Locally

**Prerequisites:** Node >= 22, pnpm >= 10

```bash
# Install dependencies
pnpm install

# Development (both API and web)
pnpm dev

# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Build
pnpm build
```

**API server** starts on `http://localhost:3001` (configured via `.env` PORT).
**Web dev server** starts on `http://localhost:5173` (Vite default) with proxy to API.

**First run:** Copy `.env.example` to `.env`, then `pnpm dev`. The API auto-runs migrations and seeds on startup.

### Notable Files Reviewed

**API:**
- `apps/api/src/server.ts` -- App bootstrap
- `apps/api/src/plugins/session.ts` -- Session management
- `apps/api/src/plugins/auth-guard.ts` -- Auth middleware
- `apps/api/src/plugins/audit.ts` -- Audit logging
- `apps/api/src/routes/auth.ts` -- Authentication
- `apps/api/src/routes/cards.ts` -- Card CRUD
- `apps/api/src/routes/carts.ts` -- Cart operations + pay
- `apps/api/src/routes/transactions.ts` -- Transaction void/refund
- `apps/api/src/routes/sync.ts` -- Sync push/pull
- `apps/api/src/routes/settlement.ts` -- Reports + settlement
- `apps/api/src/routes/backup.ts` -- DB backup download
- `apps/api/src/jobs/cart-sweeper.ts` -- Background cart cleanup

**Web:**
- `apps/web/src/App.tsx` -- Router + auth guards
- `apps/web/src/pages/POSPage.tsx` -- Main POS checkout flow
- `apps/web/src/pages/LoginPage.tsx` -- Login
- `apps/web/src/pages/DashboardPage.tsx` -- Dashboard
- `apps/web/src/pages/IntakePage.tsx` -- Card intake
- `apps/web/src/pages/InventoryPage.tsx` -- Inventory browser
- `apps/web/src/pages/ReportsPage.tsx` -- Reports
- `apps/web/src/lib/db.ts` -- IndexedDB schema (Dexie)
- `apps/web/src/lib/sync.ts` -- Initial sync
- `apps/web/src/lib/background-sync.ts` -- Delta sync
- `apps/web/src/lib/api.ts` -- API client
- `apps/web/src/store/auth.ts` -- Auth state (Zustand)
- `apps/web/src/store/pos.ts` -- POS state (Zustand)

**Packages:**
- `packages/db/src/schema.ts` -- Drizzle schema (all tables)
- `packages/db/src/triggers.sql` -- Append-only enforcement
- `packages/db/src/migrate.ts` -- Migration runner
- `packages/db/src/seed.ts` -- Initial data seeding
- `packages/types/src/*.ts` -- Zod schemas for all entities
- `packages/sync/src/protocol.ts` -- Sync protocol definitions
- `packages/sync/src/conflict.ts` -- Conflict resolution rules
- `packages/qr/src/index.ts` -- Short ID generation

### Dependency Notes

| Package | Version | Notes |
|---|---|---|
| fastify | ^5.2.1 | Latest major. No known vulnerabilities. |
| better-sqlite3 | ^11.7.0 | Native addon. Requires build tools. |
| drizzle-orm | ^0.38.4 | Rapidly evolving API. Pin if possible. |
| react | ^19.0.0 | React 19 stable. |
| xlsx | ^0.18.5 | Large dependency (~2MB). Consider lighter alternative. |
| uuid | ^11.0.5 | Unnecessary -- `crypto.randomUUID()` available in target environments. |
| html5-qrcode | ^2.3.8 | Scanning library. Works but has known issues with some Android devices. |
| bcryptjs | ^3.0.2 | Pure JS bcrypt. Consider native `bcrypt` for better performance. |
| zod | ^3.24.1 | Core validation. Well-maintained. |
| vitest | ^4.1.5 | Test framework. Well-configured workspace setup. |
