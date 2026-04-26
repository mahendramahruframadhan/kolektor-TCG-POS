# Code Review Report – KolektaPOS

**Date:** 2026-04-26 10:09:10
**Reviewer:** Claude Sonnet 4.6 (automated full-repo review)
**Scope:** Full repository — source code, config, tests, docs. CI/CD ignored; local-first focus.
**Commit/Version:** `9bedc2f` (HEAD) — feat(offline): POS offline cart and payment queue

---

## Executive Summary

KolektaPOS is a well-architected, local-first PWA+API for a private TCG booth. The codebase is clean, consistent, and shows thoughtful implementation of the PRD constraints: append-only transactions are enforced at DB (triggers) and ORM level, idempotency is handled via `clientId` UUIDs throughout, and session auth uses secure defaults (bcrypt cost-12, `sameSite=strict`, 30-day rolling). The offline work merged in recent commits is structurally sound.

However, the test suite currently has **2 failing tests** (a clear `Critical` that blocks release), the `category` field added in migration 0003 was not propagated to all sync schemas, the offline flush endpoint fully trusts client-computed monetary amounts, and the photo upload endpoint is an unimplemented stub. None of these are "soft" issues — they need to be fixed before the first event.

**Top 5 risks:**
- **[Critical]** 2 `CreateCardSchema` tests fail due to missing `category` field — test suite is broken
- **[Critical]** `CreateCardPushPayloadSchema` (sync push) is missing `category` — partial incompatibility with updated schema
- **[High]** `/sync/flush-pending-tx` trusts client-supplied `soldPriceIdr`/`totalIdr` — offline sale amounts are unvalidated
- **[High]** Photo upload endpoint (`POST /sync/photo/:cardClientId`) is a hardcoded stub — no actual file I/O
- **[High]** Delta sync pull (`cursor > 0`) never emits `transaction_items` — line-item data invisible after initial load

**Quick wins (30 min or less each):**
- Add `category: z.string().default("")` to `CreateCardPushPayloadSchema` and fix the 2 failing tests
- Open `backup.ts` connection with `{ readonly: true }`
- Add `config: { rateLimit: ... }` to `/sync/flush-pending-tx`
- Guard `handleRemoveItem` in `POSPage.tsx` to skip API call when `activeCartIsOffline`

---

## Scorecard (0–10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | 7/10 | Architecture is excellent; stub in photo upload, category propagation gap, and remove-item offline bug hurt |
| Testing | 5/10 | Good API integration tests for critical paths; 2 tests failing; no frontend tests beyond hooks; missing coverage for discount math, settlement edge cases |
| Security | 8/10 | bcrypt, session hardening, input validation with Zod, redaction in audit log all good; client-trusted amounts in flush path is the main gap |
| Performance & Scalability | 7/10 | SQLite is fine for 11 users; `SELECT * FROM cards` unbounded on initial pull is acceptable at this scale; no debounce on `ProductSearch` IDB scan |
| Reliability & Stability | 7/10 | Good transactionality; delta sync missing `transaction_items`; `handleAbandonCart` silently diverges from server state offline |
| Observability | 7/10 | Structured logging on sale events and oversold; audit log with retention/archive; audit entity parsing unreliable for nested routes |
| Local Deployment & DevOps | 8/10 | Clean Turbo monorepo; good env validation at boot; `.env.example` documented; `pnpm dev` works |
| Configuration & Environment | 8/10 | Centralised Zod schema in `config.ts`; fails fast; placeholder detection good; dev `.env` has weak `ADMIN_PASSWORD=changeme` |
| UX | 8/10 | Mobile-first POS UI with scan-first flow; bottom-price reveal with keyboard support; offline warnings shown; receipt print stub works |
| Compliance & Legal | 7/10 | Data retention policy documented; `ownerUserIdSnapshot` design correct; audit archive JSONL; no PII masking in sync response for user data |
| Documentation & Knowledge Sharing | 9/10 | Excellent ADRs, milestone progress docs, PRD, runbook; CLAUDE.md well-maintained |

**Average Score: 7.4/10**

Overall judgement: **Near ship-ready for first event with 3 Critical/High fixes (failing tests, category sync schema, flush price validation).** The photo stub needs a note in the runbook if feature is intended for v1.

---

## Architecture Snapshot

