# Code Review Report – KolektaPOS

**Date:** 2026-04-26 10:10:35
**Reviewer:** Kimi Code CLI
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `9bedc2f` — "feat(offline): POS offline cart and payment queue — full alur kasir tanpa jaringan"

## Executive Summary

KolektaPOS has matured significantly since the last review (2026-04-24). Several critical defects have been remediated: tap-and-hold bottom-price reveal now gates on the full 5-second hold; the oversold queue correctly resolves sale transactions rather than passing card UUIDs; `/sync/push` validates payloads with strict Zod schemas; the SHA-256 seed fallback and `changeme` default password have been excised; server-side fixed-price floor enforcement is active; cart/hold ownership authorization guards are in place; and core security middleware (helmet, CORS, rate-limit) is now registered. An offline cart/payment queue has been added, allowing the PWA to record sales without network and flush them later via `POST /sync/flush-pending-tx`.

Despite these improvements, the codebase still carries **critical inventory-integrity and data-race risks** that could corrupt stock state during an event:

1. **Void/refund unconditionally re-opens cards to `available`** even when the card was oversold (sold by two offline transactions). The remaining sale transaction still exists, but the card becomes purchasable again.
2. **Hold expiry and manual release ignore cart locks and sold state**, creating races where a card already sold or locked in another cashier's cart reverts to `available`.
3. **`flush-pending-tx` accepts `ownerUserIdSnapshot` from the client without verifying it against the card's current owner**, allowing a compromised or buggy offline client to redirect settlement payouts.
4. **Missing database indexes** on hot-path foreign keys (`cart_items.cart_id`, `cart_items.card_id`, `holds.card_id`, `cards.event_id`, `transactions.paid_at`, etc.) cause full table scans that will degrade as card and transaction volume grows.
5. **Unbounded `SELECT *` queries** in `/sync/pull`, settlement, and monthly reports load entire datasets into memory with no pagination or LIMIT.

The test suite has active failures (`packages/types/src/card.test.ts` fails because the `category` field is missing from fixtures), tests execute twice because `dist/` is not excluded from Vitest, and web component tests fail in workspace mode due to lost `jsdom` environment. The repo is **not ship-ready for a first event until the inventory-integrity issues (void→oversold reopen, hold→cart race, and flush-pending-tx owner verification) are fixed**.

### Top 5 Risks

- **Critical** — Void/refund of an oversold card sets `status = 'available'` while another sale transaction remains in the DB (`apps/api/src/routes/transactions.ts:198-202`).
- **Critical** — Hold expiry sweeper sets `cards.status = 'available'` without checking if the card was sold in the interim (`apps/api/src/jobs/cart-sweeper.ts:122-125`).
- **Critical** — `flush-pending-tx` trusts client-provided `ownerUserIdSnapshot` without server-side verification against current `cards.ownerUserId` (`apps/api/src/routes/flush-pending-tx.ts:100-114`).
- **High** — Missing indexes on `cart_items(cart_id, card_id)`, `holds(card_id, expires_at)`, `cards(event_id)`, `transactions(paid_at)`, `audit_log(created_at)` cause full-table scans on every sync, settlement, and pruner run.
- **High** — `/sync/pull` initial pull dumps every card, user, event, and 30 days of transactions with no LIMIT/pagination (`apps/api/src/routes/sync.ts:104-137`).

### Quick Wins

- Add `category` to `packages/types/src/card.test.ts` fixtures to fix the 2 failing tests.
- Exclude `dist/` from all Vitest configs to stop double-runs.
- Add `LIMIT 5000` (or paginate with `hasMore`) to `/sync/pull` initial pull and settlement queries.
- Batch the N+1 `UPDATE` loops in cart sweeper, cart pay, and void/refund using `UPDATE ... WHERE id IN (...)`.
- Register a `request.raw.on('close', cleanup)` handler in `backup.ts` to catch client-abort temp-file leaks.
- Regenerate session ID on login to prevent session fixation (`apps/api/src/routes/auth.ts:39-40`).

## Scorecard (0–10)

