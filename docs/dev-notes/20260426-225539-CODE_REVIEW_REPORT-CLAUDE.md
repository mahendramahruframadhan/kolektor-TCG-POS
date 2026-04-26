# Code Review Report – KolektaPOS

**Date:** 2026-04-26 22:55:39
**Reviewer:** Claude Opus 4.7 (1M context) — Anthropic Claude Code
**Scope:** Full repository review — local-first focus; CI/CD not applicable
**Commit/Version:** `94f8e9c` on `main` — feat(sync): photo upload; shared test helpers; remove empty packages/ui

---

## Executive Summary

KolektaPOS is a well-engineered, purpose-built local-first POS for a private 11-user TCG booth. The codebase reflects mature architectural discipline: append-only financial ledger enforced by both ORM and SQLite triggers, idempotent sync via `clientId` UUIDs, clear ADR trail, fail-fast env validation, structured pino logging, and a thorough offline → flush → settlement path. The majority of this review confirms work already done correctly.

Four issues warrant attention before the next live event: the `flush-pending-tx` route has a data-integrity bug where `return;` inside `db.transaction()` commits partial writes instead of rolling back; the offline pay path silently stores `eventId: ""` when no active event is found; server-side `max_transaction_discount_pct` enforcement is missing from the pay handler (only the client enforces it); and both stock-receive pages duplicate the short-ID generator using `Math.random()` instead of importing `generateShortId()` from `@kolektapos/qr`. All four are S-effort fixes.

Beyond those, the test suite has meaningful gaps (holds and settings routes have zero coverage), the `create_transaction` sync-push op creates a transaction header with no items (settlement shows zero revenue for those transactions), and `registerType: "autoUpdate"` can reload the PWA mid-transaction during a deployment.

**Top 5 risks:**
- **[High]** `flush-pending-tx` — `return;` inside `db.transaction()` commits partial writes; rejectReason path is broken (`flush-pending-tx.ts`, reliability)
- **[High]** Offline pay stores `eventId: ""` when no active event is in IDB (`POSPage.tsx:870`, data quality)
- **[High]** `max_transaction_discount_pct` is client-only — bypassed by direct API call (`carts.ts` pay handler, security/correctness)
- **[High]** `Math.random()` used for short-ID generation in `StockReceivePage` and `BulkImportPage` instead of `@kolektapos/qr` CSPRNG (`StockReceivePage.tsx:18`)
- **[Medium]** `create_transaction` sync-push op creates transaction headers with no `transaction_items` — settlement shows zero revenue (`sync.ts:174`)

**Quick wins (all S effort, ≤30 min each):**
- Replace `return;` with `throw new Error(reason)` inside `db.transaction()` in `flush-pending-tx.ts`
- Guard offline pay against `activeEvent === null` in `POSPage.tsx`
- Add `max_transaction_discount_pct` read + check in `POST /carts/:id/pay`
- Replace local `genShortId()` in `StockReceivePage.tsx` and `BulkImportPage.tsx` with `generateShortId()` from `@kolektapos/qr`
- Change `registerType: "autoUpdate"` to `"prompt"` in `vite.config.ts`
- Update `CLAUDE.md` Repository Status section (stale: still says "no source code yet")
- Wrap `@fastify/swagger` schema registration in `NODE_ENV !== "production"` guard (same as swagger-ui)

---

## Scorecard (0–10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | **7/10** | Architecture is sound; four findable correctness bugs (partial commit, eventId empty, discount cap bypass, Math.random) prevent a higher score |
| Testing | **6/10** | Good on critical financial paths (settlement math, flush, transactions, sync protocol); zero coverage for holds, settings, monthly report, PWA auth flows |
| Security | **7/10** | Strong primitives (bcrypt 12, sameSite=strict, Zod everywhere, audit redaction, rate limits on auth). Gaps: no `users.isActive`, Swagger schema exposed in prod, `photoPath` accepted from sync client |
| Performance & Scalability | **8/10** | SQLite WAL + good indexes; pagination on all list endpoints; minor N+1 in void handler; settlement group-by could move to SQL |
| Reliability & Stability | **7/10** | Transactional boundaries mostly correct; `db.transaction()` `return;` rollback bug is the one critical gap; no backoff on sync retry |
| Observability | **7/10** | Structured pino logs, `sale_completed` and `oversold_detected` events, audit log with redaction, `/health/deep`. Gaps: no request-ID header returned to client, `console.warn` in sync layer not surfaced to operator UI |
| Local Deployment & DevOps | **8/10** | `pnpm dev` works; `.env.example` well-documented; fail-fast boot; migrations auto-apply; runbook exists. No automated test gate on push |
| Configuration & Environment | **9/10** | Zod-parsed env, placeholder rejection, admin-vars-paired guard. Minor: `seed.ts` reads env directly; no `LOG_LEVEL` knob |
| UX | **7/10** | Bahasa Indonesia, scan-first, masked prices, offline banner, receipt modal. `autoUpdate` SW reload risk; no progress on tap-and-hold; `lastSyncAt` not shown |
| Compliance & Legal | **7/10** | `UNLICENSED` correct; data retention policy documented; PII limited to email/displayName. `xlsx` 0.18.x has known advisories; photos never cleaned up on card retirement |
| Documentation & Knowledge Sharing | **8/10** | PRD, implementation plan, runbook, 7 ADRs, milestone logs, prior reviews. `CLAUDE.md` status section stale; ADR numbering gap (0006 missing); flush trust model underdocumented |

**Average Score: 7.4/10**

