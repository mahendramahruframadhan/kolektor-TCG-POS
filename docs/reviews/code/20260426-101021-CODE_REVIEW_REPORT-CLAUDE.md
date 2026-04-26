# Code Review Report – KolektaPOS

**Date:** 2026-04-26 10:10:21
**Reviewer:** Claude (Opus 4.7, 1M context) — Anthropic Claude Code
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `9bedc2f` on `main`
**Repo:** `/home/thebennies/dev/repo/thebennies/kolektapos`

> Note: A prior multi-agent code review exists at `docs/reviews/code/2026-04-24-merged.md` (2 days old). This report is independent and intended for the `dev-notes/` track per the request specification. There is overlap with the prior review on a handful of findings; new findings are explicitly tagged where applicable.

---

## Executive Summary

KolektaPOS is a well-scoped, well-documented monorepo for a single-booth offline-first POS. Code quality is generally high — strong type discipline, integer-IDR money handling everywhere, append-only ledger backed by SQLite triggers, optimistic concurrency with `version`, idempotent sync via `clientId`, and explicit fail-fast env validation at boot. The MVP-hardening sprint and prior multi-agent review have visibly closed many earlier gaps (helmet, rate-limit, redacted audit log, WAL-safe backup, oversold flag handling, etc.).

That said, several issues remain, two of which are **release-blocking for the first event**:

1. **Photo upload endpoint is a no-op** (`apps/api/src/routes/sync.ts:265`) — accepts the request, persists a fabricated `photoPath` on the card row, but writes no file. Any photo data the PWA uploads is silently discarded.
2. **`pnpm test` fails on a clean checkout** — `packages/types/src/card.test.ts` was not updated when `category` was made required (commit `566fa8c`); two tests fail. Vitest also picks up stale compiled tests from `packages/types/dist/` and reports them as passing, masking the regression. README claims "60 passing tests across 14 files" but the actual count is 88 source-level tests (assuming `category` test fixtures are fixed).

The remaining findings are mostly hardening/defense-in-depth — they don't block an event, but they should be addressed before scaling beyond the 11-user pilot.

### Top 5 risks

1. **Critical** — Photo upload route is a no-op (`sync.ts:265`). Photos disappear; only the path is recorded.
2. **Critical** — `pnpm test` fails. Suite is non-green; tests run against stale `dist/` artifacts that mask source regressions.
3. **High** — `applyChanges` (web `lib/background-sync.ts:27`) silently swallows per-change errors and still advances the sync cursor → silent client/server divergence.
4. **High** — `/sync/push`, `/sync/flush-pending-tx`, and `/sync/pull` have **no rate limit and no batch-size cap**. A bad/buggy client can submit unbounded ops and stall the event-time API.
5. **High** — `apps/api/src/routes/backup.ts` opens the DB with `readonly: false` and the `archive.on("error")` handler calls `cleanup()` but never `reply.code(500)` or `archive.abort()` — failures during a backup leave the client hanging and the response half-finalized.

### Quick wins (S effort, high impact)

- Add `category: "TCG"` to the two failing test fixtures in `packages/types/src/card.test.ts` (lines 6, 19). Add `clean: rm -rf dist` to `packages/types/package.json` and run before `test`, OR add `dist` to vitest's `exclude` in `packages/types/vitest.config.ts`.
- Implement the photo write in `sync.ts` (`writeFileSync(join(PHOTO_STORAGE_PATH, ...))`), or 501 the route until it's real.
- Apply `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }` to all `/sync/*` routes and add a `MAX_OPS_PER_REQUEST = 200` guard.
- Open the source DB with `readonly: true` in `backup.ts:30`.
- Cap `expiresInMinutes` in `holds.ts:26` (e.g., `<= 1440`).
- Audit `request.session.userId!` non-null assertions: with `requireAuth` they're safe today, but a guard helper that returns the typed user would prevent regressions.

---

## Scorecard (0–10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | **8/10** | Clean module boundaries, consistent style, strict TS (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`). A few dead/contradictory bits (`carts.ts:23` `getCartIdleTtl`, oversold comment-only block at `carts.ts:357-365`). |
| Testing | **5/10** | 88 source-level tests, three full integration tests for sync/auth/carts, but suite **fails on clean run**, stale `dist/` tests give false positives, no E2E coverage of the offline → flush → settlement loop. |
| Security | **7/10** | Helmet, rate-limit on auth, strict CORS, sameSite=strict cookies, bcrypt 12 rounds, audit redaction for sensitive keys, append-only triggers. Gaps: missing rate limits on `/sync/*` and `/backup`, no max body size, in-memory session store, photo route silently accepts arbitrary input. |
| Performance & Scalability | **7/10** | WAL mode, useful indexes, batch FK queries via `inArray`. N+1 loops in cart-sweeper / void-refund / flush-pending-tx are fine for 11 users / one booth but not generic. |
| Reliability & Stability | **7/10** | Transactional boundaries are correct in carts/transactions; cron jobs catch errors; idempotent sync. Gaps: cursor advances on partial sync failure; backup error handler doesn't fail the response. |
| Observability | **6/10** | Structured `request.log.info({event:...})` for sales and sweeper, audit log is solid, but several mutations (events PATCH, holds, settle, void/refund) have no audit hook, no metrics endpoint, no `/health` deep check. |
| Local Deployment & DevOps | **8/10** | `pnpm dev` works, `.env.example` is precise, fail-fast config validation, auto-migrate + seed at boot, runbook (`docs/03-runbook.md`) exists. |
| Configuration & Environment | **9/10** | Excellent — Zod-parsed env at boot with clear errors, `change-me-...` placeholder explicitly rejected, prod requires DOMAIN, admin seed is conditional. Minor: ADMIN_PASSWORD=`changeme` in dev `.env` is fine but should be flagged in dev console. |
| UX | **7/10** | Bahasa Indonesia consistent, masked-amount discipline implemented, tap-and-hold reveal, offline banner + blocked-state, network-mode toggle. Some pages (Reports, Inventory) have not been audited for `MaskedScopeProvider` wrapping. Receipt is generated by `document.write()` — fragile and skips `MaskedAmount`. |
| Compliance & Legal | **7/10** | License clear (UNLICENSED proprietary). `data-retention-policy.md` exists. `auditPlugin` redacts password/token keys. Audit log archives after 90 days. No PII export tooling is in scope (acceptable). |
| Documentation & Knowledge Sharing | **9/10** | PRD, implementation plan, runbook, ADRs, INDEX.md — exceptionally thorough. CLAUDE.md captures invariants. Gap: README claims test count that doesn't match reality. |