**Components:**
- `apps/api` — Fastify 5 + better-sqlite3 + Drizzle ORM; session-cookie auth; cron jobs for cart sweeper + audit pruner
- `apps/web` — React 19 + Tailwind + Vite PWA; Dexie 4 (IndexedDB); TanStack Query; Zustand stores
- `packages/db` — Drizzle schema, migrations, triggers, seed
- `packages/sync` — Zod schemas for push/pull protocol
- `packages/types` — Zod schemas for all business entities
- `packages/qr` — Short ID generation/validation

**Key data flows:**
1. Login → session cookie → API calls → delta sync into IDB
2. POS: scan QR → IDB lookup → add to cart (API or IDB-only offline) → pay (API or pendingTransactions IDB) → background flush on reconnect
3. Sync: `startBackgroundSync()` every 60s — `flushPendingTransactions()` then `deltaSyncPull()`

**Notable dependencies:**
- `@fastify/session` for server-side session storage (in-memory, resets on restart — expected for this use case)
- `xlsx` for bulk import/export
- `html5-qrcode` for camera scanning
- `archiver` for zip backup generation

---

## Findings (Prioritized)

---

### Critical

---

#### [C-1] Test suite fails — `CreateCardSchema` requires `category` but tests don't supply it

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Testing / Functionality
- **Location:** `packages/types/src/card.test.ts:15,29` / `packages/types/src/card.ts:24`
- **Problem:** `CreateCardSchema` was updated to require `category: z.string().min(1)` but the two "happy path" tests in `card.test.ts` don't include the `category` field. Both tests assert `success === true` but receive `false`.
- **Impact:** `pnpm test` exits non-zero; prevents CI from passing if added; masks real regressions.
- **Recommendation:** Add `category: "Pokemon"` (or any non-empty string) to the two failing test fixtures.
- **Example Fix:**
  ```ts
  // card.test.ts line 6-14
  const card = {
    clientId: "550e8400-e29b-41d4-a716-446655440000",
    shortId: "0-ABC12",
    ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
    stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
    title: "Pikachu",
    category: "Pokemon",   // ← add this
    pricingMode: "fixed",
    priceIdr: 50000,
  };
  ```

---

#### [C-2] `CreateCardPushPayloadSchema` in sync push is missing `category` field

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality / Reliability
- **Location:** `apps/api/src/routes/sync.ts:31-60`
- **Problem:** Migration `0003_add_category_to_cards.sql` added `category TEXT NOT NULL DEFAULT ''` to the `cards` table and `CreateCardSchema` (`packages/types`) made it required (`z.string().min(1)`). However `CreateCardPushPayloadSchema` in `sync.ts` — used by the `create_card` push op — does not include `category`. Since this schema uses `.strict()`, any client that sends `category` in the push payload gets the op **rejected** as an unknown field. If the client omits it, the DB default (`''`) is used silently, violating the `min(1)` constraint in the types package.
- **Impact:** Card creation via offline sync push fails silently or produces cards with empty category, causing inconsistencies between online-created and offline-synced cards.
- **Recommendation:** Add `category: z.string().default("")` to `CreateCardPushPayloadSchema`.
- **Example Fix:**
  ```ts
  // apps/api/src/routes/sync.ts — inside CreateCardPushPayloadSchema.object({...})
  category: z.string().default(""),
  ```

---

### High

---