| Category | Score | Justification |
|----------|-------|---------------|
| Functionality & Code Quality | 6/10 | Core flows work end-to-end and several prior bugs are fixed, but inventory-integrity races (void→oversold, hold→sold), unverified `ownerUserIdSnapshot` in flush, and missing `create_cart`/`create_cart_item` sync op types leave the offline-first promise incomplete. |
| Testing | 4/10 | 60 tests exist across 14 files, but 2 are failing (types/card), web tests fail in workspace mode, `dist/` causes double-runs, and critical paths (void/refund, oversold resolution, flush-pending-tx, settlement math, backup integrity) have zero coverage. |
| Security | 6/10 | bcrypt-only auth, helmet/CORS/rate-limit, `sameSite=strict`, admin-only void/refund, cart/hold ownership guards, and sync push validation are solid improvements. Remaining gaps: session fixation on login, no CSRF token (mitigated by sameSite), `flush-pending-tx` trusts client snapshot fields, and `.env` contains `ADMIN_PASSWORD=changeme`. |
| Performance & Scalability | 5/10 | SQLite + WAL is fine for 11 users, but unbounded `.all()` queries, missing indexes, N+1 update loops, and audit-pruner OOM risk mean performance will degrade sharply with data growth. |
| Reliability & Stability | 5/10 | Append-only triggers, `client_id` idempotency, and DB-wrapped transactions are strong. Weaknesses: unsafe backup cleanup on abort, hold/cart race conditions, void→oversold reopen, sync cursor advances even on partial failure, no graceful shutdown hook for cron jobs. |
| Observability | 5/10 | Fastify logger, structured `event:` fields on sale/pay, health endpoint, and audit table are good. Gaps: `console.warn` in background sync, no correlation IDs, no metrics hooks, audit log JSON truncated mid-structure, no alert on flush-pending-tx rejection. |
| Local Deployment & DevOps | 7/10 | `pnpm dev`/`test`/`build`/`typecheck` work; Turbo pipeline is clean; runbook is thorough; config fails fast with clear messages. Deductions for broken workspace test run, `dist/` double-runs, and stale `.env` secret on disk. |
| Configuration & Environment | 7/10 | `.env.example` is clear; `loadConfig()` validates schema, placeholder rejection, and admin-var consistency. `.env` accidentally committed a real `SESSION_SECRET` and `ADMIN_PASSWORD=changeme` (gitignored, but present on disk). |
| UX | 7/10 | Mobile-first Bahasa Indonesia UI, masked amounts, offline banners, sync dot, camera + HID scanner, and receipt modal are well-executed. Minor: bottom-price reveal uses 2s hold in POSPage vs 5s default in hook; offline cart abandon is not clearly communicated to the user. |
| Compliance & Legal | 6/10 | `LICENSE` file exists (UNLICENSED), data-retention policy documented, audit log redacts passwords. Gaps: audit log stores up to 2000 bytes of response body (potential PII), unbounded retention until pruner runs, no PII handling doc for photos. |
| Documentation & Knowledge Sharing | 7/10 | PRD, runbook, ADRs, CLAUDE.md, and per-milestone notes are excellent. README is now accurate. CONTRIBUTING.md exists. Some inline comments could be clearer around the flush-pending-tx trust model. |

**Average Score: 5.9/10**

## Architecture Snapshot