**Overall judgment:** *Ship-ready for local event use after fixing the four High findings (flush rollback, empty eventId, discount cap, Math.random). Remaining items are defense-in-depth or test coverage gaps that don't block the booth.*

---

## Architecture Snapshot

**Stack:** Turbo 2 + pnpm 10 monorepo. Node 22, TypeScript 5.6 (strict).

**API (`apps/api`):** Fastify 5 + better-sqlite3 11 + Drizzle 0.38. Plugins: `@fastify/session` (in-memory, sameSite=strict), `@fastify/multipart`, helmet, CORS, rate-limit, audit `onSend` hook. Background jobs: cart sweeper (*/5 cron), audit pruner (daily 03:17).

**Web (`apps/web`):** React 19 + Vite 6 + vite-plugin-pwa (Workbox). Dexie 4 for IndexedDB, TanStack Query 5 (localStorage persister), Zustand 5. Background sync: 60s interval + opportunistic on mode change.

**Packages:** `db` (Drizzle schema + migrations 0000–0006 + append-only triggers), `types` (Zod input schemas), `sync` (discriminated union push/pull protocol), `qr` (short-ID generator).

**Key flows:**
1. Online POS: scan → IDB lookup → cart add (server locks card) → pay (server inserts transaction + items inside `db.transaction()`) → receipt
2. Offline POS: scan → IDB lookup → local IDB cart → pay → `pendingTransactions` queue → background flush → server validates + inserts
3. Sync: `resetAndSync()` on login (cursor=0 full pull), then 60s delta pulls

---

## Findings (Prioritized)

### High

---