#### [H-1] `/sync/flush-pending-tx` trusts client-computed monetary amounts

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Security / Functionality
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:66-139`
- **Problem:** The offline flush endpoint accepts `subtotalIdr`, `totalIdr`, `soldPriceIdr`, and `intendedPriceIdr` directly from the client payload and inserts them into `transactions` and `transaction_items` without any server-side cross-check against actual card prices in the DB. This bypasses the bottom-price floor and discount cap enforcement that `/carts/:id/pay` performs.
- **Impact:** A buggy or adversarial offline client can report any sale amount — e.g., selling a 500,000 IDR card at 0 IDR. Because the app is private with 11 trusted users this is low exploit likelihood, but the data integrity risk is real (settlement payouts are derived from these figures).
- **Recommendation:** For each flushed item, look up the card's `pricingMode` and floor price in the DB and reject the item if `soldPriceIdr < bottomPriceIdr` (and `!overrideBelowBottom`). Also recompute and verify `totalIdr = subtotalIdr - discountIdr`.
- **Notes:** At minimum, add a server-side `totalIdr === subtotalIdr - discountIdr` assertion. Full price validation is M effort; the assertion is S.

---

#### [H-2] Photo upload endpoint is an unimplemented stub

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Functionality / Reliability
- **Location:** `apps/api/src/routes/sync.ts:258-275`
- **Problem:** `POST /sync/photo/:cardClientId` constructs a hardcoded `photoPath` string but never writes the uploaded file to disk. The comment says "Simplified: just acknowledge the upload". The `@fastify/multipart` plugin is not registered; Fastify would fail to parse multipart bodies.
- **Impact:** Any card photo uploaded by the PWA is silently discarded. The `photoPath` stored in the DB is a fake path that doesn't correspond to a file.
- **Recommendation:** Either implement the endpoint (register `@fastify/multipart`, save file to `cfg.PHOTO_STORAGE_PATH`) or add a "photo upload not yet supported" note to the runbook and remove the stub from the API surface to avoid confusion.

---

#### [H-3] Delta sync pull omits `transaction_items`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Functionality
- **Location:** `apps/api/src/routes/sync.ts:139-151`
- **Problem:** The delta pull branch (cursor > 0) returns `cardChanges`, `eventChanges`, `userChanges`, `cartChanges`, and `txChanges`, but **never** returns `transactionItems` changes. The initial pull (cursor=0) at line 121-128 does include them. After an initial sync, any new `transaction_items` rows are invisible to clients until they re-do a full initial pull.
- **Impact:** Transaction detail pages (`/transactions/:id`) will show empty item lists for transactions created after the initial sync. Settlement report on the client will also be wrong.
- **Recommendation:** Add `transactionItems` to the delta pull, scoped by `transactionId` for the `txChanges` found in that pass.
  ```ts
  // After building txChanges in delta branch:
  const txIds = txChanges.map((t) => t.id);
  if (txIds.length > 0) {
    const txItemChanges = db.select().from(transactionItems)
      .where(inArray(transactionItems.transactionId, txIds)).all();
    for (const row of txItemChanges)
      changes.push({ entityType: "transaction_item", operation: "create", payload: row, serverReceivedAt: row.createdAt });
  }
  ```

---

#### [H-4] `handleRemoveItem` in POS calls the API unconditionally in offline mode

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / UX
- **Location:** `apps/web/src/pages/POSPage.tsx:757`
- **Problem:** `handleRemoveItem` always calls `api.carts.removeItem(activeCartId, item.cardId)`. When `activeCartIsOffline === true` (cart was created while offline), the API call throws a network error. The catch block only handles 404 and 409 specifically; a network error propagates to `setRemoveError` and the item is not removed from local state.
- **Impact:** Cashiers cannot remove items from an offline cart — a core POS operation.
- **Recommendation:** Skip the API call when `activeCartIsOffline`:
  ```ts
  if (!activeCartIsOffline) {
    try {
      await api.carts.removeItem(activeCartId, item.cardId);
    } catch (err) { /* existing handling */ }
  }
  // then always do local IDB cleanup
  ```

---

#### [H-5] Audit plugin entity classification is wrong for nested/report routes

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Observability
- **Location:** `apps/api/src/plugins/audit.ts:52-53`
- **Problem:** Entity type and ID are extracted by URL segment index: `parts[1]` and `parts[2]`. For a route like `POST /carts/:id/pay`, this correctly gives `entityType="carts"` and `entityId=<uuid>`. But for `POST /events/:id/settle`, it gives `entityType="events"` and `entityId=<uuid>` — correct. However for `POST /sync/push`, it gives `entityType="sync"` and `entityId="push"` (not an entity ID). For `POST /auth/change-password`, `entityId="change-password"`.
- **Impact:** Audit log records for auth and sync operations have misleading entity type/ID, making the log harder to use for incident investigation.
- **Recommendation:** At minimum filter out `sync`, `auth`, and `reports` prefixes so they log `entityId=null`. Better: pass an explicit audit context from route handlers rather than parsing the URL.

---

### Medium

---

#### [M-1] Settlement discount distribution has rounding residual — owner payouts may not sum exactly to `totalIdr`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality
- **Location:** `apps/api/src/routes/settlement.ts:64-67`
- **Problem:** `Math.round(txDisc.discountIdr * item.soldPriceIdr / txDisc.subtotalIdr)` distributes the transaction-level discount proportionally. With multiple owners, cumulative rounding residuals can cause `sum(ownerTotals) ≠ tx.totalIdr` by ±N IDR. Not a big deal for small discounts, but can produce non-zero payout for voided transactions in some edge cases.
- **Impact:** Minor payout discrepancies; possible confusion during reconciliation.
- **Recommendation:** Use a "last owner absorbs remainder" pattern: track cumulative distributed discount and give residual to the last owner.

---

#### [M-2] `backup.ts` opens the database with `readonly: false`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/backup.ts:30`
- **Problem:** `new Database(dbPath, { readonly: false })` opens a second write-capable connection to the live database. In WAL mode, concurrent readers are fine but opening multiple write connections to SQLite can cause `SQLITE_BUSY` errors under load.
- **Recommendation:** Change to `new Database(dbPath, { readonly: true })`. The `backup()` API works with readonly connections. The `wal_checkpoint` pragma on a readonly connection would fail, but it's already in a try/catch as best-effort.