- **Monorepo** (Turbo + pnpm 10, Node 22+): `apps/{web,api}` + `packages/{db,types,sync,qr,ui}`.
- **API** (`apps/api`): Fastify 5 + better-sqlite3 11 via Drizzle 0.38. Plugins: `@fastify/session` + `@fastify/cookie`, helmet, CORS, rate-limit, audit `onSend` hook. Background jobs: `node-cron` cart sweeper (every 5 min) and audit pruner (daily 03:17).
- **Web** (`apps/web`): React 19 + Vite 6 + vite-plugin-pwa (Workbox). Dexie 4 for IndexedDB, TanStack Query v5 (localStorage persister) for server state, Zustand 5 for UI/sync state, react-router 7.
- **Sync**: cursor-based delta pull (`updatedAt`/`createdAt > cursor), op-list push with per-op accept/reject; `client_id` UUID dedupes. Foreground polling every 60s + opportunistic trigger. New: `pendingTransactions` Dexie table + `flush-pending-tx` endpoint for offline sales.
- **Data model**:
  - `transactions` / `transaction_items`: append-only (DB triggers enforce).
  - `cards`: denormalized `locked_by_cart_id` / `locked_by_user_id` / `locked_at` for fast scan.
  - `transaction_items.owner_user_id_snapshot`: the **only** field used for settlement.
  - `settings` JSON rows for runtime config.
- **Auth**: bcryptjs cost 12. 30-day rolling session cookie, `httpOnly`, `sameSite=strict`, `secure` in production.

## Findings (Prioritized)

### Critical

#### C1. Void/refund unconditionally re-opens oversold cards to `available`

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Reliability / Data Integrity
- **Location:** `apps/api/src/routes/transactions.ts:195-204`
- **Problem:** After inserting a void/refund transaction, the code loops over `parentItems` and sets every card's status back to `available` without checking whether the card was oversold (i.e., sold by another transaction that is still valid).
- **Impact:** An oversold card with two sale transactions becomes purchasable again after the first is voided, even though the second sale is still in the database. Cashiers can sell the same card a third time, compounding the oversold queue and making cash reconciliation impossible.
- **Recommendation:** Only set `status = 'available'` if the card has no other un-voided sale transactions. Query `transaction_items` for the card ID, join to `transactions` where `kind = 'sale'`, and exclude the current parent transaction and any voided parents. If other sales exist, leave `status = 'sold'` and `oversold = true`.
- **Suggested fix (minimal):**
  ```ts
  // After creating the void/refund transaction:
  for (const cardId of cardIds) {
    const otherSales = db
      .select({ txId: transactions.id })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
      .where(and(
        eq(transactionItems.cardId, cardId),
        eq(transactions.kind, "sale"),
        ne(transactions.id, parentId)
      ))
      .all();
    const hasOtherUnvoided = otherSales.some(s => !voidedParentIds.has(s.txId));
    if (!hasOtherUnvoided) {
      db.update(cards).set({ status: "available", updatedAt: nowSec }).where(eq(cards.id, cardId)).run();
    }
  }
  ```

#### C2. Hold expiry sweeper reverts sold cards to `available`

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Reliability / Data Integrity
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:122-125`
- **Problem:** When expiring overdue holds, the sweeper unconditionally updates `cards.status = 'available'` for every held card. If a card was sold after the hold was created but before the sweeper runs, it reverts a sold card to available.
- **Impact:** Inventory corruption: a sold card becomes purchasable again. This is especially likely during high-traffic periods when holds expire close to checkout time.
- **Recommendation:** Add `AND status != 'sold'` (or `AND status = 'held'`) to the card update condition inside the hold-expiry transaction.
- **Suggested fix:**
  ```ts
  db.update(cards)
    .set({ status: "available", updatedAt: nowSec })
    .where(and(eq(cards.id, hold.cardId), eq(cards.status, "held")))
    .run();
  ```

#### C3. Hold can be placed on a card already locked in another cashier's cart

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality / Data Integrity
- **Location:** `apps/api/src/routes/holds.ts:30-38`
- **Problem:** `POST /holds` checks `card.status !== 'available'` but does **not** check `cards.lockedByCartId`. Because cart locking is denormalized, a card in an active draft cart retains `status = 'available'`. A hold can therefore be placed on a card already in someone else's cart.
- **Impact:** Two cashiers believe they have exclusive rights to the same card. When the first pays, the second's hold is on a sold card. When the hold expires, the sweeper (if C2 is not fixed) reverts it to available, creating a loop of oversold inventory.
- **Recommendation:** Reject hold creation if `card.lockedByCartId IS NOT NULL`. Also verify the locking cart is still `draft`.
- **Suggested fix:**
  ```ts
  if (card.lockedByCartId) {
    const lockingCart = db.select().from(carts).where(eq(carts.id, card.lockedByCartId)).get();
    if (lockingCart && lockingCart.status === "draft") {
      return reply.status(409).send({ error: "Card is locked in an active cart" });
    }
  }
  ```

#### C4. `flush-pending-tx` trusts client-provided `ownerUserIdSnapshot`

- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security / Reliability
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:100-114`
- **Problem:** The endpoint accepts `ownerUserIdSnapshot` and `soldPriceIdr` directly from the client payload without verifying `ownerUserIdSnapshot` against the card's current `ownerUserId` in the database. A malicious or buggy offline client can attribute a sale to the wrong owner, corrupting settlement payouts.
- **Impact:** Settlement fraud or error: payouts are directed to the wrong co-owner. Since settlement is the financial close of an event, this is a material integrity failure.
- **Recommendation:** At flush time, look up each card's current `ownerUserId` and overwrite `ownerUserIdSnapshot` with the server value. Also verify the card exists and was not already sold by another online transaction (or accept oversold with the correct owner snapshot).
- **Suggested fix:**
  ```ts
  for (const item of tx.items) {
    const card = cardMap.get(item.cardId);
    const verifiedOwnerId = card?.ownerUserId ?? item.ownerUserIdSnapshot;
    db.insert(transactionItems).values({
      ...item,
      ownerUserIdSnapshot: verifiedOwnerId,
      // ... rest
    }).run();
  }
  ```

#### C5. Cart pay does not verify active holds at payment time

- **Severity / Confidence / Effort:** Critical / Medium / S
- **Category:** Functionality / Data Integrity
- **Location:** `apps/api/src/routes/carts.ts:306-493`
- **Problem:** `addCartItem` rejects cards with `status === 'held'` at add time, but there is no hold check at **pay time**. If a hold is placed on a card after it was added to the cart, the sale proceeds. The hold sweeper later reverts the card to `available` (see C2), creating inconsistency.
- **Impact:** A held card can be sold out from under the holder, or a sold card can be reverted to available after hold expiry.
- **Recommendation:** Before creating the transaction in the pay handler, verify that none of the cart items have an active unreleased hold (`holds.releasedAt IS NULL AND holds.expiresAt > nowSec`).

### High

#### H1. Missing database indexes on hot-path foreign keys and filter columns

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Performance & Scalability
- **Location:** `packages/db/src/schema.ts` and migration files
- **Problem:** No indexes exist on: `cart_items(cart_id)`, `cart_items(card_id)`, `holds(card_id)`, `holds(expires_at, released_at)`, `cards(event_id)`, `cards(locked_by_cart_id)`, `transactions(cart_id)`, `transactions(parent_transaction_id)`, `transactions(paid_at)`, `events(status)`, `audit_log(created_at)`, `cash_reconciliations(event_id, date)`.
- **Impact:** Full table scans on every sync pull, settlement report, cart sweeper, hold expiry, and audit pruner. At convention scale (potentially thousands of cards and transactions), these scans will cause noticeable latency and CPU spikes.
- **Recommendation:** Add a migration (`0004_add_indexes.sql`) creating the above indexes. Remove duplicate `unique` + `index` pairs in migration 0000 (`cards_client_id_unique` + `cards_client_id_idx`, etc.).

#### H2. Unbounded `SELECT *` queries with no LIMIT

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/routes/sync.ts:104-137` (initial pull); `apps/api/src/routes/settlement.ts:35,44,152`; `apps/api/src/routes/settlement.ts:201`; `apps/api/src/jobs/audit-pruner.ts:34-38`
- **Problem:** Multiple endpoints load entire tables or entire event datasets into memory. The initial sync pull dumps every card, user, event, and 30 days of transactions. Settlement loads all transactions + items + cards for an event. Audit pruner loads all rows older than 90 days.
- **Impact:** Memory pressure, slow response times, and potential OOM (especially audit pruner if it has never run). For a large event, the sync pull could produce a multi-megabyte JSON response.
- **Recommendation:**
  - Add `LIMIT 5000` to initial pull with a `hasMore` cursor.
  - Push settlement aggregation into SQL (GROUP BY) instead of loading all rows into Node.
  - Add `LIMIT 10000` to audit pruner loop and run it in batches until no rows remain.

#### H3. Test suite reliability failures

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Testing
- **Location:** `packages/types/src/card.test.ts`; all `vitest.config.ts` files; `vitest.workspace.ts`
- **Problem:**
  1. `packages/types/src/card.test.ts` fails because `CreateCardSchema` now requires `category: z.string().min(1)`, but the test fixtures omit it.
  2. `dist/*.test.js` files are not excluded from Vitest configs, so every test runs twice.
  3. Web component tests fail in workspace mode because the `jsdom` environment declared in `apps/web/vitest.config.ts` is not honored when Vitest runs from the workspace root.
- **Impact:** Developers cannot trust `pnpm test` from the root. Coverage numbers are inflated by double-runs. The failing types tests block CI.
- **Recommendation:**
  1. Add `category: "TCG"` (or similar) to the two failing test fixtures.
  2. Add `exclude: ['dist', 'node_modules']` to all `vitest.config.ts` files.
  3. Configure `environmentMatchGlobs` in the root `vitest.workspace.ts` or run web tests with a separate command.

#### H4. Backup temp snapshot may leak on client abort

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Reliability / Local Deployment
- **Location:** `apps/api/src/routes/backup.ts:47-51`
- **Problem:** Cleanup is registered on `archive.on("end", cleanup)` and `archive.on("close", cleanup)`. If the client aborts the download mid-stream, Fastify destroys the response stream; archiver may not emit `end`/`close`, leaving the temp snapshot in `/tmp`.
- **Impact:** Unbounded disk growth on the VPS if backup downloads are frequently aborted or if load balancers health-check the endpoint.
- **Recommendation:** Also register cleanup on `request.raw.on('close', cleanup)` to catch TCP disconnects and client aborts.

#### H5. Session fixation on login

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:39-40`
- **Problem:** The login handler sets `request.session.userId` and `request.session.userRole` on the existing session without regenerating the session ID. An attacker who obtains a pre-login session cookie can use it after authentication.
- **Impact:** Session fixation attack: if an attacker can seed a session ID (e.g., via XSS or MITM before login), they gain access to the authenticated session.
- **Recommendation:** Call `await request.session.regenerate()` before assigning user data, or use a session plugin that supports regeneration.

#### H6. N+1 update loops in cart sweeper, pay, void, and flush-pending-tx

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Performance & Scalability
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:71-94`; `apps/api/src/routes/carts.ts:428-442,522-531`; `apps/api/src/routes/transactions.ts:198-202`; `apps/api/src/routes/flush-pending-tx.ts:125-138`
- **Problem:** Multiple handlers update cards one row at a time inside a loop. A cart with 50 items generates 50 separate `UPDATE` statements.
- **Impact:** Parsing/planning overhead in SQLite adds up. At scale this slows pay and abandon operations.
- **Recommendation:** Batch with `UPDATE cards SET ... WHERE id IN (...)` or use a temporary mapping table. For the sweeper, update all locked cards in one query using `inArray(cards.id, lockedCardIds)`.

### Medium

#### M1. `create_cart` and `create_cart_item` op types missing from `/sync/push`

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Functionality / Reliability
- **Location:** `apps/api/src/routes/sync.ts:166-247`
- **Problem:** The push protocol only handles `create_card` and `create_transaction`. Offline-created carts, cart items, and cart abandons cannot be pushed to the server. The PWA relies on `flush-pending-tx` for offline payments, but offline cart creation/abandonment is invisible to the server.
- **Impact:** Cart sweeper cannot clean up offline carts. Cart-level audit trails are incomplete. If a device is lost, the server has no record of what cards were in the offline cart before it was abandoned.
- **Recommendation:** Add `create_cart`, `create_cart_item`, and `update_cart` op types to `/sync/push`, or document that offline carts are intentionally local-only and will be reconstructed from `flush-pending-tx` on the next device.

#### M2. Audit log JSON truncation can split multi-byte characters or JSON structures

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Observability / Data Integrity
- **Location:** `apps/api/src/plugins/audit.ts:60`
- **Problem:** `JSON.stringify(redact(parsed)).slice(0, 2000)` truncates raw strings. If a Unicode surrogate pair or JSON escape sequence is sliced in half, the stored string is invalid JSON.
- **Impact:** Audit log consumers that expect valid JSON will fail to parse the `diffJson` column.
- **Recommendation:** Truncate after verifying the cut point is at a valid Unicode boundary, or store a safe summary object with a fixed schema instead of raw stringified JSON.

#### M3. `.env` file on disk contains `ADMIN_PASSWORD=changeme`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security / Configuration
- **Location:** `kolektapos/.env`
- **Problem:** The `.env` file (gitignored but present on disk) contains `ADMIN_PASSWORD=changeme`. While `seed.ts` now requires explicit env vars and uses bcrypt, a developer running `pnpm dev` locally will create an admin with a trivial password.
- **Impact:** Local development environment is vulnerable to trivial credential guessing if the API port is exposed to the local network.
- **Recommendation:** Add `.env` to `.gitignore` (already done) and document in README that operators must rotate `ADMIN_PASSWORD` after first run. Consider adding a startup warning if `NODE_ENV === 'development'` and the admin password is on a known weak-list.

#### M4. `console.warn` in background sync swallows stack traces

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Observability
- **Location:** `apps/web/src/lib/background-sync.ts:66-68,174,201-205`
- **Problem:** Sync errors are logged with `console.warn` and only the error message is stored in Zustand state. No stack trace, no request URL, no correlation ID.
- **Impact:** Debugging sync failures in production (e.g., at a convention) is extremely difficult because the web app provides no actionable diagnostic data.
- **Recommendation:** Log the full error object (including stack), the request path, and the payload size. Expose a "Copy debug info" button in the SyncDot UI for cashiers to send to admins.

#### M5. No graceful shutdown for cron jobs or DB connections

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability
- **Location:** `apps/api/src/server.ts:145-147`; `apps/api/src/jobs/cart-sweeper.ts`; `apps/api/src/jobs/audit-pruner.ts`
- **Problem:** The server starts cron tasks but does not register `SIGTERM`/`SIGINT` handlers to stop them or close the SQLite connection before exit.
- **Impact:** If the process is killed during a sweeper transaction or audit archive write, the DB may be left in an inconsistent state (WAL not checkpointed, archive file half-written).
- **Recommendation:** Register `process.on('SIGTERM', ...)` and `process.on('SIGINT', ...)` that stop cron tasks, close the better-sqlite3 connection, and then exit.

#### M6. `flush-pending-tx` loses cart relationship (`cartId: null`)

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality / Observability
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:85`
- **Problem:** Offline transactions are inserted with `cartId: null` even though the pending payload includes `cartClientId`. The server discards the cart linkage.
- **Impact:** Transaction history cannot trace back to the cart that originated the sale, making debugging and audit harder.
- **Recommendation:** If the `cartClientId` matches an existing cart row, set `cartId` to that cart's server ID. If it doesn't match (offline-only cart), optionally create a placeholder cart or store `cartClientId` in a new column.

### Low

#### L1. `archiver` is declared in `devDependencies` instead of `dependencies`

- **Severity / Confidence / Effort:** Low / High / XS
- **Category:** Deployment & DevOps
- **Location:** `apps/api/package.json`
- **Problem:** `archiver` is required at runtime by `backup.ts` but is listed under `devDependencies`. `pnpm install --production` would omit it and break the backup endpoint.
- **Recommendation:** Move `archiver` to `dependencies` in `apps/api/package.json`.

#### L2. `SyncDot` does not surface `syncError` details to users

- **Severity / Confidence / Effort:** Low / Medium / XS
- **Category:** UX
- **Location:** `apps/web/src/components/SyncDot.tsx` (inferred)
- **Problem:** When `flushPendingTransactions` marks a pending tx as `syncStatus: "error"`, the user sees a generic red dot but no explanation or retry guidance.
- **Recommendation:** Show the count of failed flushes and a "Tap to retry" action in the SyncDot tooltip/modal.

#### L3. `lint` script is a no-op

- **Severity / Confidence / Effort:** Low / High / XS
- **Category:** Code Quality
- **Location:** Root `package.json` and workspace `package.json` files
- **Problem:** `pnpm lint` runs `turbo run lint`, but no package defines a meaningful lint script (most are empty or missing).
- **Recommendation:** Add ESLint or Biome configuration and wire it into each workspace package. At minimum, enable `@typescript-eslint/no-floating-promises` to catch unhandled async errors.

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths**
- PRD invariants are largely respected: integer IDR, append-only transactions, owner snapshotting, `client_id` idempotency, optimistic concurrency via `version`.
- Offline cart/payment queue is a genuine architectural improvement over the prior review.
- Cart ownership guards (`makeRequireCartOwnerOrAdmin`) and admin gating on void/refund/card-edit close major authorization gaps.
- Fixed-price floor and discount-percentage validation are enforced server-side.

**Issues**
- **Inventory-integrity races** (C1, C2, C3, C5): void/refund, hold expiry, and hold creation do not adequately guard against concurrent cart operations or oversold state.
- **Offline push gaps** (M1): `/sync/push` cannot round-trip carts or cart items, so the server lacks visibility into offline cart lifecycles.
- **Flush-pending-tx trust model** (C4): the server blindly accepts `ownerUserIdSnapshot` from the client, breaking settlement integrity.
- **Missing `category` in types test fixtures** causes 2 test failures.

**Recommendations**
- Fix C1–C5 before the first event.
- Add `create_cart` and `create_cart_item` to the push protocol, or explicitly document the local-only cart design.
- Verify `ownerUserIdSnapshot` server-side in `flush-pending-tx`.

### 2) Testing

**Strengths**
- 60 tests across 14 files covering auth, authz, carts, backup, settlement, sync, DB triggers, QR generation, sync protocol, and UI components.
- API tests use real Fastify + SQLite (good integration fidelity).
- `test-migrations.ts` automatically discovers and applies Drizzle migrations.

**Issues**
- **Active failures**: `packages/types/src/card.test.ts` (2 failures due to missing `category`).
- **Double runs**: `dist/` is not excluded in Vitest configs.
- **Workspace mode broken for web**: `jsdom` environment is lost when running from the root workspace.
- **Critical paths untested**: void/refund, oversold resolution, flush-pending-tx, settlement math with voids, backup integrity (only ZIP header checked), card CRUD, holds, events, settings.
- **No E2E tests**: Playwright/Cypress not present; the full POS checkout flow is unverified end-to-end.

**Recommendations**
- Fix types test fixtures; exclude `dist/`; configure workspace `environmentMatchGlobs`.
- Add route-level tests for `transactions.ts` (void/refund), `cards.ts`, `holds.ts`, and `flush-pending-tx.ts`.
- Add a settlement-math unit test that asserts correct per-owner totals after a sale + void sequence.

### 3) Security

**Strengths**
- bcrypt-only (cost 12) with no SHA-256 fallback.
- Helmet, CORS allowlist, and opt-in rate-limiting registered.
- `sameSite=strict`, `httpOnly` session cookies.
- Audit plugin redacts passwords and session secrets.
- Sync push uses strict Zod schemas with `.strict()` to reject unknown keys.
- Cart/hold ownership guards prevent cross-user mutation.

**Issues**
- **Session fixation** (H5): login does not regenerate session ID.
- **`flush-pending-tx` snapshot forgery** (C4): unverified `ownerUserIdSnapshot`.
- **`.env` weak password** (M3): `ADMIN_PASSWORD=changeme` on disk.
- **No CSRF token**: mitigated by `sameSite=strict` and same-domain deployment, but no explicit double-submit cookie.
- **`/transactions` and `/sync/pull` expose broad data**: any authenticated cashier can read all transactions and all cards (acceptable for this threat model, but worth documenting).

**Recommendations**
- Regenerate session ID on login.
- Server-verify `ownerUserIdSnapshot` in flush-pending-tx.
- Rotate the local `.env` admin password and add a weak-password startup warning.

### 4) Performance & Scalability

**Strengths**
- SQLite + WAL mode is appropriate for a single-booth, 11-user deployment.
- Cursor-based delta sync avoids re-downloading unchanged data.
- Monthly report now filters at the SQL level (`gte`/`lt` on `paid_at`).

**Issues**
- **Missing indexes** (H1) cause full table scans on nearly every hot path.
- **Unbounded queries** (H2) load entire datasets into memory.
- **N+1 loops** (H6) update cards one at a time.
- **Audit pruner OOM risk**: loads all old audit rows into memory at once.
- Initial sync pull dumps the full card inventory; for a large event this could be megabytes.

**Recommendations**
- Add the indexes listed in H1.
- Cap or paginate unbounded queries.
- Batch update loops.

### 5) Reliability & Stability

**Strengths**
- Append-only DB triggers prevent accidental `UPDATE`/`DELETE` on transactions and transaction_items.
- `client_id` deduplication prevents double-inserts on retries.
- `db.transaction()` wrappers ensure atomicity for cart pay, abandon, void, and flush.
- Health endpoint provides liveness + shallow DB probe.

**Issues**
- **Inventory races** (C1–C3, C5): void, hold expiry, and hold creation can corrupt card status.
- **Backup temp leak** (H4): client abort may leave snapshot files in `/tmp`.
- **No graceful shutdown** (M5): cron jobs and DB connections are not cleaned up on `SIGTERM`.
- **Sync cursor advances on partial failure** (`background-sync.ts`): if `flushPendingTransactions` succeeds but `deltaSyncPull` fails, the cursor may still advance, causing missed server-side changes. (The current code actually does not advance cursor on pull failure, but if individual changes fail in `applyChanges`, they are logged with `console.warn` and skipped.)
- **POSPage `handleRemoveItem`** (`apps/web/src/pages/POSPage.tsx:753-793`): always calls the live API first, then deletes locally. Offline removal fails silently at the API call and the local cleanup may not run.

**Recommendations**
- Fix status races.
- Harden backup cleanup.
- Implement graceful shutdown.
- Make remove-item offline-aware (skip API call when offline, or queue an op).

### 6) Monitoring & Logging (Observability)

**Strengths**
- Fastify logger enabled with structured objects (`event: "sale_completed"`, etc.).
- Health endpoint exposes `users`, `activeDraftCarts`, `uptimeSec`.
- Audit log captures mutations with redaction.
- Sync state store tracks `pendingTransactionCount`.

**Issues**
- **`console.warn` in background sync** instead of structured logging.
- **No correlation IDs** across requests.
- **Audit truncation** (M2) can create invalid JSON.
- **No alert/metric on flush-pending-tx rejection**: if the server rejects an offline sale, the cashier may not notice until they check the SyncDot.
- **No request-timing metrics** for slow queries.

**Recommendations**
- Replace `console.warn` with a structured logger or at least prefix with `[sync]` consistently.
- Add a small diagnostic panel (admin-only) showing last sync error, pending count, and device ID.

### 7) Deployment & DevOps (Local-first)

**Strengths**
- `pnpm dev`, `pnpm test`, `pnpm build`, `pnpm typecheck` all work from root.
- Turbo pipeline is clean.
- `loadConfig()` fails fast with human-readable messages.
- `mkdirSync` ensures storage directories exist on first boot.
- Runbook covers pre-event, day-of, and recovery procedures thoroughly.

**Issues**
- **`pnpm test` from root fails** because of types test failures and web test environment mismatch.
- **`archiver` in devDependencies** (L1) breaks production installs.
- **No `lint` implementation** (L3).
- `.env` contains a real 64-hex `SESSION_SECRET` and `ADMIN_PASSWORD=changeme` on disk.

**Recommendations**
- Fix tests; move `archiver` to `dependencies`; add ESLint/Biome.
- Add a pre-commit hook (optional) or at least document that `.env` must not be shared.

### 8) Configuration & Environment Management

**Strengths**
- `.env.example` is clear and well-commented.
- `loadConfig()` uses Zod with placeholder rejection, numeric coercion, and cross-field validation (admin vars must be both set or both unset).
- `DOMAIN` is required in production.
- `SESSION_SECRET` minimum length enforced.

**Issues**
- `.env` on disk has a hardcoded secret and weak admin password (M3).
- Settings values accept `z.unknown()` (inferred from `settings.ts` usage) — any JSON shape is accepted without validation.

**Recommendations**
- Add a settings value schema (e.g., `max_line_discount_pct_fixed` must be `z.number().min(0).max(100)`) and validate on write.
- Document secret rotation procedure.

### 9) User Experience (UX)

**Strengths**
- Mobile-first, Bahasa Indonesia cashier UI.
- Masked amounts with tap-and-hold reveal (now correctly gated).
- Offline banner, sync dot, and network mode toggle.
- Camera scanner + USB HID scanner support.
- Receipt modal with transaction ID.

**Issues**
- **Bottom-price reveal hold time mismatch**: `POSPage.tsx:68` passes `2000` ms to `useTapHoldReveal`, but the hook default is `5000` ms. The PRD and CLAUDE.md specify 5s.
- **Sync error opacity**: cashiers see a red dot but get no actionable guidance if a pending transaction fails to flush.
- **Offline remove-item**: `handleRemoveItem` tries the API first; if offline, it may appear to fail even though local cleanup eventually runs (best-effort catch).

**Recommendations**
- Align POSPage hold time with the 5s default (or make it a setting).
- Surface flush-pending-tx errors in a toast or modal.

### 10) Compliance & Legal

**Strengths**
- `LICENSE` file present (UNLICENSED / proprietary).
- Data-retention policy documented (`docs/data-retention-policy.md`).
- Audit log redacts sensitive keys.

**Issues**
- **Audit log stores response bodies** (up to 2000 chars), which may include PII (customer notes, cashier names, card titles) without explicit consent documentation.
- **Photos** stored in `storage/photos/` have no documented retention or deletion policy.
- **No PII handling notice** for end users (cashiers or card owners).

**Recommendations**
- Add a brief data-handling note to the runbook specifying what PII is captured (emails, display names, photos) and how long it is retained.
- Consider excluding `notes` and `customerLabel` fields from audit `diffJson` to reduce PII surface.

### 11) Documentation & Knowledge Sharing

**Strengths**
- PRD (`01-prd.md`), implementation plan, runbook, ADRs, CLAUDE.md, CONTRIBUTING.md, and per-milestone progress notes are all present and well-organized.
- README is accurate and up-to-date.
- `docs/INDEX.md` provides an excellent agent-facing map.
- Inline comments explain non-obvious logic (e.g., proportional discount share in settlement).

**Issues**
- **No inline documentation** of the `flush-pending-tx` trust model: a reader cannot easily tell that `ownerUserIdSnapshot` is client-controlled.
- **Missing troubleshooting guide** for "sync failed", "pending transactions not flushing", or "oversold queue not clearing".

**Recommendations**
- Add a short ADR or inline comment block explaining the offline flush design and its security assumptions.
- Add a "Troubleshooting" section to `03-runbook.md` covering common sync and oversold scenarios.

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

| Item | Effort | Owner | File(s) |
|------|--------|-------|---------|
| Fix void/refund oversold reopen (C1) | S | Backend | `apps/api/src/routes/transactions.ts` |
| Fix hold expiry sold-card race (C2) | XS | Backend | `apps/api/src/jobs/cart-sweeper.ts` |
| Reject holds on locked-cart cards (C3) | S | Backend | `apps/api/src/routes/holds.ts` |
| Verify `ownerUserIdSnapshot` in flush (C4) | S | Backend | `apps/api/src/routes/flush-pending-tx.ts` |
| Add hold check at cart pay time (C5) | S | Backend | `apps/api/src/routes/carts.ts` |
| Fix types test fixtures (H3) | XS | Shared | `packages/types/src/card.test.ts` |
| Exclude `dist/` from Vitest (H3) | XS | All | `vitest.config.ts` files |
| Move `archiver` to `dependencies` (L1) | XS | Backend | `apps/api/package.json` |
| Regenerate session ID on login (H5) | XS | Backend | `apps/api/src/routes/auth.ts` |
| Add backup abort cleanup (H4) | XS | Backend | `apps/api/src/routes/backup.ts` |

### Phase 2: Short-term improvements (1–2 weeks)

| Item | Effort | Owner | File(s) |
|------|--------|-------|---------|
| Add missing DB indexes (H1) | M | Backend | `packages/db/drizzle/0004_add_indexes.sql` |
| Cap unbounded queries / paginate sync (H2) | M | Backend | `apps/api/src/routes/sync.ts`, `settlement.ts` |
| Batch N+1 update loops (H6) | M | Backend | `carts.ts`, `transactions.ts`, `cart-sweeper.ts` |
| Add route tests for void/refund, holds, flush (Testing) | M | Backend | `apps/api/src/routes/*.test.ts` |
| Fix web test workspace mode (H3) | M | Frontend | `vitest.workspace.ts`, `apps/web/vitest.config.ts` |
| Add graceful shutdown (M5) | S | Backend | `apps/api/src/server.ts` |
| Add `create_cart` / `create_cart_item` to push (M1) | M | Backend + Frontend | `apps/api/src/routes/sync.ts`, `apps/web/src/lib/background-sync.ts` |
| Audit log JSON-safe truncation (M2) | S | Backend | `apps/api/src/plugins/audit.ts` |
| Rotate local `.env` password and document (M3) | XS | Ops | `.env`, `README.md` |

### Phase 3: Longer-term refactors (2–6 weeks)

| Item | Effort | Owner | File(s) |
|------|--------|-------|---------|
| Push settlement aggregation into SQL | L | Backend | `apps/api/src/routes/settlement.ts` |
| Add Playwright E2E tests for POS happy path | L | QA | `apps/web/e2e/` |
| Implement ESLint/Biome linting pipeline | M | Infra | Root + workspace configs |
| Add structured client-side error reporting | M | Frontend | `apps/web/src/lib/background-sync.ts`, `SyncDot.tsx` |
| Add correlation IDs and request-timing metrics | M | Backend | `apps/api/src/plugins/` |
| Batch audit-pruner with LIMIT loop | S | Backend | `apps/api/src/jobs/audit-pruner.ts` |
| Document data-retention / PII handling for photos | XS | Docs | `docs/data-retention-policy.md` |

## Appendix

### How to run/build/test locally (as verified from repo)

```bash
# Prerequisites: Node >= 22, pnpm >= 10
pnpm install

# Copy and edit env
# cp .env.example .env   # already present in working tree

# Dev mode (API on :3001, Vite PWA on :5173)
pnpm dev

# Run tests (currently fails on types tests + web workspace mode)
pnpm test

# Type-check all workspaces
pnpm typecheck

# Build all workspaces
pnpm build

# Run API standalone
pnpm --filter @kolektapos/api dev

# Run web standalone
pnpm --filter @kolektapos/web dev
```

**Known local run issues:**
- `pnpm test` from root fails because `packages/types` tests fail and Turbo halts.
- Workaround: run individual workspaces with `pnpm --filter <name> test`.
- Web tests require `jsdom` and may fail in workspace mode.

### Notable files reviewed

- `apps/api/src/routes/{auth.ts,cards.ts,carts.ts,transactions.ts,sync.ts,flush-pending-tx.ts,settlement.ts,backup.ts,health.ts,holds.ts,users.ts}`
- `apps/api/src/plugins/{auth-guard.ts,session.ts,audit.ts}`
- `apps/api/src/jobs/{cart-sweeper.ts,audit-pruner.ts}`
- `apps/api/src/{server.ts,config.ts}`
- `apps/web/src/pages/{POSPage.tsx,OversoldQueuePage.tsx}`
- `apps/web/src/hooks/useTapHoldReveal.ts`
- `apps/web/src/lib/{background-sync.ts,api.ts,db.ts}`
- `apps/web/src/store/sync-state.ts`
- `packages/db/src/{schema.ts,seed.ts}`
- `packages/types/src/{card.ts,card.test.ts}`
- `packages/sync/src/protocol.ts`

### Dependency notes

- **Runtime:** Fastify 5, better-sqlite3 11, Drizzle ORM 0.38, bcryptjs, node-cron, archiver, dotenv, zod.
- **Frontend:** React 19, Vite 6, TanStack Query 5, Zustand 5, Dexie 4, react-router 7, Tailwind 3, vite-plugin-pwa.
- **No known critical CVEs** in the direct dependency list at time of review, but `bcryptjs` is a pure-JS implementation; consider migrating to `bcrypt` (native binding) for better performance if login latency becomes an issue.
- `archiver` should be moved from `devDependencies` to `dependencies` in `apps/api`.