#### [H-1] `flush-pending-tx` `return;` inside `db.transaction()` does not rollback — partial writes committed

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Functional defects
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:94–176`
- **Problem:** better-sqlite3 synchronous transactions roll back on **thrown exceptions**, not on `return`. The code sets `rejectReason = "subtotalIdr mismatch"` then calls `return;` inside the transaction callback. For reject paths that execute *after* `db.insert(transactions)` already ran (e.g. the "card not found" branch at line 129), the transaction header row is **committed** even though `rejectReason` is set, producing an orphaned `transactions` row with no `transaction_items`. Settlement queries will then show a zero-revenue transaction. The two arithmetic checks (lines 97–103) execute before any inserts, so those reject paths are safe — only the card-not-found path is currently broken.
- **Impact:** Orphaned transaction header rows in the DB; settlement underreports revenue; audit log contains phantom transactions.
- **Recommendation:** Replace all `return;` inside the transaction callback with `throw new Error(reason)`. Catch the thrown error outside the `db.transaction()` call and assign `rejectReason`. Add a test: flush with a non-existent `cardId` and assert no `transactions` row was inserted.
- **Suggested fix:**
  ```ts
  let rejectReason: string | null = null;
  try {
    db.transaction(() => {
      // validate totals ...
      if (computedSubtotal !== tx.subtotalIdr) throw new Error("subtotalIdr mismatch");
      // ...
      const card = cardMap.get(item.cardId);
      if (!card) throw new Error(`Card ${item.cardId} not found`);
      // inserts ...
    });
  } catch (err) {
    rejectReason = err instanceof Error ? err.message : "unknown error";
  }
  if (rejectReason) {
    results.push({ clientId: tx.clientId, status: "rejected", reason: rejectReason });
    continue;
  }
  ```

---

#### [H-2] Offline pay stores `eventId: ""` when no active event is found in IDB

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functional defects / Data integrity
- **Location:** `apps/web/src/pages/POSPage.tsx` (offline pay branch, ~line 870)
- **Problem:** The offline pay path uses `activeEvent?.id ?? ""` as the `eventId` for the pending transaction. If no active event is in IDB (device never synced, or event was closed while offline), `eventId: ""` is stored. When the transaction is later flushed, `PendingTxSchema` validates `eventId: z.string()` (no UUID constraint) — the server accepts it and attempts to insert `event_id = ""` which violates the FK constraint, producing a SQLite error. The transaction is rejected but the cashier sees only the generic "rejected" status — no clear error at pay time.
- **Impact:** The offline transaction is permanently unrecoverable; the cashier doesn't know at pay time that the transaction will be rejected later.
- **Recommendation:** Before writing to `pendingTransactions`, guard:
  ```ts
  if (!activeEvent) {
    setPayError("Tidak ada event aktif. Tidak bisa bayar dalam mode offline.");
    return;
  }
  ```

---

#### [H-3] `max_transaction_discount_pct` not enforced server-side — bypassable via direct API call

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security / Functional defects
- **Location:** `apps/api/src/routes/carts.ts` (pay handler), `apps/api/src/routes/flush-pending-tx.ts`
- **Problem:** `PayCartSchema` accepts `discountIdr: z.number().int().min(0)` with no upper bound. The server does not read `max_transaction_discount_pct` from the `settings` table before inserting the transaction. A crafted `POST /carts/:id/pay` with `discountIdr: 999999999` is accepted. The max-line-discount cap is correctly enforced in `POST /carts/:id/items` but the transaction-level cap is client-only enforcement in `POSPage.tsx:175`.
- **Impact:** Any authenticated cashier can manually override the discount cap via a direct API request, giving away an arbitrarily large discount. Affects settlement payouts.
- **Recommendation:** In the pay handler, read `max_transaction_discount_pct` from settings (already available via `getCartIdleTtlMinutes` pattern), compute `maxDiscountIdr = Math.floor(subtotalIdr * maxPct / 100)`, and return 422 if `discountIdr > maxDiscountIdr`. Apply the same check in `flush-pending-tx`.

---

#### [H-4] `Math.random()` used for short-ID generation in `StockReceivePage` and `BulkImportPage` — bypasses CSPRNG in `@kolektapos/qr`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functional defects / Code quality
- **Location:** `apps/web/src/pages/StockReceivePage.tsx:18`, `apps/web/src/pages/BulkImportPage.tsx:61`
- **Problem:** Both pages define a local `genShortId()` function using `Math.floor(Math.random() * 36)` for the 5-char random segment. `packages/qr/src/index.ts` was recently updated to use `crypto.getRandomValues()` (the canonical implementation), but the two pages are not importing from it — they maintain their own duplicates with the weaker PRNG. This also creates a duplication maintenance risk: future changes to the ID format (e.g. new owner-index mapping) would need to be applied in three places.
- **Impact:** Lower entropy short IDs; format drift if `@kolektapos/qr` changes; violates DRY.
- **Recommendation:**
  ```ts
  import { generateShortId } from "@kolektapos/qr";
  // replace local genShortId(ownerIndex) with generateShortId(ownerIndex)
  ```
  Delete both local `genShortId` implementations.

---

### Medium

---

#### [M-1] `create_transaction` sync-push op creates transaction header with no `transaction_items`

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Functional defects / Architecture
- **Location:** `apps/api/src/routes/sync.ts:174–200`
- **Problem:** The `create_transaction` handler in `/sync/push` inserts a row into `transactions` but never inserts any `transaction_items`. `CreateTransactionOpPayloadSchema` has no `items` field. Any transaction inserted this way will show zero revenue in settlement (`SELECT SUM(sold_price_idr) FROM transaction_items WHERE transaction_id = ?`).
- **Impact:** If any client ever uses this op (it is in the `SyncOpTypeSchema` enum), settlement is silently under-reported. Even if no client currently sends this op, the dead code path is a maintenance risk.
- **Recommendation:** Either (a) remove `create_transaction` from `SyncOpTypeSchema` and route all offline transactions through `flush-pending-tx` (the explicit, validated offline path), or (b) extend the schema to require `items` and insert them. Document the intended scope in an ADR update.

---

#### [M-2] Fixed-price floor check compares pre-discount price, not effective sold price

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Functional defects
- **Location:** `apps/api/src/routes/carts.ts:166–172`
- **Problem:** For `pricingMode === "fixed"`, the floor check is `if (body.data.intendedPriceIdr < listedPrice)`. A cashier can set `intendedPriceIdr = listedPrice` (passes the check) and then apply a large `lineDiscountIdr`, making the effective sold price arbitrarily low. The `max_line_discount_pct_fixed` setting provides a percentage cap, but that cap is a percentage of `listedPrice`, not of `bottomPriceIdr`. For negotiable cards, the check correctly computes `effectiveSoldPrice = intendedPriceIdr - lineDiscountIdr`.
- **Recommendation:** Unify the floor check: `const effectiveSoldPrice = body.data.intendedPriceIdr - body.data.lineDiscountIdr; if (effectiveSoldPrice < listedPrice && !body.data.requiresAdminOverride) return reply.status(422)...`.

---

#### [M-3] `holds.ts` request body uses raw TypeScript cast instead of Zod schema

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Code quality / Security
- **Location:** `apps/api/src/routes/holds.ts:16`
- **Problem:** `const body = request.body as { cardId?: string; ... }` — raw cast. `customerLabel` and `notes` are never length-validated and could be unbounded strings. This is inconsistent with every other route that uses `z.object({...}).safeParse()`.
- **Recommendation:** Define `CreateHoldSchema` in `packages/types/src/hold.ts` (or inline) and use `.safeParse()` in the route handler.

---

#### [M-4] Payment channel existence not validated at cart pay time

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functional defects / Reliability
- **Location:** `apps/api/src/routes/carts.ts` (pay handler)
- **Problem:** `PayCartSchema` validates `paymentChannelId: z.string().uuid()` but the server never queries `paymentChannels` to confirm the channel exists and `isActive = true`. With FK enforcement enabled, this will throw a SQLite constraint error (500) rather than returning a clean 422.
- **Recommendation:** Add `db.select().from(paymentChannels).where(and(eq(paymentChannels.id, id), eq(paymentChannels.isActive, true))).get()` check, returning 422 if not found/inactive.

---

#### [M-5] Audit captures response body only — input context (override reason, card price) missing for financial mutations

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Observability / Compliance
- **Location:** `apps/api/src/plugins/audit.ts:42–104`
- **Problem:** The `onSend` hook stores the response payload. For `POST /carts/:id/items`, the audit record shows the updated cart state but not the input (card ID, intended price, override reason). The `auditExtra` mechanism compensates for void/refund, but not for add-item with override — the most financially sensitive operation.
- **Recommendation:** In the `POST /carts/:id/items` handler, attach `request.auditExtra = { cardId: body.data.cardId, intendedPriceIdr: body.data.intendedPriceIdr, requiresAdminOverride: body.data.requiresAdminOverride, overrideReason: body.data.overrideReason }` before calling reply.

---

#### [M-6] No tests for `holds.ts` routes

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Testing
- **Location:** `apps/api/src/routes/holds.ts` — no `holds.test.ts`
- **Problem:** Hold creation, hold release, and hold listing have zero test coverage. Edge cases uncovered include: creating a hold on a locked card (should 409), releasing an already-released hold (line 83 checks but untested), hold expiry guard (tested via sweeper but not via the HTTP route).
- **Recommendation:** Create `apps/api/src/routes/holds.test.ts` using the shared `createTestDb`/`seedUser`/`seedEvent` helpers + the Fastify inject pattern. Cover: happy-path create, 409 on non-available card, 409 on locked-by-cart card, successful release, double-release 409.

---

#### [M-7] No tests for `settings.ts` routes

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Testing
- **Location:** `apps/api/src/routes/settings.ts` — no `settings.test.ts`
- **Problem:** Settings drive critical business guardrails. No test verifies that `validateSetting` rejects unknown keys, that an invalid value (e.g. `max_line_discount_pct_fixed: 200`) is rejected with 422, or that OCC version conflict returns 409.
- **Recommendation:** `apps/api/src/routes/settings.test.ts` — cover: GET returns all settings, PUT happy path, PUT with invalid value → 422, PUT with wrong version → 409.

---

#### [M-8] Monthly report (`GET /reports/monthly`) has no unit test

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Testing
- **Location:** `apps/api/src/routes/settlement.ts:202–271`
- **Problem:** The monthly roll-up has different query logic, per-day breakdown, and time-based filtering compared to the event settlement (which is tested in `settlement.test.ts`). The `Math.floor + last-item residual` discount distribution appears in both paths but only the event path is covered.
- **Recommendation:** Add monthly report tests to `settlement.test.ts`: seed transactions across two months, verify gross/net/day-breakdown for the correct month, verify void is subtracted.

---

#### [M-9] `create_transaction` sync-push op has no test verifying items are created

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Testing
- **Location:** `apps/api/src/routes/sync.test.ts`
- **Problem:** Even if finding M-1 is addressed (items added to the op), a regression test that verifies both the transaction header AND items exist after a push would prevent recurrence.

---

#### [M-10] Swagger OpenAPI schema exposed in production (`GET /documentation/json`)

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security
- **Location:** `apps/api/src/server.ts:82–95`
- **Problem:** `@fastify/swagger` is registered unconditionally. Only `swaggerUi` (the HTML UI at `/docs/api`) is gated by `NODE_ENV !== "production"`. The machine-readable JSON schema (`GET /documentation/json`) remains accessible in production, listing all route URLs, parameters, and security scheme names.
- **Recommendation:** Wrap the entire `swagger` registration (not just the UI) in `if (cfg.NODE_ENV !== "production")`.

---

#### [M-11] `photoPath` accepted from sync-push client without path-pattern validation

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Security
- **Location:** `packages/sync/src/protocol.ts:41` (`photoPath: z.string().optional()`), `apps/api/src/routes/sync.ts:169` (spread into INSERT)
- **Problem:** A client can set `photoPath` to an arbitrary string (e.g. `"../../../etc/cron.d/evil"`) via the sync push payload. This string is stored in the DB. The photo upload endpoint itself is safe (UUID-validates the filename), but if `photoPath` is later used to construct a filesystem path for serving static files, it is a path-traversal vector.
- **Recommendation:** Strip `photoPath` from `CreateCardOpPayloadSchema` entirely — it should only be set by the server after a validated photo upload. Or add a regex validator: `photoPath: z.string().regex(/^\/storage\/photos\/[0-9a-f-]{36}\.(jpg|png|webp)$/).optional()`.

---

#### [M-12] No `users.isActive` flag — departed users can authenticate with remembered password

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Security
- **Location:** `packages/db/src/schema.ts` (`users` table), `apps/api/src/routes/auth.ts:23–38`
- **Problem:** The data retention policy says to "mark the user as disabled" by rotating their password, but `users` has no `isActive` column. If a departed co-owner remembers their old password, they can authenticate indefinitely — there is no account deactivation mechanism.
- **Recommendation:** Add `isActive: integer("is_active", { mode: "boolean" }).notNull().default(true)` to the `users` table in a new migration. Check `!user.isActive` in the login handler, returning 401. Update `GET /users` to expose the field for admin management.

---

#### [M-13] Background sync retries at fixed 60-second interval with no exponential backoff

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability
- **Location:** `apps/web/src/lib/background-sync.ts:232–253`
- **Problem:** On persistent server errors (5xx, maintenance window), every device retries every 60 seconds. With 11 devices that is 11 requests/minute to a degraded server. The rate limit at 60/min on sync endpoints means individual devices would hit limits after about a minute of degraded service, causing confusing rate-limit errors.
- **Recommendation:** Maintain a consecutive-failure counter; after 3 failures, fall back to a 5-minute retry interval. Reset on success:
  ```ts
  let consecutiveFailures = 0;
  // inside the setInterval callback:
  try { ...; consecutiveFailures = 0; }
  catch { consecutiveFailures++; }
  const nextInterval = consecutiveFailures >= 3 ? 5 * 60 * 1000 : 60 * 1000;
  // reschedule with nextInterval
  ```

---

#### [M-14] `deltaSyncPull` recurses on `hasMore: true` with no depth guard

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability
- **Location:** `apps/web/src/lib/background-sync.ts:175–178`
- **Problem:** If a bug causes `hasMore` to be stuck `true`, the function calls itself indefinitely until a stack overflow. A guard (`if (depth > 20) throw new Error("hasMore depth exceeded")`) or a loop-based approach prevents runaway recursion.

---

#### [M-15] `registerType: "autoUpdate"` can reload the PWA mid-transaction when a new build is deployed

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** UX / Reliability
- **Location:** `apps/web/vite.config.ts:9`
- **Problem:** `autoUpdate` causes the service worker to skip waiting and claim all clients immediately on a new build deploy. If a cashier has a cart open and a deployment happens, the page can be reloaded, resetting React component state (active cart ID in memory, scan state, etc.). IDB data persists, but the cart UI would reset.
- **Recommendation:** Change to `registerType: "prompt"` and display a `"Versi baru tersedia — perbarui saat keranjang kosong?"` banner via `useRegisterSW`. This lets the operator choose when to reload — between transactions.

---

#### [M-16] No request correlation ID returned to clients

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Observability
- **Location:** `apps/api/src/server.ts:51`
- **Problem:** Fastify auto-generates a `reqId` per request but does not return it as a response header. Operators debugging a cashier-reported error cannot correlate the client-side failure with a server log line without knowing the exact timestamp and endpoint.
- **Recommendation:** Add to Fastify options: `genReqId: () => crypto.randomUUID()`. Add a `onSend` hook: `reply.header("x-request-id", request.id)`. Include `requestId` in audit log rows.

---

#### [M-17] `CLAUDE.md` Repository Status section is stale

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Documentation
- **Location:** `CLAUDE.md:7`
- **Problem:** Still reads "Monorepo scaffold only; no source code yet." The implementation is MVP-complete with a full offline POS, sync engine, settlement reports, E2E tests, and hardened security. AI agents and new contributors reading this file will have a fundamentally wrong mental model of the project state.
- **Recommendation:** Update to: `MVP complete — full offline POS, sync, settlement, E2E tests. Run: pnpm dev (API :3001, web :5173). pnpm test (green). pnpm e2e (Playwright, 5 tests).`

---

#### [M-18] ADR numbering gap — ADR-0006 is missing; filename convention is inconsistent

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Documentation
- **Location:** `docs/adr/` directory
- **Problem:** ADR files go 0000 → 0005, then jump to `ADR-0007-offline-cart-design.md` (note: full "ADR-" prefix in filename, unlike the others which use `0000-*.md`). ADR-0006 is missing entirely.
- **Recommendation:** Create `docs/adr/0006-withdrawn.md` (or renumber 0007 to 0006). Standardize filenames to `0000-name.md` format without the `ADR-` prefix.

---

### Low

---

#### [L-1] Settings OCC version check is opt-in — omitting `version` field silently overwrites

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Functional defects / Concurrency
- **Location:** `apps/api/src/routes/settings.ts:52`
- **Problem:** `if (existing && clientVersion !== undefined && existing.version !== clientVersion)` — only fires when `version` is sent. Clients that omit `version` silently overwrite regardless of concurrent edits. Acceptable for 11 users but semantically wrong for OCC.

---

#### [L-2] `POST /auth/me` (GET `/me`) has no rate limit

- **Severity / Confidence / Effort:** Low / Low / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:92`
- **Problem:** `/me` can be polled indefinitely without rate limiting. Low risk for a private intranet app.
- **Recommendation:** Add `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }`.