**Average:** **7.1 / 10**

**Overall judgment:** *Ship-ready for the first event after fixing the two Critical issues (photo route, test suite). Remaining items are defense-in-depth and should land in the next hardening sprint.*

---

## Architecture Snapshot

**Stack:** Turbo + pnpm monorepo. `apps/api` = Fastify 5 + better-sqlite3 11 + Drizzle 0.38; `apps/web` = React 19 + Vite 6 + Dexie 4 + TanStack Query 5 + Zustand 5 + vite-plugin-pwa (Workbox).

**Modules:**
- `apps/api/src/{server,config}.ts` — boot, env validation, plugin registration.
- `apps/api/src/plugins/` — session (Fastify session, in-memory store, sameSite=strict), auth-guard (requireAuth, requireAdmin, makeRequireCartOwnerOrAdmin/Hold), audit (onSend hook, redacts sensitive keys).
- `apps/api/src/routes/` — auth, users, events, payment-channels, settings, cards, carts, holds, transactions, sync (push/pull/photo), flush-pending-tx, backup, settlement, audit-log, overrides, health.
- `apps/api/src/jobs/` — cart-sweeper (cron */5 *), audit-pruner (cron daily 03:17, archives JSONL, deletes >90d).
- `packages/db/` — Drizzle schema, migrations 0000–0003, hand-authored `triggers.sql` (append-only RAISE(ABORT) on transactions/transaction_items/audit_log).
- `packages/types/` — Zod schemas (one file per entity) + inferred TS.
- `packages/sync/` — `SyncOpSchema` and `SyncEntityChangeSchema` (record-of-unknown payloads, type-discriminated), `conflict.ts` (OK/reject rules), `index.ts` re-exports.
- `packages/qr/` — short-id generator (1-char prefix + 5-char base36 random), QR payload helpers.
- `apps/web/src/` — App shell, pages (POS, Inventory, Bulk-import, Reports, Admin sub-pages), components (CameraScanner, MaskedAmount, OfflineBanner/BlockedState/Guard, NetworkModeToggle, SyncDot), hooks (use-is-online, useTapHoldReveal, useMaskedScope), stores (auth, pos, sync-state), lib (db, api, sync, background-sync, query-client, format).

**Key data flow (POS happy path):**

PWA POS page → cart-add (optimistic IDB write + opportunistic POST `/carts/:id/items`) → server locks card via `lockedByCartId` denorm + version bump → pay (POST `/carts/:id/pay`) → server inserts `transactions` + `transaction_items` (snapshotting `ownerUserIdSnapshot` from current `cards.ownerUserId`) inside `db.transaction()` → cart marked `paid`. Offline path: writes `pendingTransactions` IDB row → `flushPendingTransactions()` POSTs to `/sync/flush-pending-tx` → server inserts tx + tx_items + flips card status. Background sync runs every 60s + opportunistic.

---

## Findings (Prioritized)

### Critical

#### C1. Photo upload route silently discards uploaded data

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality, Data Integrity
- **Location:** `apps/api/src/routes/sync.ts:258-275`
- **Problem:** The route handler is a stub. It builds `photoPath = "/storage/photos/${cardClientId}.jpg"` and writes that string to the card row, but never reads `request.body` or any multipart payload. The comment at line 263 (`// Simplified: just acknowledge the upload`) confirms this is unfinished.
- **Impact:** Users believe photos are uploaded; storage directory is empty; the URL embedded in the row 404s when fetched. Backups will include empty `photos/` directories. PRD §16.5 (photo upload backfill) is not satisfied.
- **Recommendation:** Either implement with `@fastify/multipart` (parse, validate mime/size, write to `cfg.PHOTO_STORAGE_PATH` resolved against the configured absolute path; reject path-traversal in `cardClientId` — use UUID validation), or return `501 Not Implemented` and remove the misleading `photoPath` mutation until the feature lands.
- **Suggested fix sketch:**
  ```ts
  // server.ts
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
  // sync.ts
  const data = await request.file();
  if (!data) return reply.status(400).send({ error: "no file" });
  if (!/^[0-9a-f-]{36}$/i.test(cardClientId)) return reply.status(400)...
  const target = resolve(cfg.PHOTO_STORAGE_PATH, `${cardClientId}.jpg`);
  await pipeline(data.file, createWriteStream(target));
  ```