---

#### [M-3] No rate limiting on sync endpoints

- **Severity / Confidence / Effort:** Medium / Low / S
- **Category:** Security / Performance
- **Location:** `apps/api/src/routes/sync.ts`, `apps/api/src/routes/flush-pending-tx.ts`
- **Problem:** `/sync/pull`, `/sync/push`, and `/sync/flush-pending-tx` have no `config: { rateLimit: ... }` applied. The global rate limit is disabled (`global: false`). `/auth/login` correctly has a rate limit (20/min) but the sync endpoints — which do heavy DB work — do not.
- **Recommendation:** Add modest rate limits (e.g., 60/min) to prevent accidental runaway sync loops from hammering the server.

---

#### [M-4] `handleAbandonCart` silently diverges server and client cart state when offline

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability / Functionality
- **Location:** `apps/web/src/pages/POSPage.tsx:919-942`
- **Problem:** `handleAbandonCart` wraps the API call in a bare `try/catch` with a "best effort" comment and always clears local state regardless of API result. When offline, the server still has the cart as `draft`, meaning card locks remain on the server. The client's local cleanup releases IDB locks but not server locks.
- **Impact:** Server cart stays in `draft`, holding card locks until the cart sweeper runs (up to `cart_idle_ttl_minutes`, default 30 min). The server's oversold detection may be confused during that window.
- **Recommendation:** Log a pending abandon action in IDB when the API call fails offline, and flush it on reconnect — or rely on the cart sweeper (which is already correct). Document this known behavior in the runbook.

---

#### [M-5] Swagger UI unprotected at `/docs/api` in production

- **Severity / Confidence / Effort:** Medium / Low / S
- **Category:** Security
- **Location:** `apps/api/src/server.ts:111-114`
- **Problem:** The Swagger UI is registered unconditionally. In production it exposes the full API surface to anyone who can reach the server.
- **Recommendation:** Wrap Swagger registration with `if (cfg.NODE_ENV !== "production")`, or add `requireAdmin` as a preHandler for the `/docs/api` prefix.

---

#### [M-6] `lib/sync.ts:fetchAndSync()` is a legacy full-pull path that diverges from cursor sync

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Maintainability / Reliability
- **Location:** `apps/web/src/lib/sync.ts`
- **Problem:** `fetchAndSync()` calls individual REST endpoints (`api.events.list()`, `api.cards.list()`, etc.) and does `clear().then(bulkPut())` to replace tables. This is separate from the cursor-based `deltaSyncPull()` in `background-sync.ts`. Both paths exist — it's unclear which runs on login. The `sync.ts` file is also named the same as the API's `sync.ts`, which is confusing.
- **Impact:** If `fetchAndSync()` is called while delta sync has previously run, the full clear+replace wipes IDB changes that haven't been synced yet (e.g., pending offline carts). Also creates two codepaths to maintain.
- **Recommendation:** Determine if `fetchAndSync()` is still called anywhere; if not, remove it. If it's the login-time initial pull, refactor to call `deltaSyncPull(cursor=0)` instead.

---

### Low

---

#### [L-1] `generateShortId` uses `Math.random()` — not cryptographically secure

- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Security
- **Location:** `packages/qr/src/index.ts:38-43`
- **Problem:** `Math.floor(Math.random() * 36)` is used to generate the 5 random base-36 chars of the short ID. `Math.random()` is not a CSPRNG; the sequence is predictable if the seed can be inferred.
- **Impact:** For a private booth with 11 users and physical card scanning, this is extremely low risk. No actual exploit path.
- **Recommendation:** Replace with `crypto.getRandomValues(new Uint8Array(5))` and map each byte mod 36.

---

#### [L-2] `api.ts` uses `unknown` types for most endpoints

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Code Quality / Maintainability
- **Location:** `apps/web/src/lib/api.ts` — many endpoints use `request<unknown>` or `request<unknown[]>`
- **Problem:** Type safety is lost at the API boundary, requiring callers to cast with `as` everywhere (visible in `POSPage.tsx:644`, `816`).
- **Recommendation:** Progressively type the API client using the Zod types from `@kolektapos/types`. Start with `carts` and `transactions` which are most used in the POS hot path.