---

#### [L-3] `SESSION_SECRET` placeholder check is exact-match only

- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Security
- **Location:** `apps/api/src/config.ts:13–15`
- **Problem:** Only rejects the exact placeholder string. `"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"` (32 a's) passes. The 32-char minimum is the meaningful guard. A simple entropy check (e.g. `new Set(v).size > 10`) would improve robustness.

---

#### [L-4] Cart abandon does not verify card lock ownership before releasing

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Functional defects / Edge cases
- **Location:** `apps/api/src/routes/carts.ts:522–535`
- **Problem:** The abandon handler releases locks for all cards in the cart without checking `card.lockedByCartId === cartId`. Extremely unlikely to cause issues in practice (add-item rejects unavailable cards), but semantically incorrect.

---

#### [L-5] Audit pruner writes archive then deletes — crash between steps produces duplicate archive entries

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Reliability
- **Location:** `apps/api/src/jobs/audit-pruner.ts:62–71`
- **Problem:** If the process crashes after `appendFileSync` but before `db.delete`, the pruner will re-archive the same rows on the next run, producing duplicate entries in the JSONL archive. Benign operationally but inconsistent.
- **Recommendation:** Store a "being pruned" marker (e.g. a batch ID column on `auditLog`) and skip already-batched rows on re-run. Or use a two-phase approach where the delete happens inside the same transaction as the archive write marker.

---

#### [L-6] `xlsx` 0.18.x has known security advisories

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Compliance / Security
- **Location:** `apps/web/package.json:33`
- **Problem:** SheetJS Community Edition 0.18.x has reported prototype pollution and ReDoS advisories. For a private app that only imports operator-provided files, the attack surface is minimal. No untrusted user can upload CSV to the BulkImportPage.
- **Recommendation:** Run `pnpm audit` periodically. Consider migrating to `exceljs` or `papaparse` (for CSV only) if SheetJS proves problematic in a future version audit.

---

#### [L-7] No `users.isActive` check (see M-12)

Cross-referenced as Medium finding M-12 — listed here as Low only because the 11-user private deployment makes exploitation require physical access or prior credential knowledge.

---

#### [L-8] Photo not deleted when card is retired — data retention policy gap

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Compliance / Data retention
- **Location:** `docs/data-retention-policy.md §4`; `apps/api/src/routes/sync.ts` (card update path)
- **Problem:** The data retention policy documents "photos should be unlinked on card retirement" as a follow-up, but no code enforces it. Photos accumulate indefinitely on the VPS.
- **Recommendation:** When a card's status transitions to `"retired"` (if that status is ever implemented) or when a card is deleted (not current — cards are never deleted), unlink `<PHOTO_STORAGE_PATH>/<cardClientId>.*`. For now, document the manual cleanup procedure in the runbook.

---

#### [L-9] `carts.test.ts` uses bcrypt cost 10 instead of the shared helper's cost 4

- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Testing
- **Location:** `apps/api/src/routes/carts.test.ts:45`
- **Problem:** `bcrypt.hash("pw-cashier-12345", 10)` — the shared `test-helpers.ts` uses cost 4 for test speed. The inconsistency makes `carts.test.ts` noticeably slower than the other test files.
- **Recommendation:** Switch to `seedUser(sqlite, { ..., password: "pw-cashier-12345" })` using the shared helper.

---

#### [L-10] `seed.ts` reads `process.env` directly, bypassing validated config

- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Configuration
- **Location:** `packages/db/src/seed.ts:57–58`
- **Problem:** `seed.ts` reads `process.env.ADMIN_EMAIL` and `process.env.ADMIN_PASSWORD` directly. When called from `server.ts` after `loadConfig()`, the values are already validated. When run standalone (`tsx src/seed.ts`), there is no Zod validation — a password of "ab" (below the 8-char minimum) would be silently accepted.
- **Recommendation:** Accept an optional `{ adminEmail?: string; adminPassword?: string }` config parameter in `seed()` and pass `{ adminEmail: cfg.ADMIN_EMAIL, adminPassword: cfg.ADMIN_PASSWORD }` from `server.ts`.

---

#### [L-11] `SyncDot` does not show `lastSyncAt` — cashier cannot tell how stale IDB data is

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** UX
- **Location:** `apps/web/src/components/SyncDot.tsx`, `apps/web/src/store/sync-state.ts`
- **Problem:** `lastSyncAt` is stored in the sync state store but never rendered in the UI. A cashier who goes offline and then back online sees "Tersinkron" but has no indication of whether the data is 30 seconds or 30 minutes old.
- **Recommendation:** Add "Sinkron terakhir X menit lalu" to the SyncDot tooltip or title attribute using `lastSyncAt`.

---

#### [L-12] `Content-Security-Policy` disabled globally

- **Severity / Confidence / Effort:** Low / High / M
- **Category:** Security
- **Location:** `apps/api/src/server.ts:60`
- **Problem:** `contentSecurityPolicy: false` was set because "PWA lives on the same domain as the API." For the current dev-server setup (separate origins), any CSP would require `connect-src` configuration. A minimal production CSP would add meaningful XSS defense-in-depth.
- **Recommendation:** For a future single-origin deployment, add `contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], objectSrc: ["'none'"], upgradeInsecureRequests: [] } }`.

---

#### [L-13] `GET /transactions` has no date-range filter

- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Performance / API design
- **Location:** `apps/api/src/routes/transactions.ts:18–30`
- **Problem:** Only `?eventId=` filter exists. At multi-event scale, a cashier browsing `/transactions` could load thousands of rows even with pagination (5,000 max). A `?fromDate=` / `?toDate=` filter would be a useful addition.

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths:**
- Integer-IDR monetary values enforced consistently through schema, types, and API
- Append-only transactions backed by DB triggers — the most critical invariant is double-enforced
- `ownerUserIdSnapshot` correctly snapshotted at sale time; `flush-pending-tx` now overwrites client-supplied value with server truth
- Cart locking is denormalized as PRD specifies; lock/unlock is atomic within `db.transaction()`
- Idempotency via `clientId` on carts, transactions, cards — prevents double-inserts on retry
- `expireOverdueHolds` extracted and exported from `cart-sweeper.ts` — tested against the real implementation
- `@kolektapos/qr` `generateShortId()` uses `crypto.getRandomValues()`

**Issues:** H-1 (flush rollback), H-2 (empty eventId), H-3 (discount cap), H-4 (Math.random duplicates), M-1 (create_transaction no items), M-2 (fixed floor check), M-3 (holds body cast), M-4 (channel validation)

### 2) Testing

**Strengths:**
- API tests use real in-memory SQLite, no mocking — high fidelity
- `triggers.test.ts` verifies append-only at DB level
- `settlement.test.ts` has regression test for void double-negation
- `flush-pending-tx.test.ts` now covers owner verification, price floor, total mismatch
- `cart-sweeper.test.ts` uses the exported `expireOverdueHolds` function — tests real implementation
- 5 Playwright E2E tests covering auth, online sale, offline flush, oversold void
- Shared `test-helpers.ts` with `createTestDb/seedUser/seedEvent` standardises setup

**Gaps:** M-6 (holds), M-7 (settings), M-8 (monthly report), L-9 (carts.test.ts cost 10)

**Test count (verified):** ~88 source-level assertions across 9 API test files, 8 web unit test files, 3 package test files, and 4 Playwright spec files.

**How to run:**
```bash
pnpm test          # all unit tests (vitest)
pnpm e2e           # Playwright E2E (requires API running via globalSetup)
pnpm typecheck     # TypeScript
pnpm lint          # Biome
```

### 3) Security

**Strengths:**
- bcryptjs cost 12 with session cookie `httpOnly=true`, `sameSite=strict`, `secure` in production
- Rate limits: login (20/min), change-password (10/min), sync (60/min), backup (2/hr)
- Zod validation on all route bodies; holds body is the exception
- Sync push uses `z.discriminatedUnion` with per-op typed payloads
- `expireOverdueHolds` scopes card updates to `status='held'` — prevents sold-card overwrite
- `flush-pending-tx` now verifies `ownerUserIdSnapshot` against server DB, enforces price floor
- Audit log redacts SENSITIVE_KEYS before storage
- `session.regenerate()` on login to prevent session fixation

**Gaps:** M-10 (Swagger schema in prod), M-11 (photoPath in sync), M-12 (no isActive flag), L-3 (placeholder check), L-12 (no CSP)

### 4) Performance & Scalability

**Strengths:**
- SQLite WAL mode; `PRAGMA foreign_keys = ON` at connection time
- Indexes on hot-path FKs: `cards_owner_idx`, `cards_status_idx`, `ti_transaction_idx`, `ti_card_idx`, `cart_items_cart_id_idx`, `holds_card_id_idx`, `transactions_paid_at_idx`, `audit_created_at_idx` (and more, per migration 0004)
- Initial sync pull capped at 5,000 cards with `hasMore` cursor
- `inArray` chunked at 900 IDs in sync pull to avoid SQLite variable limit
- Cart sweeper batches card-lock release with `inArray` UPDATE

**Issues:** M (void N+1 per-card queries), settlement in-memory aggregation (acceptable at scale), L-13 (no date filter on transactions)

### 5) Reliability & Stability

**Strengths:**
- All critical mutations (pay, abandon, void, flush) wrapped in `db.transaction()`
- `applyChanges` only advances cursor if zero failures
- `flushPendingTransactions` resets "syncing" → "pending" on network failure
- Cart sweeper hold-expiry scoped to `status='held'`
- `hold creation` rejects locked-by-cart cards

**Issues:** H-1 (flush rollback), M-13 (no sync backoff), M-14 (recursive hasMore), L-5 (archive-then-delete duplication)

### 6) Monitoring & Logging (Observability)

**Strengths:**
- Pino structured logging (`{ event: "sale_completed", txId, ... }`)
- `auditPlugin` on all mutating routes; redaction of SENSITIVE_KEYS
- `SyncDot` shows live state + pending count
- `/health` (public) and `/health/deep` (admin-only) endpoints
- `/health/deep` derives `schemaVersion` from `_journal.json` at startup — never stale

**Issues:** M-16 (no request-ID header), M (console.warn in sync layer), L-4 (health exposes user count publicly)

### 7) Deployment & DevOps (Local-first)

**Strengths:**
- `pnpm dev` starts API + web via Turbo with one command
- `pnpm-lock.yaml` pins all transitive dependencies
- `.env.example` documented with generation instructions
- Migrations auto-apply on `runMigrations()`; storage dirs auto-created
- `docs/03-runbook.md` covers pre-event, during-event, backup, troubleshooting
- `biome.json` provides `pnpm lint`

**Issues:** No automated test gate on push (M); no Docker/systemd (L, out of scope for local-first); Railway deployment plan archived as deferred

### 8) Configuration & Environment Management

**Strengths:**
- `loadConfig()` Zod-parsed at boot; fails fast with clear messages
- Placeholder `SESSION_SECRET` explicitly rejected
- `DOMAIN` required in production (prevents silent CORS misconfiguration)
- `schemaVersion` derived from `_journal.json` — not hardcoded
- `NODE_ENV`-gated Swagger UI and `secure` cookie flag

**Issues:** L-10 (`seed.ts` reads env directly), L (no `LOG_LEVEL` env var), L (no admin-password weak-list check)

### 9) User Experience (UX)

**Strengths:**
- Bahasa Indonesia throughout cashier UI
- Scan-first POS: camera viewfinder + USB HID same input
- `MaskedAmount` + `useTapHoldReveal` (5s hold per PRD spec — fixed)
- Offline banner + blocked-state components; network mode toggle
- `SyncDot` shows pending count; `opportunisticSync()` on mode change
- Receipt modal with print + "Transaksi Baru" shortcut

**Issues:** M-15 (autoUpdate reload risk), M (empty offline-cart pay error), L-11 (no lastSyncAt display), L (no hold-expiry time shown in UI)

### 10) Compliance & Legal

**Strengths:**
- `UNLICENSED` proprietary license on all packages
- `data-retention-policy.md` documents audit log archiving and deletion
- `ownerUserIdSnapshot` design prevents retroactive settlement tampering
- PII surface limited to `email` + `displayName` — no payment card data, no national ID

**Issues:** L-6 (`xlsx` advisories), L-8 (photos never cleaned up), M-12 (no user deactivation mechanism)

### 11) Documentation & Knowledge Sharing

**Strengths:**
- 7 ADRs covering bcrypt cost, session length, append-only, oversold-accepted, offline-cart design
- PRD, implementation plan, runbook, milestone progress notes, accessibility audit
- `docs/reviews/` tracks multi-agent code review history
- `docs/cashier-quick-reference.md` printable booth reference (Bahasa Indonesia)
- Inline comments explain WHY on non-obvious invariants

**Issues:** M-17 (CLAUDE.md stale), M-18 (ADR numbering gap + filename inconsistency), L (flush trust model underdocumented)

---

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

| # | Item | Effort | Finding |
|---|---|---|---|
| 1 | Fix `flush-pending-tx` rollback: `return;` → `throw new Error(reason)` inside `db.transaction()` | S | H-1 |
| 2 | Guard offline pay against `activeEvent === null` | S | H-2 |
| 3 | Add `max_transaction_discount_pct` server-side check in pay handler + flush | S | H-3 |
| 4 | Replace `Math.random()` in `StockReceivePage.tsx` + `BulkImportPage.tsx` with `generateShortId()` from `@kolektapos/qr` | S | H-4 |
| 5 | Change `registerType: "autoUpdate"` → `"prompt"` in `vite.config.ts` | S | M-15 |
| 6 | Update `CLAUDE.md` Repository Status section | S | M-17 |
| 7 | Strip `photoPath` from `CreateCardOpPayloadSchema` or add pattern validator | S | M-11 |

### Phase 2: Short-term improvements (1–2 weeks)

| # | Item | Effort | Finding |
|---|---|---|---|
| 8 | Add `users.isActive` column + migration + login check | M | M-12 |
| 9 | Replace `holds.ts` raw body cast with `CreateHoldSchema.safeParse()` | S | M-3 |
| 10 | Add payment channel existence check at pay time | S | M-4 |
| 11 | Validate or remove `create_transaction` sync-push op (add items or drop op type) | M | M-1 |
| 12 | Fix fixed-price floor to compare effective sold price, not pre-discount price | S | M-2 |
| 13 | Create `holds.test.ts` + `settings.test.ts` | M | M-6, M-7 |
| 14 | Add monthly report tests to `settlement.test.ts` | S | M-8 |
| 15 | Wrap `@fastify/swagger` schema registration in `NODE_ENV !== "production"` guard | S | M-10 |
| 16 | Add request correlation ID (`genReqId: crypto.randomUUID`, `x-request-id` header) | S | M-16 |
| 17 | Fix ADR numbering gap (create ADR-0006 or renumber; standardize filename format) | S | M-18 |
| 18 | Pass config to `seed.ts` instead of re-reading `process.env` | S | L-10 |
| 19 | Add `auditExtra` to `POST /carts/:id/items` for override-reason audit trail | M | M-5 |

### Phase 3: Longer-term refactors (2–6 weeks)

| # | Item | Effort | Finding |
|---|---|---|---|
| 20 | Add exponential backoff to background sync (3 failures → 5-minute interval) | S | M-13 |
| 21 | Replace recursive `deltaSyncPull` with iterative loop + depth guard | S | M-14 |
| 22 | Show `lastSyncAt` relative time in `SyncDot` tooltip | S | L-11 |
| 23 | Document flush trust model inline in `flush-pending-tx.ts` | S | L (docs) |
| 24 | Add `LOG_LEVEL` env var to `config.ts` and pass to Fastify logger | S | L (config) |
| 25 | Surface sync `console.warn` warnings to operator UI (SyncDot error tray) | M | M (observability) |
| 26 | Add settlement GROUP BY SQL aggregation instead of in-memory loop | M | L (performance) |
| 27 | Photo cleanup on card retirement (when that status is implemented) | M | L-8 |
| 28 | Update `xlsx` or evaluate migration to `exceljs`/`papaparse` | M | L-6 |
| 29 | Add minimal CSP for single-origin production deployment | M | L-12 |

---

## Appendix

### How to run/build/test locally (verified from repo)

```bash
# Prerequisites: Node 22+ (.nvmrc), pnpm 10+
pnpm install
cp .env.example .env
# Edit .env: set SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD

# Development (API :3001, web :5173)
pnpm dev

# Type check
pnpm typecheck

# Unit tests (all packages — currently green)
pnpm test

# Playwright E2E (spawns its own API against test DB)
pnpm e2e

# Lint
pnpm lint
```

### Notable files reviewed

| File | Notes |
|---|---|
| `apps/api/src/routes/carts.ts` | Cart CRUD, pay, abandon — 550 lines, core POS logic |
| `apps/api/src/routes/transactions.ts` | Void/refund handler with oversold guard |
| `apps/api/src/routes/sync.ts` | Push/pull, category schema, photo upload, delta pull |
| `apps/api/src/routes/flush-pending-tx.ts` | Offline tx flush — partial rollback bug (H-1) |
| `apps/api/src/routes/holds.ts` | No Zod schema (M-3), no tests (M-6) |
| `apps/api/src/routes/settlement.ts` | Event + monthly settlement; monthly untested (M-8) |
| `apps/api/src/plugins/audit.ts` | Response-only capture; auditExtra extension |
| `apps/api/src/jobs/cart-sweeper.ts` | `expireOverdueHolds` exported and tested |
| `packages/sync/src/protocol.ts` | Discriminated union with UnknownOpSchema catch-all |
| `packages/qr/src/index.ts` | `crypto.getRandomValues()` — canonical CSPRNG |
| `apps/web/src/pages/StockReceivePage.tsx` | Local `genShortId()` using `Math.random()` (H-4) |
| `apps/web/src/lib/background-sync.ts` | `applyChanges` validates with Zod; uses `parsed.data`; no backoff (M-13) |
| `apps/web/vite.config.ts` | `autoUpdate` risk (M-15); Workbox cache correctly removed |
| `apps/web/playwright.config.ts` | globalSetup spawns API; e2e.gitignore covers test.db |
| `apps/api/src/test-helpers.ts` | Shared `createTestDb`, `seedUser`, `seedEvent` |
| `CLAUDE.md` | Stale status (M-17) |
| `docs/adr/` | 7 ADRs; 0006 missing (M-18) |
| `docs/03-runbook.md` | Covers pre-event + troubleshooting section |

### Dependency notes

- **`bcryptjs@3.0.2`** — Pure JS, cost 12. ~200ms login. Acceptable.
- **`@fastify/session`** — In-memory store; sessions reset on restart. Documented in runbook.
- **`xlsx@0.18.5`** — Known advisories (prototype pollution). Low risk for operator-provided files only. (L-6)
- **`html5-qrcode@2.3.8`** — Last published 2023; camera scanning works on current Android Chrome/iOS Safari.
- **`@fastify/multipart`** — Newly added for photo upload; limits set to 5 MB.
- **`@biomejs/biome@^2.4.13`** — Linting configured; `pnpm lint` functional.
- No critical CVEs in current direct dependency set from casual review. Recommend `pnpm audit` before each event.