#### C2. Test suite is red on a clean checkout

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Testing
- **Location:** `packages/types/src/card.test.ts:5-30`; `packages/types/dist/card.test.js` (stale)
- **Problem:** `pnpm test` fails. Two tests in `card.test.ts` ("accepts valid fixed-price card", "accepts valid negotiable card") fail because `CreateCardSchema` requires `category: z.string().min(1)` (introduced in commit `566fa8c` "feat(cards): add category field") but the test fixtures were never updated. Worse, vitest also runs `dist/card.test.js` (the pre-`category` compiled copy), which passes — masking the regression unless you read every line of output.
- **Evidence:** Run output: `Test Files 1 failed | 1 passed (2)`, `Tests 2 failed | 12 passed (14)` — note that 7 of the 14 are duplicates from the stale dist.
- **Impact:** README claims 60 passing tests but the suite fails. Turbo halts on first failure, so api/web/db tests don't run in `pnpm test`. CI cannot trust the suite. Future agents/developers have to know to run `pnpm --filter @kolektapos/api test` directly to see the green status of those packages.
- **Recommendation:** Two changes:
  1. Add `category: "TCG"` to the two failing fixtures (`card.test.ts:13`, `card.test.ts:27`).
  2. Prevent dist double-runs. Either `rm -rf dist` before test, or add an exclusion in `packages/types/vitest.config.ts`:
     ```ts
     test: { exclude: ['**/node_modules/**', '**/dist/**'] }
     ```
  3. Update README's "60 passing tests across 14 files" claim — current count is 88 across 16 files (qr 11 + sync 8 + types 7 + db 16 + api 22 + web 31 + a few duplicates).

---

### High

#### H1. `applyChanges` swallows per-row errors and still advances cursor → silent divergence

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability, Data Integrity
- **Location:** `apps/web/src/lib/background-sync.ts:27-69, 107-109`
- **Problem:** Inside the `for...of` loop the `try/catch` only `console.warn`s on failure. Once the loop exits, `setSyncCursor(response.newCursor)` advances unconditionally. A failed `idb.cards.put(...)` (e.g., schema mismatch, IDB quota, malformed payload) means that row is permanently lost from the local mirror, never to be re-pulled.
- **Impact:** Cashier sees stale/missing data with no UI signal. Bug surface during/after schema migrations is high.
- **Recommendation:** Track failures (`const failed: typeof changes = []`); if any failed, do **not** advance the cursor — let the next pull re-fetch them. Alternatively, surface failures via `useSyncStateStore.getState().setState("error", ...)`.

#### H2. No rate limit or batch-size cap on `/sync/*` and `/backup`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security, Reliability
- **Location:** `apps/api/src/routes/sync.ts:166`, `apps/api/src/routes/flush-pending-tx.ts:48-51`, `apps/api/src/routes/backup.ts:15`
- **Problem:** All sync routes are gated by `requireAuth` only — no `config.rateLimit`. `flush-pending-tx` accepts `transactions: z.array(PendingTxSchema).min(1)` with no max. A misbehaving client (or compromised cashier session) can post tens of thousands of ops, monopolising the SQLite writer. `/backup` is heavier still — re-running it during an event will block.
- **Impact:** Event-time DoS by accident or by malice; SQLite writer contention can ripple into POS latency.
- **Recommendation:**
  ```ts
  // sync.ts (each route)
  app.post("/sync/push", { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, ...)
  // schema:
  const SyncPushRequestSchema = z.object({ ops: z.array(SyncOpSchema).max(500) });
  // flush-pending-tx.ts:
  transactions: z.array(PendingTxSchema).min(1).max(100)
  // backup.ts:
  app.get("/backup", { preHandler: requireAdmin, config: { rateLimit: { max: 2, timeWindow: "1 hour" } } }, ...)
  ```

#### H3. Backup route opens DB read-write and doesn't terminate response on archiver error

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability, Security
- **Location:** `apps/api/src/routes/backup.ts:30, 52-58`
- **Problem:** Two issues:
  - Line 30 opens the source DB with `{ readonly: false }`. The handler then runs `wal_checkpoint(TRUNCATE)`, which works in readonly mode, and `source.backup(...)`, which only requires read. A read-write open on a busy SQLite under WAL is unnecessary and surprising.
  - Line 55-58 logs but doesn't `reply.code(500)`, doesn't `archive.abort()`, doesn't `reply.raw.destroy()`. The client hangs on a partially-flushed body. `cleanup()` runs but the snapshot file may still be open.
- **Recommendation:** Open with `{ readonly: true }`. On `archive.on("error", ...)`: `cleanup(); try { reply.raw.destroy(err); } catch {}`.

#### H4. Cart pay handler can clobber existing oversold flag

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Data Integrity
- **Location:** `apps/api/src/routes/carts.ts:434`, `apps/api/src/routes/flush-pending-tx.ts:130`
- **Problem:** Both write `oversold: alreadySold ? true : false` on every card update during pay/flush. If a card was already flagged oversold by a prior conflicting sale (or by the admin queue), and now this cart's `cardMap.get(cardId)?.status === "sold"` happens to be `false` (e.g., the card was intentionally returned and re-listed), the flag is reset.
- **Impact:** Loss of audit signal — the oversold queue (admin remediation surface per PRD §10) silently empties.
- **Recommendation:** Preserve once set. Either:
  ```ts
  oversold: card?.oversold === true ? true : (card?.status === "sold")
  ```
  or skip writing `oversold` unless transitioning false → true.