---

#### [L-3] `ProductSearch` in POS has no input debounce

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Performance / UX
- **Location:** `apps/web/src/pages/POSPage.tsx:1261-1283`
- **Problem:** The `useEffect` runs a full IDB `filter()` on every change to `trimmed`. The `limit(10)` bound helps, but for large inventories this triggers a full table scan on every keystroke.
- **Impact:** Acceptable at this scale; may cause jank on older phones with many cards.
- **Recommendation:** Add a 150ms debounce using `setTimeout`/`clearTimeout` in the effect.

---

#### [L-4] Backup snapshot tempfile not cleaned up on process crash

- **Severity / Confidence / Effort:** Low / Low / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/backup.ts:24`
- **Problem:** `snapshotPath` includes `Date.now()` and `process.pid` for uniqueness. The cleanup is wired to `archive.on("end"/"close")` but if the process crashes mid-backup, the temp file is leaked in `/tmp/`.
- **Impact:** Minimal — OS temp cleanup handles it eventually. No security risk since it's a DB snapshot.
- **Recommendation:** Optional: register a process exit handler to clean up, or use a deterministic path that gets overwritten on next backup.

---

#### [L-5] Initial pull at cursor=0 loads all cards without pagination

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Performance
- **Location:** `apps/api/src/routes/sync.ts:113`
- **Problem:** `db.select().from(cards).all()` with no limit. For the expected scale (<500 cards) this is fine, but there's no ceiling.
- **Impact:** At scale (thousands of cards), the JSON payload could become large.
- **Recommendation:** Add `hasMore: true` paging to the pull response and handle it in `deltaSyncPull()` (the `hasMore` field already exists in the response schema).

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths:**
- Business invariants are correctly encoded in code and DB: append-only transactions via triggers, bottom-price floor validated on both client and server, `ownerUserIdSnapshot` correctly used for settlement
- Idempotency via `clientId` UUID is consistently applied across carts, transactions, cards, and the flush endpoint
- Cart-locking denormalization is correctly kept in sync with atomically wrapped DB transactions
- `loadConfig()` centralises env validation with fail-fast — good pattern
- Short-circuit stale-lock detection in both `handleScan` and startup cleanup in POSPage is thoughtful
- Code is clean, well-named, and avoids premature abstractions

**Issues:**
- `category` field propagation gap (C-2)
- Photo upload is a stub (H-2)
- `handleRemoveItem` offline bug (H-4)
- `ownerUserIdSnapshot: card?.ownerUserId ?? "unknown"` in `carts.ts:404` — the fallback `"unknown"` is silently accepted; this would corrupt settlement data. Should throw if owner is missing.

**Recommendations:**
- Replace `"unknown"` fallback with an explicit error: `if (!card?.ownerUserId) throw new Error("card.ownerUserId missing at sale time")`
- Consider adding a `stockReceivedByUserId` FK validation in the sync push `create_card` path (currently relies on `PRAGMA foreign_keys = ON` which is set correctly in `buildDb()`)

---

### 2) Testing

**Strengths:**
- Integration tests use real SQLite in-memory + Fastify inject — no mocking, which matches the ADR rationale
- Critical security paths have explicit tests: password hash not leaked in sync pull, admin override gate, authz boundaries
- Settlement math has a regression test for void double-negation
- Vitest is fast and well-configured

**Issues:**
- 2 tests failing (`packages/types`) — test suite is broken (C-1)
- No tests for the offline POS flow (`POSPage.tsx`) — most complex component in the codebase
- No tests for cart sweeper, audit pruner, or `deltaSyncPull`
- Missing edge cases: what happens when `ensureCart()` is called with no active event? What if `paymentChannelId` is null?
- Test setup uses shared DB state across `describe` blocks in some files (e.g., `authz.test.ts` — the void test mutates `tx-1` permanently, so subsequent tests in the same suite would see a voided transaction)

**Recommendations:**
- Fix failing tests immediately (S effort, C-1)
- Add a test for `deltaSyncPull` verifying `transaction_items` appear in delta (this would catch H-3)
- Isolate test state per describe block by seeding fresh UUIDs each time

**How to run tests locally:**
```bash
pnpm test               # all packages
pnpm --filter @kolektapos/api test
pnpm --filter @kolektapos/web test
```

---

### 3) Security

**Strengths:**
- bcrypt cost 12 (documented in ADR-0001)
- Session cookie: `httpOnly=true`, `sameSite=strict`, `secure=true` in production
- `SESSION_SECRET` placeholder detection in `config.ts` — refuses to start with the example value
- `DOMAIN` required in production — CORS won't reflect any origin with credentials
- Audit log redacts sensitive keys (`SENSITIVE_KEYS` set in `audit.ts`) before persistence
- Rate limiting on login (20/min) and change-password (10/min)
- Sync push payload validated with `.strict()` to block field injection

**Issues:**
- Flush endpoint trusts client amounts (H-1) — most significant
- Swagger UI unprotected in production (M-5)
- Dev `.env` has `ADMIN_PASSWORD=changeme` — weak but gitignored
- `generateShortId` uses `Math.random()` (L-1)
- No CSRF token — mitigated by `sameSite=strict` which is sufficient for same-domain PWA

**Recommendations:**
- See H-1 for flush price validation
- Wrap Swagger in production guard (M-5)
- Rotate `ADMIN_PASSWORD` in local dev `.env` before first event (even for dev purposes)

---

### 4) Performance & Scalability

**Strengths:**
- SQLite WAL mode enabled for concurrent readers
- `foreign_keys = ON` set at connection time
- Pagination utility (`parsePagination`) added to list endpoints with 5000 max cap
- Monthly report uses SQL-level filter (was refactored from JS-level filter per comment)
- Settlement computed with in-memory aggregation — acceptable for expected transaction volumes

**Issues:**
- Initial pull (cursor=0) loads all cards unbounded (L-5)
- `ProductSearch` full IDB scan per keystroke — acceptable now, could degrade (L-3)
- Settlement route `GET /reports/event/:id/settlement` does 3+ round-trips to the DB (allTxs, allItems, ownerUsers) — could be combined with joins at scale

**Recommendations:**
- Add `LIMIT`/cursor to initial sync pull for future-proofing (L-5)
- `ProductSearch` debounce (L-3)

---

### 5) Reliability & Stability

**Strengths:**
- All critical mutations (add-to-cart, pay, abandon, flush, void) wrapped in `db.transaction()`
- Cart sweeper runs every 5 min and also expires holds — correctly releases locks
- Audit pruner archives to JSONL before deleting — data is not simply discarded
- Idempotency keys prevent duplicate transactions on network retry
- Oversold is detected and flagged rather than blocked — per PRD §10

**Issues:**
- Delta sync missing `transaction_items` (H-3) — data loss from client perspective
- `handleAbandonCart` diverges server/client state (M-4)
- If `backup.ts` is called concurrently by two admin sessions, two WAL checkpoints + snapshots race — unlikely but possible

**Recommendations:**
- Fix delta sync (H-3 — S effort)
- Document the known state divergence on offline abandon in runbook

---

### 6) Monitoring & Logging (Observability)

**Strengths:**
- Fastify's built-in pino logger (`logger: true`) provides structured JSON logs in production
- `sale_completed` and `oversold_detected` log events with all relevant fields (txId, cartId, cashierId, itemCount, totalIdr)
- Audit log with 90-day retention + JSONL archive
- `SyncDot` component in the UI shows live sync state + pending count

**Issues:**
- Audit entity parsing unreliable for nested/auth routes (H-5)
- Cart sweeper and audit pruner log success/failure — good. But no log on successful initial sync pull
- No health check response metrics (response time, DB connectivity) — the `/health` endpoint exists but its contents weren't reviewed

**Recommendations:**
- Fix audit entity parsing (H-5)
- Add a `sync_pull_completed` log event with `cursor`, `changeCount`, and duration

---

### 7) Deployment & DevOps (Local-first)

**Strengths:**
- Turbo monorepo with proper task graph — `pnpm dev` starts both API and web
- `mkdirSync({ recursive: true })` in `server.ts` ensures storage dirs exist on fresh deploy
- Migrations applied automatically on startup via Drizzle's `migrate()`
- `runbook.md` covers installation, startup, and recovery

**Issues:**
- No `pnpm start` script wired to serve the built PWA from the API (the runbook mentions nginx or serving separately — could be more automated for booth operators)

**Recommendations:**
- Consider a `pnpm start:prod` that builds both apps and starts the API with `NODE_ENV=production`

---

### 8) Configuration & Environment Management

**Strengths:**
- `loadConfig()` in `config.ts` validates all env vars at boot with Zod — fails fast with clear messages
- `.env.example` is well-documented with generation instructions
- `NODE_ENV` gating is correct (`secure: process.env.NODE_ENV === "production"` in session)
- `DOMAIN` required in production prevents silent CORS misconfiguration

**Issues:**
- Dev `.env` has `ADMIN_PASSWORD=changeme` — even for dev, should be stronger
- `SESSION_SECRET` is correctly validated but the session plugin re-reads `process.env.SESSION_SECRET` at line 6 instead of using the config object already parsed by `loadConfig()` — slight inconsistency

**Recommendations:**
- Pass `cfg.SESSION_SECRET` to `sessionPlugin` instead of re-reading from env

---

### 9) User Experience (UX)

**Strengths:**
- Scan-first POS: USB HID feeds same input field as camera — no context switch needed
- Bottom price tap-and-hold with keyboard equivalent (Space/Enter) — correct accessibility
- `BottomPriceReveal` auto-hides after reveal (2s via `useTapHoldReveal`)
- Clear offline warning banners and pending sync count in `SyncDot`
- "Tersimpan lokal — akan disinkronkan saat kembali online" message on receipt for offline payments
- Receipt print modal with quick re-transaction button

**Issues:**
- Remove-item fails silently in offline carts (H-4)
- `ProductSearch` has no debounce — rapid typing triggers many IDB scans
- No visible indication when a cart is "offline" vs "online" in the cart panel header

**Recommendations:**
- Fix offline remove item (H-4)
- Add a small "offline cart" badge in the cart panel when `activeCartIsOffline === true`

---

### 10) Compliance & Legal

**Strengths:**
- `data-retention-policy.md` covers audit log archiving and deletion schedule
- `ownerUserIdSnapshot` design prevents live user data from affecting historical payouts
- No PII collected beyond email, display name, password hash

**Issues:**
- The sync pull (cursor=0) returns full user list to all authenticated users — includes email addresses and roles of all 11 users. For a known-group booth this is acceptable but worth noting.
- Audit log stores full response payloads (up to 2000 chars) which may contain user IDs, card IDs, and financial amounts. The redaction logic in `audit.ts` covers passwords but not financial figures.

**Recommendations:**
- Consider wrapping audit `diffJson` to only store diffs for admin-relevant routes (settings, users, events) and skip card/cart/transaction details which are already in the append-only tables.

---

### 11) Documentation & Knowledge Sharing

**Strengths:**
- Five ADRs covering key decisions (bcrypt cost, session length, Drizzle vs Prisma, append-only tx, oversold accepted risk)
- `docs/02-implementation-plan.md` sequences milestones clearly
- `docs/03-runbook.md` covers deployment
- `docs/data-retention-policy.md` documents archival
- `CLAUDE.md` keeps AI assistant context current
- Progress docs per milestone are helpful for tracking

**Issues:**
- `CLAUDE.md` says "None yet — repo is pre-bootstrap" for Commands section — this is now outdated (repo is fully bootstrapped with Turbo)
- No documentation of the offline POS flow — most complex user flow and most likely to confuse booth operators

**Recommendations:**
- Update `CLAUDE.md` Commands section with the actual Turbo commands
- Add a "Cashier Quick Reference" page to `docs/` covering offline mode, scan formats, and receipt printing

---

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

| # | Item | Effort | Severity |
|---|---|---|---|
| 1 | Fix `card.test.ts` — add `category` to test fixtures | S | Critical |
| 2 | Add `category: z.string().default("")` to `CreateCardPushPayloadSchema` | S | Critical |
| 3 | Fix `handleRemoveItem` to skip API call when `activeCartIsOffline` | S | High |
| 4 | Add `transaction_items` to delta sync pull response | S | High |
| 5 | Replace `"unknown"` fallback in `carts.ts:404` with explicit error throw | S | High |
| 6 | Change `backup.ts` to open DB with `{ readonly: true }` | S | Medium |
| 7 | Update `CLAUDE.md` Commands section | S | Low |

### Phase 2: Short-term improvements (1–2 weeks)

| # | Item | Effort | Severity |
|---|---|---|---|
| 8 | Implement photo upload endpoint or document as out-of-scope in runbook | M | High |
| 9 | Add server-side price validation in `/sync/flush-pending-tx` (at minimum, verify `totalIdr === subtotalIdr − discountIdr`) | M | High |
| 10 | Add rate limits to `/sync/pull`, `/sync/push`, `/sync/flush-pending-tx` | S | Medium |
| 11 | Fix audit plugin entity parsing for nested/auth routes | S | Medium |
| 12 | Guard Swagger UI in production (`NODE_ENV === "production"`) | S | Medium |
| 13 | Remove or merge `lib/sync.ts:fetchAndSync()` into the cursor sync path | M | Medium |
| 14 | Add `ProductSearch` debounce | S | Low |

### Phase 3: Longer-term refactors (2–6 weeks)

| # | Item | Effort | Severity |
|---|---|---|---|
| 15 | Type the `api.ts` client with inferred Zod types | M | Low |
| 16 | Add cursor-based pagination to initial sync pull | M | Low |
| 17 | Replace `Math.random()` in `generateShortId` with `crypto.getRandomValues` | S | Low |
| 18 | Write offline POS flow integration tests (or Playwright e2e) | L | Medium |
| 19 | Add "last owner absorbs remainder" pattern to settlement discount distribution | S | Medium |
| 20 | Cashier Quick Reference doc for booth operators | M | Low |

---

## Appendix

### How to run/build/test locally

```bash
# Install
pnpm install