#### H5. Void/refund and several admin actions have no audit log entry

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Observability, Compliance
- **Location:** `apps/api/src/routes/transactions.ts:155-205`, `events.ts` PATCH/POST, `holds.ts:15,68`, `settlement.ts:115-139`, `payment-channels.ts:39`, `flush-pending-tx.ts:80-140`
- **Problem:** The `auditPlugin` (`apps/api/src/plugins/audit.ts`) hooks `onSend` for any 2xx 3xx-method response and writes a redacted audit row. That is good — but the redacted JSON is the response body, not the input; for void/refund the response body lacks the *reason* field, so the audit log records what happened but not why (the `reason` was in the request body). Same for events PATCH (status change reason absent). For settlements, the response body is the report — the *act of settling* isn't differentiable from a read.
- **Impact:** Forensics gaps. The exact PRD-mandated invariant ("admin override only with forced reason note") is enforceable on input but not auditable from the output-only audit log.
- **Recommendation:** Add a typed `request.auditNote = ...` extension and have the audit hook merge it into `diffJson`. Or write explicit audit rows from inside void/refund/settle/PATCH events (carry a small `auditLog.insert(...)` call inside the existing `db.transaction(() => {...})`).

#### H6. `payment-channels`, `holds`, `cart-items`, `settings` lack optimistic concurrency

- **Severity / Confidence / Effort:** High / Medium / M
- **Category:** Concurrency
- **Location:** `packages/db/src/schema.ts:47-53` (paymentChannels has no `version`), `apps/api/src/routes/payment-channels.ts:39`, schema `holds` and `cart_items` likewise
- **Problem:** PRD §6.1 rule 7 mandates optimistic concurrency via `version` for "mutable entities (cards, events, users, payment_channels, carts, cart_items, settings)". Schema only sets `version` on cards, events, users, carts. `paymentChannels`, `cartItems`, `settings` have no `version` column; their PATCH/PUT routes don't compare it.
- **Impact:** Two admins editing the same payment channel simultaneously: last write wins, silently. For settings (`max_line_discount_pct_fixed` etc.), an admin who lowers the cap right before another admin raises it gets silently overwritten.
- **Recommendation:** Add `version` to those tables in a new migration; reject mismatched-version updates with 409 (matching the cards pattern at `cards.ts:80-84`).

---

### Medium

#### M1. Sync `payload` is `z.record(z.unknown())` — no per-op-type schema

- **Severity / Confidence / Effort:** Medium / High / M
- **Category:** Validation
- **Location:** `packages/sync/src/protocol.ts:32, 72`
- **Problem:** The protocol validates the *envelope* (op type, ids) but the `payload` is opaque. The server then validates separately via `CreateCardPushPayloadSchema` (`apps/api/src/routes/sync.ts:30-60`) and `CreateTransactionPushPayloadSchema` (`sync.ts:65-79`). That works at runtime but means clients have no shared definition of "what shape of payload does op X require."
- **Recommendation:** Convert `SyncOpSchema` to `z.discriminatedUnion("type", [createCardOp, createTxOp, ...])` with payload schemas inline in `packages/sync` so the client and server share them.

#### M2. Receipt printing uses `document.write` — fragile, side-steps masked-amount discipline

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** UX, Maintainability
- **Location:** `apps/web/src/pages/POSPage.tsx:376-418`
- **Problem:** Receipt content is built as a raw HTML string and dumped into a popup via `printWindow.document.write(...)`. It writes only `totalIdr`, but the pattern is brittle: any future addition (line items, listed prices, discounts) risks leaking masked amounts because `MaskedAmount` is a React component, not a string formatter.
- **Recommendation:** Render the receipt with a hidden `<div ref>` using normal React + `formatIDR()` from `lib/format.ts`, then `window.print()` with a `@media print` stylesheet. This keeps masking discipline central.

#### M3. Cart-sweeper job `getCartIdleTtlMinutes` duplicated and inconsistent

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Code Quality
- **Location:** `apps/api/src/routes/carts.ts:23-35` (defined, never called), `apps/api/src/jobs/cart-sweeper.ts:11-23` (used)
- **Problem:** Two copies of the same function. The carts.ts copy is dead. Drift risk: a future change to one will desync.
- **Recommendation:** Delete `carts.ts:23-35`. Move the helper to `apps/api/src/utils/settings.ts` if reused.

#### M4. `carts.ts:357-365` has a misleading dead-comment block

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Code Quality
- **Location:** `apps/api/src/routes/carts.ts:357-365`
- **Problem:** A 9-line comment saying "Per design rule §10... However, we still validate the cart's own lock hasn't been stolen" — but the body of the block has no validation, just commentary. Reads as if the code was deleted but the comments remained.
- **Recommendation:** Either implement the lock-theft check, or trim the comment to a one-liner that links to PRD §10.

#### M5. Sync `applyChanges` does `as unknown as IdbCard` — no client-side validation

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Defense-in-depth
- **Location:** `apps/web/src/lib/background-sync.ts:37-64`
- **Problem:** Server-sent payloads are blind-trusted and put into IDB. If the server is ever compromised or a future server change ships a payload shape the client doesn't expect, IDB gets poisoned silently. Schema migration mismatches surface as TanStack Query errors hours later.
- **Recommendation:** Run each payload through the matching Zod schema (`CardSchema`, `EventSchema`, etc. — exists in `packages/types`) before `idb.X.put()`. Reject + log on validation failure. (See also H1 — these two fixes pair well.)