# Development (API on :3001, web on :5173)
pnpm dev

# Tests (all packages)
pnpm test

# Single package test
pnpm --filter @kolektapos/api test
pnpm --filter @kolektapos/web test

# Build for production
pnpm build

# DB migrations (run automatically on server start)
pnpm --filter @kolektapos/db migrate
```

**Prerequisites:** Node 20+ (see `.nvmrc`), pnpm 10+. Copy `.env.example` to `.env` and set `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

---

### Notable files reviewed

| File | Purpose |
|---|---|
| `apps/api/src/server.ts` | Server bootstrap, plugin registration |
| `apps/api/src/config.ts` | Centralised Zod env validation |
| `apps/api/src/plugins/session.ts` | Session cookie configuration |
| `apps/api/src/plugins/audit.ts` | Mutation audit hook |
| `apps/api/src/plugins/auth-guard.ts` | `requireAuth`, `requireAdmin` guards |
| `apps/api/src/routes/auth.ts` | Login, logout, change-password, /me |
| `apps/api/src/routes/carts.ts` | Cart CRUD, pay, abandon — core POS logic |
| `apps/api/src/routes/transactions.ts` | Transaction list, void/refund |
| `apps/api/src/routes/sync.ts` | Push/pull sync + photo stub |
| `apps/api/src/routes/flush-pending-tx.ts` | Offline transaction flush endpoint |
| `apps/api/src/routes/settlement.ts` | Per-event and monthly reports |
| `apps/api/src/routes/backup.ts` | WAL-safe SQLite backup + zip |
| `apps/api/src/jobs/cart-sweeper.ts` | Idle cart cleanup + hold expiry |
| `apps/api/src/jobs/audit-pruner.ts` | Audit log archival + pruning |
| `packages/db/src/schema.ts` | Drizzle table definitions |
| `packages/db/src/triggers.sql` | Append-only trigger enforcement |
| `packages/db/src/migrate.ts` | Migration runner (WAL + FK pragma) |
| `packages/db/src/seed.ts` | Payment channels + settings + admin user |
| `packages/types/src/card.ts` | Card Zod schemas |
| `packages/sync/src/protocol.ts` | Sync push/pull Zod schemas |
| `packages/qr/src/index.ts` | Short ID generation |
| `apps/web/src/lib/db.ts` | Dexie IDB schema |
| `apps/web/src/lib/background-sync.ts` | Background sync, flush, opportunistic sync |
| `apps/web/src/lib/sync.ts` | Legacy full-pull path (fetchAndSync) |
| `apps/web/src/store/sync-state.ts` | Sync/network mode Zustand store |
| `apps/web/src/store/pos.ts` | POS cart/scan Zustand store |
| `apps/web/src/pages/POSPage.tsx` | Main cashier UI (scan, cart, pay, receipt) |

---

### Dependency notes

- `xlsx@0.18.5` — this package is unmaintained; the last community-supported fork is `SheetJS CE`. No known active CVEs for this version's usage (bulk import only), but worth noting.
- `html5-qrcode@2.3.8` — last release was 2023; active community forks exist. Camera scanning works but may have issues on newer iOS Safari.
- `@fastify/session` stores sessions **in-memory** by default — all sessions are lost on API restart. For a booth this is acceptable (cashiers re-login), but operators should know this.
- `bcryptjs@3.0.2` is the pure-JS implementation — slightly slower than native `bcrypt` but avoids native addon compilation issues. Cost 12 gives ~200ms on typical hardware which is acceptable.