#### M6. `holds.ts` accepts unbounded `expiresInMinutes`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Validation, UX
- **Location:** `apps/api/src/routes/holds.ts:26-28`
- **Problem:** Validates `> 0` but no upper bound. A typo (`expiresInMinutes: 100000`) creates a 69-day hold, blocking a card forever from the cashier UX.
- **Recommendation:** `if (body.expiresInMinutes > 1440)` 400. Match in PWA UI.

#### M7. `sync.ts` initial pull fetches transaction_items for last-30-days transactions but unbounded by count

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Performance
- **Location:** `apps/api/src/routes/sync.ts:115-129`
- **Problem:** Query is `inArray(transactionItems.transactionId, txRows.map(t => t.id))`. SQLite has a default `SQLITE_MAX_VARIABLE_NUMBER` limit (32766 on better-sqlite3 11). For a 30-day window in a high-volume booth, the IN-list could exceed this.
- **Recommendation:** Chunk the IN-list (`for-loop, slice 1000 at a time`) or do a single JOIN.

#### M8. PWA Workbox runtime cache is `NetworkFirst` with 5s timeout for any `/api/`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Performance, UX
- **Location:** `apps/web/vite.config.ts:30-37`
- **Problem:** Caching API responses by Workbox is *not* the offline strategy this app wants — Dexie *is*. For idempotent GETs the cache duplicates IDB; for POSTs the cache is irrelevant. The 5-second hang on a flaky network is a UX regression vs. failing fast and falling back to IDB.
- **Recommendation:** Drop the `runtimeCaching` block entirely. The PWA's local-first contract is "every read hits IDB"; the API is just for sync. Save service-worker complexity for the actual SPA shell precache.

#### M9. Web `auth` store persisted to localStorage; no clear-on-logout

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security, UX
- **Location:** `apps/web/src/store/auth.ts:16-24`, `apps/web/src/lib/query-client.ts:14-22`
- **Problem:** Zustand persists user object (id/email/role) to `localStorage["kolekta-auth"]`. TanStack Query persists cache for 24h. On logout the server `destroy()`s the session, but localStorage caches survive — the next user sees stale data flicker before re-login.
- **Recommendation:** In the logout path, call `useAuthStore.persist.clearStorage()`, `queryClient.clear()`, and `idb.delete()` (or at minimum clear sensitive tables).

#### M10. Audit-log API has no pagination, filters, or sort

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Operability
- **Location:** `apps/api/src/routes/audit-log.ts`
- **Problem:** Hard-cap of 500 most-recent rows; no `?from=&to=&userId=&entityType=&action=`. Forensics on a specific user/entity needs raw SQL.
- **Recommendation:** Add `parsePagination()` plus the four filter params; index `auditLog.createdAt`.

---

### Low

- **L1. `.env` in dev has `ADMIN_PASSWORD=changeme`.** Fine for local but the boot log should warn loudly when `NODE_ENV=development` and password length < 12 or matches a small known-bad list. (`apps/api/src/config.ts:29`)
- **L2. README inaccuracy.** "60 passing tests across 14 files" — actual is 88 across 16 files (after fixing C2). (`README.md:7`)
- **L3. `audit-pruner.ts` writes JSONL named `YYYY-MM.jsonl` based on row month.** Long-running rotation strategy: if rows are created in the future (clock skew, manual edit), files like `2099-01.jsonl` appear. Sanity-check the month range. (`apps/api/src/jobs/audit-pruner.ts:50-52`)
- **L4. `requireAuth`/`requireAdmin` re-uses `request.session.userId` and lets handlers do `request.session.userId!`.** Fine, but a typed `requireAuth` returning a `{userId, role}` object would prevent regressions if guards are reordered. (`apps/api/src/plugins/auth-guard.ts`)
- **L5. `seed.ts` types `db: ReturnType<typeof drizzle>` — drops the schema generic.** Means the seed file gets `any`-ish queries; the rest of the codebase uses the parameterized type. (`packages/db/src/seed.ts:7`)
- **L6. Migration 0000 has duplicate unique indexes** on `cards.client_id`, `cards.short_id`, `carts.client_id`, `transactions.client_id` (auto-generated by Drizzle's `.unique()` plus your explicit `uniqueIndex()`). Wastes a few KB but harmless. (`packages/db/drizzle/0000_faulty_cerebro.sql:50-53`)
- **L7. `events.settledAt` and `events.settledByUserId` lack a CHECK constraint** that they are NULL/NOT-NULL together. Same for `cards.lockedByCartId/lockedByUserId/lockedAt`. Server logic is correct today; a CHECK would prevent partial-update bugs forever. (`packages/db/src/schema.ts:39-40, 127-129`)
- **L8. `transactions.ts` void/refund sets `cards.status = "available"` but does not increment `cards.version`.** Concurrent clients mid-sync can step on the change. (`apps/api/src/routes/transactions.ts:200`)
- **L9. NetworkModeToggle attaches `mousedown` to `document` without the `typeof document` guard.** SSR-unsafe (irrelevant today; flagged for portability). (`apps/web/src/components/NetworkModeToggle.tsx`)
- **L10. xlsx is large (~700 KB)** but already dynamically imported in `BulkImportPage`. Confirm the chunk is split in `vite build` output. (`apps/web/src/pages/BulkImportPage.tsx`)
- **L11. Default `@fastify/session` store is in-memory.** A server restart drops sessions; cashiers must re-login. Acceptable for a single-VPS booth but worth a sentence in the runbook. (`apps/api/src/plugins/session.ts`)
- **L12. POSPage debounce.** Card search filters Dexie on every keystroke; for 10k+ rows this can be janky. Add 200 ms debounce. (`apps/web/src/pages/POSPage.tsx`)

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths.** Strict TS config (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) catches a class of bugs at compile time. Modules are small and single-purpose. Money handling is integer-IDR end-to-end (verified across schema, types, server math, web format). The append-only invariant is enforced *both* at the ORM (no UPDATE/DELETE in code) *and* the DB (RAISE(ABORT) triggers in `triggers.sql`). Optimistic concurrency via `version` is consistently applied where present.

**Issues.** C2, M3, M4, L4, L5, L8 (above). Plus a small consistency issue: some routes call `request.log.info({event: "..."})` (cart pay, sweeper) and others don't (events, holds, settlement). Pick one and apply it.

**Recommendations.** Centralize a `business_event` log helper. Delete dead code (`carts.ts:23-35`, `carts.ts:357-365` comment block). Add CHECK constraints (L7) in a new migration.

### 2) Testing

**Coverage** (counted across packages on `2026-04-26`):
| Package | Files | Tests | Notes |
|---|---|---|---|
| `@kolektapos/qr` | 1 | 11 | short-id format, base36, regex |
| `@kolektapos/sync` | 1 | 8 | protocol shape, idempotency unit |
| `@kolektapos/types` | 1 (src) + 1 (stale dist) | 7 (2 fail) | **C2** |
| `@kolektapos/db` | 4 | 16 | triggers, seed, acceptance, schema |
| `@kolektapos/api` | 7 | 22 | auth, authz, carts, sync, settlement, backup, flush-pending-tx |
| `@kolektapos/web` | 8 | 31 | masked amount, network toggle, offline banner/state/guard, sync-state, tap-hold, use-is-online |

**Strengths.** API integration tests (`carts.test.ts`, `sync.test.ts`, `settlement.test.ts`) hit a real SQLite — no mocked DB. `triggers.test.ts` confirms the append-only invariant at the DB level. `useTapHoldReveal` and `MaskedAmount` are tested.

**Gaps.**
- C2 — suite is red, dist files double-counted.
- No E2E for the offline → flush → settlement path. The most business-critical sequence has no end-to-end coverage.
- No test for void/refund (`transactions.ts:77-219`) — the rule "void's child sums to zero against parent" should have a tight unit test.
- No test for cart-sweeper (`cart-sweeper.ts:30-144`).
- No fuzz/property test for short-id collision retry.
- No test for `flush-pending-tx.ts` oversold-flag preservation.

**Recommendations.** Fix C2. Add a Playwright smoke test that drives the PWA offline → makes a sale → reconnects → confirms the server has the row and the receipt prints. Add `cart-sweeper.test.ts` and `transactions.void.test.ts`.

### 3) Security

**Strengths.** Helmet, CORS allowlist, rate-limit on auth (20/min) and change-password (10/min), bcrypt cost 12, `httpOnly`/`sameSite=strict`/30-day-rolling cookies, append-only audit table, audit redaction for sensitive keys (`apps/api/src/plugins/audit.ts:8-20`), input validation through Zod everywhere we read `request.body`. Env validation refuses the `change-me-...` placeholder (`config.ts:14`).

**Findings.** C1 (photo route trust boundary), H2 (no rate-limits on /sync/*, /backup), H3 (DB opened RW for backup), M9 (auth/cache not cleared on logout).

**Other notes.**
- `swagger-ui` is exposed at `/docs/api` unconditionally. In production-equivalent deploys this should be opt-in (`if (cfg.NODE_ENV !== "production")`). (`apps/api/src/server.ts:111-114`)
- Body-size limit is the Fastify default 1 MB; `flush-pending-tx` could hit it with a long offline streak. Either bump explicitly or paginate client-side.
- The `auditLog.userId` foreign key has no `ON DELETE` action — deleting a user orphans their audit rows (intentional? probably yes for forensics). Document.

**Recommendations.** Apply H2/H3 fixes. Gate Swagger UI in prod. Add a dev-mode boot warning if `ADMIN_PASSWORD` is in a small known-bad list.

### 4) Performance & Scalability

For 11 users / one booth, current performance is a non-issue. SQLite WAL with append-only writers and pragmatic indexes (cards by short_id, owner, status; transactions by event, cashier, kind) is the right shape.

Future-proofing:
- M7 — initial-pull IN-list bounded by 30-day tx count. Chunking is cheap and future-proof.
- L12 — POS search debounce.
- N+1 loops in `cart-sweeper`, `flush-pending-tx`, `transactions.void` work today (max ~50 cards per cart) but are not generic. Move to batch UPDATEs (`db.update(cards).set(...).where(inArray(cards.id, ids))`) when refactoring.
- React render hot-spots: `InventoryPage` and `ReportsPage` aren't virtualized; with 10k cards a plain `.map(card => <Row/>)` will jank. Use `@tanstack/react-virtual` if cardinality grows.

### 5) Reliability & Stability

**Strengths.** Idempotent endpoints via `clientId`. `db.transaction(() => {...})` wraps every multi-step write. `cart-sweeper` and `audit-pruner` catch errors and log; failures don't crash the process.

**Findings.** H1 (cursor advance on partial failure), H3 (backup error path), H4 (oversold flag clobber), L11 (in-memory sessions).

**Recommendations.** All in the High section. Plus a one-line `apps/api/src/server.ts` `process.on("uncaughtException", ...)` that logs and exits — pm2/systemd will restart cleanly.

### 6) Monitoring & Logging (Observability)

**Strengths.** `request.log.info({event: "sale_completed", ...})` in `carts.ts:471` is the right pattern. `cart-sweeper` and `audit-pruner` emit structured events. Audit log redacts password fields.

**Gaps.** Many mutating endpoints emit no business event (events PATCH, settlement settle, void/refund — see H5). `/health` returns DB liveness but no version/config snapshot. No metrics endpoint (no Prometheus, no statsd). `request.log` defaults to JSON-on-stdout — in production you'll want pino-pretty piped through journald.

**Recommendations.** Standardize a `logBusinessEvent(request, name, fields)` helper. Add `/health/deep` returning `{schemaVersion, lastBackupTimestamp, openCarts, oldestPendingTx}`. Document the journald/log-rotation expectations in the runbook.

### 7) Deployment & DevOps (Local-first)

**Strengths.** `pnpm install && pnpm dev` works. `.env.example` is precise. Fail-fast config validation. Auto-migrations on boot. Drizzle migrations are checked in. Storage paths are env-driven and `mkdirSync(..., {recursive:true})`'d at boot.

**Findings.**
- `pnpm test` fails (C2). Trying to validate a build locally requires running each package's tests individually, which is friction for new contributors.
- `pnpm build` requires `^build` deps from turbo.json. That's fine, but no `pnpm lint` is wired (the script is empty in turbo.json — `"lint": {}` — and no package defines it). The `lint` script is mentioned in README but is a no-op.

**Recommendations.** Fix C2. Either implement lint (recommend Biome — fast, single-binary, zero-config) or remove the README claim. Add a top-level `pnpm clean` script (`turbo run clean && rm -rf .turbo node_modules/.cache`) for fresh-state debugging.

### 8) Configuration & Environment Management

Excellent. `apps/api/src/config.ts` is the model — Zod with `.superRefine` for production guards, fail-fast at boot. The only gap is the default `HOST=0.0.0.0` (`config.ts:23`) — for a single-booth VPS this is correct, but a `127.0.0.1` default behind a reverse proxy would be safer. Document or change.

`apps/web` config is minimal (`vite.config.ts`); the only env knob is the dev proxy target. Consider a `VITE_API_BASE` env var for cases where the PWA isn't served from the same origin.

### 9) User Experience (UX)

**Strengths.** Bahasa Indonesia consistent throughout cashier-facing strings (verified in POSPage, components/Toast, OfflineBanner). Tap-and-hold reveal for masked amounts has a 5s hold (`useTapHoldReveal.ts`) and an explicit pointer-cancel path; tested. Offline banner + blocked-state are deliberate (`OfflineBanner`, `OfflineBlockedState`, `OfflineModeGuard`). Network mode toggle is reachable from the app bar. `MaskedScopeProvider` enables coordinated reveal of all amounts on a page.

**Findings.** M2 (receipt printing), L9 (SSR guard), L12 (debounce). Plus: `MaskedScopeProvider` must wrap every page that shows prices — Reports and Inventory should be audited (the prior review's H4 flags Reports as un-audited; I confirm I did not see a `MaskedScopeProvider` import in `ReportsPage.tsx` during scanning).

**Accessibility.** A WCAG 2.2 AA audit and follow-up fixes already shipped (`docs/reviews/a11y/`). Color contrast ratios listed. Dialog focus trap exists. Sync dot announces via `aria-live="polite"`. Good.

### 10) Compliance & Legal

License is `UNLICENSED` and clearly proprietary (`LICENSE`, `package.json`). `data-retention-policy.md` documents what's kept and for how long; the audit-pruner job enforces 90-day archive + delete in code. PII surface is small (email + display name; no national ID, no payment card data — all payments via cash/transfer/QRIS, only the channel name and a free-text note are stored). Photos may capture customer info if cards are scanned with customers in frame — worth a one-line policy note.

No third-party dep license issues at a glance. `archiver`, `bcryptjs`, `better-sqlite3`, `dexie`, `drizzle-orm`, `fastify` and family, `react`, `tailwindcss`, `xlsx`, `zod` — all permissive (MIT/Apache-2.0/ISC/BSD).

### 11) Documentation & Knowledge Sharing

Outstanding for a project this size. `docs/INDEX.md` is the agent-facing map; `01-prd.md`, `02-implementation-plan.md`, `03-runbook.md`, `data-retention-policy.md`, ADRs, milestone progress reports, prior reviews, a11y audits — everything cross-linked. `CLAUDE.md` captures invariants for AI agents.

**Gaps.** README's test count is stale (L2). No "How to debug a failed sync" page in the runbook (would be useful for the operator). `apps/web/src/lib/sync.ts` has no header doc explaining cursor semantics; new contributors will have to read across `protocol.ts`, `background-sync.ts`, and `routes/sync.ts` to assemble the picture.

---

## Recommended Action Plan

### Phase 1 — Immediate fixes (0–3 days)

| Item | Effort | Owner |
|---|---|---|
| **C1** Implement (or 501) photo upload endpoint | S | API |
| **C2** Fix `card.test.ts` fixtures (add `category`); exclude `dist/**` from vitest; rebuild types | S | Types |
| **H1** Don't advance sync cursor on partial `applyChanges` failure | S | Web |
| **H2** Add rate limits + max-batch caps to `/sync/push`, `/sync/flush-pending-tx`, `/backup` | S | API |
| **H3** Open backup DB readonly; fail the response on archiver error | S | API |
| **H4** Preserve `oversold = true` once set in `carts.ts:434` and `flush-pending-tx.ts:130` | S | API |
| **L2** Update README test-count claim | S | Docs |
| **M6** `expiresInMinutes <= 1440` upper bound on holds | S | API |

### Phase 2 — Short-term improvements (1–2 weeks)

| Item | Effort | Owner |
|---|---|---|
| **H5** Audit hooks for void/refund/settle/event-PATCH/payment-channel-PATCH | M | API |
| **H6** Add `version` columns + migration for `paymentChannels`, `cartItems`, `settings` | M | DB+API |
| **M1** Convert `SyncOpSchema` to `z.discriminatedUnion` with shared payload schemas | M | Sync |
| **M2** Replace `document.write` receipt with React + `@media print` | M | Web |
| **M3, M4** Delete dead `getCartIdleTtl` and dead-comment block in `carts.ts` | S | API |
| **M5** Validate sync payloads with Zod before IDB writes | M | Web |
| **M8** Drop Workbox runtime API cache | S | Web |
| **M9** Clear `localStorage`/`queryClient`/IDB on logout | S | Web |
| **M10** Pagination + filters on `/audit-log` and `/overrides` | S | API |
| Add CHECK constraints (L7) for paired-NULL fields in a new migration | S | DB |
| Add Playwright E2E for offline → flush → settlement | M | Test |
| Document `pnpm lint` behavior or wire it up (Biome) | S | Repo |

### Phase 3 — Longer-term refactors (2–6 weeks)

- Unit tests for void/refund and cart-sweeper.
- Logger helper `logBusinessEvent` and structured event taxonomy.
- `/health/deep` endpoint with backup age, open carts, oldest pending tx.
- Receipt + masked-amount audit across every pricing surface.
- Move to a Postgres-compatible reader/writer split if cardinality grows beyond a single booth (PRD §12 reserves the path).

---

## Appendix

### How to run/build/test locally (verified)

```bash
pnpm install
cp .env.example .env  # set SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD
pnpm dev              # web on :5173, api on :3001
pnpm typecheck        # all 3 workspaces
pnpm build
pnpm test             # ❌ FAILS today on packages/types/src/card.test.ts — see C2
# Workaround until C2 lands:
pnpm --filter @kolektapos/api test
pnpm --filter @kolektapos/web test
pnpm --filter @kolektapos/db test
pnpm --filter @kolektapos/sync test
pnpm --filter @kolektapos/qr test
```

### Notable files reviewed

- **API**: `apps/api/src/server.ts`, `config.ts`, `plugins/{session,auth-guard,audit}.ts`, `routes/{auth,users,events,payment-channels,settings,cards,carts,holds,transactions,sync,flush-pending-tx,backup,settlement,audit-log,overrides,health}.ts`, `jobs/{cart-sweeper,audit-pruner}.ts`, `utils/{pagination,time,user-dto}.ts`
- **DB**: `packages/db/src/{schema,triggers.sql,migrate,seed,index}.ts`, `drizzle/0000_*.sql`–`0003_*.sql`
- **Types**: `packages/types/src/{card,cart,event,payment-channel,settings,transaction,user,index}.ts`
- **Sync**: `packages/sync/src/{protocol,conflict,index}.ts`
- **QR**: `packages/qr/src/index.ts`
- **Web**: `apps/web/src/{App,main,index.css}.tsx`, `lib/{db,api,sync,background-sync,format,query-client,time}.ts`, `store/{auth,pos,sync-state}.ts`, `hooks/*`, `components/*`, `pages/*` (POSPage, InventoryPage, BulkImportPage, ReportsPage, MyPayoutPage, OversoldQueuePage, AdminPage, OverrideHistoryPage, AuditLogPage, EventsAdminPage, UsersAdminPage, CashReconciliationPage, ProfilePage, QRLabelPage, TransactionDetailPage, LandingPage, LoginPage, DashboardPage, DocsPage, StockReceivePage), `vite.config.ts`

### Dependency notes

All dependencies are recent (early 2026):
- Fastify 5.2, @fastify/* 10–12, drizzle-orm 0.38, better-sqlite3 11, bcryptjs 3, zod 3.24, archiver 7, node-cron 3
- React 19, Vite 6, Dexie 4, TanStack Query 5.67, Zustand 5, react-router 7, html5-qrcode 2.3, qrcode 1.5, xlsx 0.18, vite-plugin-pwa 0.21, workbox-window 7.3
- TypeScript 5.6, Vitest 4.1, Turbo 2.3

No critical CVEs surfaced via casual review. Recommend running `pnpm audit` periodically — or, since this is a closed deployment, a quarterly `pnpm up --latest` window.

### Test summary (per-package, fresh run on `2026-04-26`)

```
@kolektapos/qr      11/11 pass
@kolektapos/sync     8/8  pass
@kolektapos/types    5/7  pass (src) + 7/7 pass (stale dist)  ← FAILS overall
@kolektapos/db      16/16 pass
@kolektapos/api     22/22 pass
@kolektapos/web     31/31 pass
─────────────────────────────────────
Total source-level: 93/95 pass (2 fixable failures in card.test.ts)
```

---

*End of report.*
