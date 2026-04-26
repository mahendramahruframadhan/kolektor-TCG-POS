# Code Review Report – KolektaPOS (Merged)

**Date:** 2026-04-26 10:24:41
**Sources:** Merged from four independent reviews dated 2026-04-26 10:09–10:10
- `20260426-100910-CODE_REVIEW_REPORT-CLAUDE.md` (Claude Sonnet 4.6)
- `20260426-100950-CODE_REVIEW_REPORT-GLM.md` (GLM zai-coding-plan)
- `20260426-101021-CODE_REVIEW_REPORT-CLAUDE.md` (Claude Opus 4.7, 1M ctx)
- `20260426-101035-CODE_REVIEW_REPORT-KIMI_CODE_CLI.md` (Kimi Code CLI)
**Scope:** Full repository — local-first focus; CI/CD ignored.
**Commit/Version:** `9bedc2f` on `main` — `feat(offline): POS offline cart and payment queue`

---

## Executive Summary

KolektaPOS is a well-architected, well-documented local-first PWA + Fastify monorepo for a private 11-user TCG booth. Engineering discipline is strong: integer-IDR money handling, Zod-validated boundaries, append-only `transactions` / `transaction_items` enforced both in ORM code and via `RAISE(ABORT)` triggers, idempotent sync via `clientId`, optimistic concurrency via `version`, fail-fast env validation in `loadConfig()`, helmet + CORS allowlist + rate-limit on `/auth/*`, audit log with redaction and 90-day archive-then-prune. The recent offline cart + `pendingTransactions` + `flush-pending-tx` work is structurally sound.

However, the codebase is **not ship-ready for the first event**. Three blockers and several inventory-integrity races must be fixed first:

1. **`pnpm test` is red** — `packages/types/src/card.test.ts` was not updated when `category` became required in `CreateCardSchema`. Stale `dist/*.test.js` artifacts run alongside source tests and mask the failure.
2. **Migration `0003_add_category_to_cards.sql` is not registered in `_journal.json`** — Drizzle's migrator will skip it on fresh installs, so newly deployed databases will lack the `category` column.
3. **The push-side `CreateCardPushPayloadSchema` in `sync.ts` does not include `category`** — and the schema is `.strict()`, so any client that sends `category` has the op rejected, and any client that omits it produces cards with `category = ''` that fail downstream validation.

Beyond those, several inventory-integrity races (void/refund, hold expiry, holds-vs-cart, cart-pay-vs-hold) can corrupt card status during an event, and `flush-pending-tx` blindly trusts client-supplied `ownerUserIdSnapshot` and monetary fields — a settlement-correctness risk. The photo upload endpoint is a stub.

### Top risks

- **Critical** — Test suite fails on a clean checkout (C-1). Vitest also runs `dist/**` artifacts that hide the regression.
- **Critical** — Migration 0003 missing from Drizzle journal (C-2). Fresh DBs will be missing the `category` column.
- **Critical** — `CreateCardPushPayloadSchema` is missing `category`; offline-pushed cards either get rejected or stored with `category=''` (C-3).
- **Critical** — Photo upload route is a no-op stub (C-4). The PWA path is recorded, no file is written.
- **Critical** — Void/refund unconditionally sets cards back to `status='available'` even when oversold (C-5).
- **Critical** — Hold-expiry sweeper sets `cards.status='available'` without checking that the card is still `held` (C-6).
- **Critical** — Holds can be created on cards already locked by another cashier's draft cart (C-7).
- **Critical** — `flush-pending-tx` trusts client-supplied `ownerUserIdSnapshot`, `soldPriceIdr`, `totalIdr`, `subtotalIdr` with no server-side cross-check (C-8).
- **High** — Delta sync pull omits `transaction_items`, `payment_channels`, and `settings` (only initial pull includes them).
- **High** — `applyChanges` swallows per-row failures yet advances the sync cursor — silent client/server divergence.
- **High** — `/sync/*` and `/backup` have no rate limit and no batch-size cap.

### Quick wins (≤30 min each)

- Add `category: "TCG"` to the two failing fixtures in `packages/types/src/card.test.ts:5-14, 18-28`.
- Add `exclude: ['**/node_modules/**', '**/dist/**']` (or a `clean: rm -rf dist` predecessor) to all `vitest.config.ts` files so `dist/` stops double-running.
- Append the `0003_add_category_to_cards` entry to `packages/db/drizzle/meta/_journal.json` (or regenerate via `pnpm --filter @kolektapos/db db:generate`).
- Add `category: z.string().default("")` to `CreateCardPushPayloadSchema` in `apps/api/src/routes/sync.ts`.
- Open the source DB with `{ readonly: true }` in `apps/api/src/routes/backup.ts:30`.
- Apply `config: { rateLimit: { max: 60, timeWindow: "1 minute" } }` to `/sync/push`, `/sync/pull`, `/sync/flush-pending-tx`; cap `transactions: z.array(...).max(100)` and `ops: z.array(...).max(500)`.
- Cap `expiresInMinutes <= 1440` in `apps/api/src/routes/holds.ts`.
- Add `request.raw.on('close', cleanup)` in `backup.ts` to release temp files on client abort.
- Skip the API call in POSPage `handleRemoveItem` when `activeCartIsOffline === true`.
- Update `useTapHoldReveal(2000)` to `useTapHoldReveal()` (5 s default per PRD) in `POSPage.tsx:68`.

---

## Positive Observations

- **Architecture aligned with PRD invariants.** Append-only is enforced both in ORM (no `UPDATE`/`DELETE` on transactions) *and* DB (`triggers.sql` `RAISE(ABORT)`). Money is integer IDR throughout. `ownerUserIdSnapshot` correctly snapshots at sale time. Cart locking is denormalized onto `cards` as the PRD prescribes. Idempotency keys (`clientId`) are consistently applied across cards, carts, and transactions.
- **Fail-fast configuration.** `apps/api/src/config.ts` validates env via Zod, rejects the placeholder `change-me-...` secret, requires `DOMAIN` in production, and validates that admin seed vars are paired.
- **Solid auth posture.** bcryptjs cost 12, 30-day rolling sessions, `httpOnly`, `sameSite=strict`, `secure` in production. Rate limit on `/auth/login` (20/min) and `/auth/change-password` (10/min). Audit plugin redacts password/token fields.
- **Strict TypeScript.** `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noImplicitOverride` catch a class of bugs at compile time.
- **Sync push uses `.strict()` Zod schemas** to reject unknown fields, preventing field injection.
- **Cart and hold ownership guards** (`makeRequireCartOwnerOrAdmin`) close cross-user mutation gaps.
- **Background jobs are defensive.** Cart sweeper and audit pruner catch errors; pruner archives to JSONL before delete; Drizzle migrations are auto-applied on boot; storage directories are created with `mkdirSync({ recursive: true })`.
- **WAL mode + `foreign_keys=ON`** enabled at connection time.
- **Documentation is exceptional** for a project this size: PRD, implementation plan, runbook, ADRs, milestone progress reports, accessibility audit, prior multi-agent reviews, and `CLAUDE.md` for AI context.
- **A11y discipline.** Bahasa Indonesia in cashier strings, masked-amount discipline with 5 s tap-and-hold reveal (where wired correctly), `aria-live` on the sync indicator, focus-trap dialogs.

---

## Scorecard (0–10)

| Category | Score | Justification |
|---|---|---|
| Functionality & Code Quality | 6/10 | Core flows work end-to-end, code is clean, but inventory-integrity races, photo stub, sync-schema/category drift, and missing `create_cart`/`create_cart_item` push ops leave the offline-first contract incomplete. |
| Testing | 4/10 | Real-SQLite integration tests hit critical security paths, but the suite **fails on clean run** (C-1), `dist/**` double-runs hide the failure, and most pages and several reliability paths (void/refund, oversold, cart-sweeper, flush-pending-tx, settlement math) have zero coverage. |
| Security | 6/10 | Strong primitives (bcrypt, sameSite=strict, helmet, CORS allowlist, audit redaction, rate limit on auth, strict push schemas). Gaps: client-trusted financial fields in flush, no rate limit on `/sync/*`, session fixation possible on login, Swagger UI unprotected in prod, weak dev `.env` admin password. |
| Performance & Scalability | 6/10 | SQLite + WAL is right for 11 users. Missing indexes on hot-path FKs, unbounded `SELECT *` in initial pull/settlement/audit-pruner, N+1 update loops in cart-sweeper/pay/void/flush, no `ProductSearch` debounce. |
| Reliability & Stability | 6/10 | Transactional boundaries correct in carts/transactions; idempotent sync; cart-sweeper releases stale locks. Weaknesses: void/hold/cart races, `applyChanges` cursor-on-failure, backup error path doesn't terminate the response, no graceful shutdown for cron + DB. |
| Observability | 6/10 | Pino logs, structured `event:` fields on sales, audit log, health endpoint. Gaps: void/refund/settle/events PATCH have no audit hook, no correlation IDs, audit truncation can break JSON, client sync failures only `console.warn`. |
| Local Deployment & DevOps | 7/10 | `pnpm dev/build/typecheck` work; migrations auto-apply; storage paths auto-created; runbook is thorough. Deductions: `pnpm test` is red, `pnpm lint` is a no-op, `.env` with weak password sits on disk. |
| Configuration & Environment | 8/10 | Zod-parsed env, placeholder rejection, admin-vars-paired guard, `DOMAIN` required in prod. Minor: `sessionPlugin` re-reads `process.env.SESSION_SECRET` instead of using validated config; `settings` values stored as `unknown` without per-key schema. |
| UX | 7/10 | Bahasa Indonesia cashier UI, scan-first, masked-amount discipline (where wired), camera + HID scanner, offline banner + blocked state, sync dot, network-mode toggle. Gaps: receipt is `document.write`-based and skips masking; offline `handleRemoveItem` fails silently; tap-and-hold uses 2 s in POSPage vs 5 s PRD spec; no toast for flush failures. |
| Compliance & Legal | 7/10 | Proprietary license, data-retention policy doc, audit redaction, no payment-card data stored. Gaps: audit `diffJson` may include PII text fields; no documented retention for photos. |
| Documentation & Knowledge Sharing | 9/10 | PRD, implementation plan, runbook, ADRs, INDEX.md, CONTRIBUTING.md, `CLAUDE.md`, milestone progress, prior reviews — exceptionally thorough. Minor: README test-count claim is stale; no troubleshooting section in runbook; `flush-pending-tx` trust model is not documented inline. |

**Average: 6.5 / 10**

**Overall judgment:** **Not ship-ready for the first event.** Critical inventory-integrity issues (C-5/C-6/C-7/C-8) must be fixed before any cashier touches the system; release-blockers on the test suite, migration journal, sync-schema drift, and photo stub must close before deploy. Remaining items are defense-in-depth.

---

## Architecture Snapshot

**Stack:** Turbo + pnpm 10, Node 22+. `apps/api` = Fastify 5 + better-sqlite3 11 + Drizzle 0.38. `apps/web` = React 19 + Vite 6 + Dexie 4 + TanStack Query 5 + Zustand 5 + vite-plugin-pwa (Workbox).

**Modules:** `apps/api/src/{server,config}.ts`; plugins `{session, auth-guard, audit}`; routes for auth/users/events/payment-channels/settings/cards/carts/holds/transactions/sync/flush-pending-tx/backup/settlement/audit-log/overrides/health; jobs `{cart-sweeper (cron */5*), audit-pruner (cron daily 03:17)}`. Packages: `db` (Drizzle schema + migrations + triggers), `types` (Zod + inferred TS), `sync` (protocol + conflict rules), `qr` (short-id), `ui` (placeholder, empty).

**Key flows:**

- **Online POS:** scan → server card lookup → `POST /carts/:id/items` (server locks via `lockedByCartId` + version bump) → `POST /carts/:id/pay` → server inserts `transactions` + `transaction_items` snapshotting `ownerUserIdSnapshot` inside `db.transaction()` → cart `status='paid'`.
- **Offline POS:** scan → IDB lookup → local IDB cart (`activeCartIsOffline`) → pay → `pendingTransactions` IDB row → `flushPendingTransactions()` posts to `/sync/flush-pending-tx` on reconnect.
- **Sync:** `startBackgroundSync()` every 60 s + opportunistic — `flushPendingTransactions()` then `deltaSyncPull(cursor)` (cursor = `updatedAt`/`createdAt`).

---

## Consolidated Findings

> Each finding lists a unique merged ID, severity, category, location(s), and the source reviews it draws from (CLAUDE-1, GLM, CLAUDE-2, KIMI). Where two reviews disagreed, the entry reflects what the codebase actually shows after verification.

### Critical

#### C-1 — Test suite is red on clean checkout; `dist/**` double-runs mask it

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Testing / Functional defects
- **Location:** `packages/types/src/card.test.ts:5-14, 18-28`; `packages/types/dist/card.test.js` (stale); `packages/types/vitest.config.ts`
- **Sources:** all four reviewers
- **Problem:** `CreateCardSchema` was updated to require `category: z.string().min(1)` (commit `566fa8c`), but the two happy-path fixtures in `card.test.ts` were not updated. Both `safeParse(...).success` assertions return `false`. Vitest also picks up `packages/types/dist/card.test.js` (the pre-`category` compiled copy), which still passes — masking the regression unless every line of output is read.
- **Verified:** Confirmed in `packages/types/src/card.test.ts` (no `category` field in fixtures).
- **Impact:** `pnpm test` exits non-zero. Turbo halts on first failure, so `api`/`web`/`db`/`sync`/`qr` tests do not run from the root. CI cannot trust the suite.
- **Recommendation:**
  1. Add `category: "TCG"` to both fixtures.
  2. Add `test: { exclude: ['**/node_modules/**', '**/dist/**'] }` to every `vitest.config.ts` (or run `rm -rf dist` before `vitest`).
  3. Update README's "60 passing tests across 14 files" claim once the suite is green.

#### C-2 — Migration `0003_add_category_to_cards.sql` not registered in Drizzle journal

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functional defects / Reliability
- **Location:** `packages/db/drizzle/meta/_journal.json` (entries only for 0000, 0001, 0002); `packages/db/drizzle/0003_add_category_to_cards.sql`
- **Sources:** GLM (H-1)
- **Verified:** Journal contains `idx: 0..2` only; `0003_add_category_to_cards.sql` exists on disk.
- **Impact:** Drizzle's migrator reads `_journal.json` to determine pending work. On a fresh database the `category` column will not be created; runtime reads/writes that reference it will fail.
- **Recommendation:** Append the missing entry (or regenerate via `pnpm --filter @kolektapos/db db:generate` and verify all four migrations land):
  ```json
  {
    "idx": 3,
    "version": "6",
    "when": <epoch_ms>,
    "tag": "0003_add_category_to_cards",
    "breakpoints": true
  }
  ```

#### C-3 — `CreateCardPushPayloadSchema` in `/sync/push` does not include `category`

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functional defects / Sync protocol
- **Location:** `apps/api/src/routes/sync.ts:31-60`
- **Sources:** CLAUDE-1 (C-2), GLM (M-1)
- **Verified:** `grep "category" apps/api/src/routes/sync.ts` returns no matches; the schema uses `.strict()`.
- **Impact:** A client that sends `category` in the push payload has the op rejected (unknown field under `.strict()`). A client that omits it falls back to the SQLite default (`''`), which violates the `min(1)` contract enforced elsewhere by `CreateCardSchema`. Cards created offline → online drift in their category state.
- **Recommendation:** Add `category: z.string().default("")` (or `min(1)` to mirror `CreateCardSchema`) to `CreateCardPushPayloadSchema`.

#### C-4 — Photo upload endpoint silently discards uploaded data

- **Severity / Confidence / Effort:** Critical / High / S–M
- **Category:** Functional defects / Data integrity
- **Location:** `apps/api/src/routes/sync.ts:258-275` (line 263 comment: `// Simplified: just acknowledge the upload`; line 265 fabricates `photoPath`)
- **Sources:** all four reviewers
- **Verified:** `@fastify/multipart` is not registered; the handler never reads the body.
- **Impact:** Cards get a `photoPath` written to the row, but no file is on disk. Backups archive empty `photos/` directories; PRD §16.5 (photo upload backfill) is not satisfied.
- **Recommendation:** Either return `501 Not Implemented` and stop mutating `photoPath` until the feature is wired, or implement properly:
  ```ts
  // server.ts
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });
  // sync.ts
  const data = await request.file();
  if (!data) return reply.status(400).send({ error: "no file" });
  if (!/^[0-9a-f-]{36}$/i.test(cardClientId)) return reply.status(400).send({ error: "bad clientId" });
  const target = resolve(cfg.PHOTO_STORAGE_PATH, `${cardClientId}.jpg`);
  await pipeline(data.file, createWriteStream(target));
  ```

#### C-5 — Void/refund unconditionally re-opens cards to `status='available'` even when oversold

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functional defects / Data integrity
- **Location:** `apps/api/src/routes/transactions.ts:195-204`
- **Sources:** KIMI (C1)
- **Verified:** Loop at lines 198-203 issues `db.update(cards).set({ status: "available", ... }).where(eq(cards.id, cardId))` for every parent item, with no check for other un-voided sale rows.
- **Impact:** An oversold card with two sale transactions becomes purchasable again after the first is voided, while the second sale is still in the ledger. Cashiers can sell the same card a third time. Cash reconciliation is corrupted.
- **Recommendation:** Only revert to `available` if no other un-voided sale references the card:
  ```ts
  for (const cardId of cardIds) {
    const otherSales = db.select({ id: transactions.id })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
      .where(and(
        eq(transactionItems.cardId, cardId),
        eq(transactions.kind, "sale"),
        ne(transactions.id, parentId),
      )).all();
    const stillSold = otherSales.some((s) => !voidedParentIds.has(s.id));
    if (!stillSold) {
      db.update(cards).set({ status: "available", updatedAt: nowSec, version: card.version + 1 })
        .where(eq(cards.id, cardId)).run();
    }
  }
  ```
  Also bump `cards.version` on this update — currently missing (see L-9).

#### C-6 — Hold-expiry sweeper sets `cards.status='available'` without checking that the card is still `held`

- **Severity / Confidence / Effort:** Critical / High / XS
- **Category:** Functional defects / Data integrity
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:115-128`
- **Sources:** KIMI (C2)
- **Verified:** `db.update(cards).set({ status: "available", ... }).where(eq(cards.id, hold.cardId))` — no status guard. If the card was sold between hold creation and expiry, the sweeper resurrects it.
- **Recommendation:** Scope the update to held cards only:
  ```ts
  db.update(cards)
    .set({ status: "available", updatedAt: nowSec })
    .where(and(eq(cards.id, hold.cardId), eq(cards.status, "held")))
    .run();
  ```

#### C-7 — Holds can be created on cards already locked in another cashier's draft cart

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functional defects / Concurrency
- **Location:** `apps/api/src/routes/holds.ts:30-38`
- **Sources:** KIMI (C3)
- **Verified:** Hold creation only checks `card.status !== 'available'`. Cart-locking is denormalized onto `cards.lockedByCartId` while leaving `status='available'` (per PRD §6.1 rule 9), so a card sitting in someone's draft cart still satisfies the hold check.
- **Impact:** Two cashiers can each believe they have exclusive rights — one via cart, one via hold. Combined with C-6, this creates oversold loops.
- **Recommendation:** Reject when `card.lockedByCartId IS NOT NULL` and the locking cart is still `draft`:
  ```ts
  if (card.lockedByCartId) {
    const lockingCart = db.select().from(carts).where(eq(carts.id, card.lockedByCartId)).get();
    if (lockingCart && lockingCart.status === "draft") {
      return reply.status(409).send({ error: "Card is locked in an active cart" });
    }
  }
  ```

#### C-8 — `/sync/flush-pending-tx` trusts client-supplied `ownerUserIdSnapshot`, `soldPriceIdr`, `subtotalIdr`, `totalIdr`

- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security / Functional defects (settlement integrity)
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:80-140`
- **Sources:** CLAUDE-1 (H-1), KIMI (C4)
- **Verified:** The handler inserts `transactionItems` with `ownerUserIdSnapshot: item.ownerUserIdSnapshot` (line 106) and writes `soldPriceIdr`, `lineDiscountIdr`, etc. straight from the payload. There is no DB cross-check against `cards.ownerUserId`, no bottom-price floor enforcement, no `totalIdr === subtotalIdr − discountIdr` assertion.
- **Impact:** A buggy or compromised client can redirect settlement payouts (wrong owner) and bypass the bottom-price floor that `/carts/:id/pay` enforces. The threat profile is low (11 trusted users) but the data-integrity surface is real and settlement is the financial close of an event.
- **Recommendation:**
  1. For each item, look up the card and **overwrite** `ownerUserIdSnapshot` with `cards.ownerUserId` from the DB.
  2. Reject items where `soldPriceIdr < bottomPriceIdr` and `!overrideBelowBottom` (mirror the `/carts/:id/pay` floor logic).
  3. Assert `totalIdr === subtotalIdr − discountIdr` and `subtotalIdr === sum(item.soldPriceIdr)` server-side; reject on mismatch.
  4. Add an inline comment block documenting the offline trust boundary.

---

### High

#### H-1 — Delta sync pull omits `transaction_items`, `payment_channels`, and `settings`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functional defects / Sync
- **Location:** `apps/api/src/routes/sync.ts:139-151`
- **Sources:** CLAUDE-1 (H-3)
- **Verified:** Initial pull (cursor=0) at lines 105-137 includes all entity types. Delta branch at lines 139-150 only emits `card`, `event`, `user`, `cart`, and `transaction` — `transaction_item`, `payment_channel`, and `setting` are missing.
- **Impact:** After the first sync, transaction-detail pages render empty line-items for any newly synced sale. Settings changes (e.g., `max_line_discount_pct_fixed`) made on the server never reach already-synced clients. Same for newly added payment channels.
- **Recommendation:** Add the missing branches; transaction items can be scoped by the just-fetched `txChanges` IDs:
  ```ts
  const txIds = txChanges.map((t) => t.id);
  if (txIds.length > 0) {
    const txItems = db.select().from(transactionItems)
      .where(inArray(transactionItems.transactionId, txIds)).all();
    for (const row of txItems)
      changes.push({ entityType: "transaction_item", operation: "create", payload: row, serverReceivedAt: row.createdAt });
  }
  const channelChanges = db.select().from(paymentChannels).where(gt(paymentChannels.updatedAt, cursor)).all();
  const settingChanges = db.select().from(settings).where(gt(settings.updatedAt, cursor)).all();
  // push to changes
  ```

#### H-2 — `applyChanges` swallows per-row errors and still advances the sync cursor

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Data integrity
- **Location:** `apps/web/src/lib/background-sync.ts:27-69, 107-109`
- **Sources:** CLAUDE-2 (H1)
- **Problem:** A failed `idb.X.put(...)` (schema mismatch, IDB quota, malformed payload) is `console.warn`-ed and the loop continues. `setSyncCursor(response.newCursor)` then advances unconditionally, so the failed row is never re-pulled.
- **Recommendation:** Track per-change failures; if any fail, do not advance the cursor — let the next pull retry. As a stretch, validate every payload against the corresponding `@kolektapos/types` Zod schema before writing to IDB (defense-in-depth — this also catches server bugs/drift).

#### H-3 — `handleRemoveItem` calls the API unconditionally in offline mode

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / UX
- **Location:** `apps/web/src/pages/POSPage.tsx:757`
- **Sources:** CLAUDE-1 (H-4), KIMI (notes in §5)
- **Problem:** `handleRemoveItem` always calls `api.carts.removeItem(...)`. When `activeCartIsOffline === true`, the network call throws; the catch handles only 404/409 specifically, so the error propagates and the item is never removed locally.
- **Recommendation:**
  ```ts
  if (!activeCartIsOffline) {
    try { await api.carts.removeItem(activeCartId, item.cardId); }
    catch (err) { /* existing 404/409 handling */ }
  }
  // always do local IDB cleanup
  ```

#### H-4 — No rate limit or batch-size cap on `/sync/*` and `/backup`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security / Performance considerations
- **Location:** `apps/api/src/routes/sync.ts` (push/pull), `apps/api/src/routes/flush-pending-tx.ts:48-51`, `apps/api/src/routes/backup.ts`
- **Sources:** CLAUDE-1 (M-3), CLAUDE-2 (H2)
- **Problem:** Sync routes are gated by `requireAuth` only. `flush-pending-tx` validates `transactions: z.array(PendingTxSchema).min(1)` with no max. A misbehaving client (or backup polled by a load-balancer health check) can monopolize the SQLite writer during an event.
- **Recommendation:**
  ```ts
  // each /sync/* route
  config: { rateLimit: { max: 60, timeWindow: "1 minute" } }
  // schema caps
  transactions: z.array(PendingTxSchema).min(1).max(100)
  ops: z.array(SyncOpSchema).max(500)
  // /backup
  config: { rateLimit: { max: 2, timeWindow: "1 hour" } }
  ```

#### H-5 — Backup route opens DB read-write and does not terminate the response on archiver error

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Security
- **Location:** `apps/api/src/routes/backup.ts:30, 47-58`
- **Sources:** CLAUDE-1 (M-2), CLAUDE-2 (H3), KIMI (H4)
- **Verified:** `new Database(dbPath, { readonly: false })` at line 30. Cleanup is wired only to `archive.on("end"|"close")`; `archive.on("error", ...)` logs but does not call `reply.code(500)`, `archive.abort()`, or `reply.raw.destroy()`. There is no `request.raw.on('close', cleanup)`.
- **Impact:** The handler runs `wal_checkpoint(TRUNCATE)` and `source.backup(...)` — both work fine in readonly mode. On archiver failure the client hangs on a half-flushed body. On client abort, the temp snapshot is leaked in `/tmp`.
- **Recommendation:**
  - Open with `{ readonly: true }`.
  - On error: `cleanup(); try { reply.raw.destroy(err); } catch {}`.
  - Add `request.raw.on('close', cleanup)` to cover client aborts.

#### H-6 — Cart pay/flush handlers can clobber a previously-set `oversold = true`

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Functional defects / Data integrity
- **Location:** `apps/api/src/routes/carts.ts:434`, `apps/api/src/routes/flush-pending-tx.ts:130`
- **Sources:** CLAUDE-2 (H4)
- **Problem:** Both handlers write `oversold: alreadySold ? true : false` on every card update. If the card was previously flagged oversold by an earlier sale or the admin queue, and the current cart's view of the card status is `false`, the flag gets reset.
- **Recommendation:** Preserve once set:
  ```ts
  oversold: card?.oversold === true ? true : (card?.status === "sold")
  ```
  Or skip writing `oversold` unless transitioning false → true.

#### H-7 — Cart pay does not re-check active holds at payment time

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Functional defects / Concurrency
- **Location:** `apps/api/src/routes/carts.ts` (pay handler)
- **Sources:** KIMI (C5)
- **Problem:** `addCartItem` rejects cards with `status='held'`, but the pay handler does not re-verify holds at sale time. If a hold is placed on a card after it was added to the cart, the sale proceeds; the sweeper later (per C-6) reverts the card to `available`, creating divergence.
- **Recommendation:** Inside the pay transaction, query `holds` for unreleased rows on the cart's card IDs (`releasedAt IS NULL AND expiresAt > nowSec`). Reject 409 if any are held by a different user.

#### H-8 — Audit plugin entity-classification is wrong for `/sync/*` and `/auth/*`

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Observability
- **Location:** `apps/api/src/plugins/audit.ts:52-53`
- **Sources:** CLAUDE-1 (H-5)
- **Problem:** `entityType = parts[1]`, `entityId = parts[2]` produces `entityType="sync"`, `entityId="push"` for `POST /sync/push`, and `entityType="auth"`, `entityId="change-password"` for `POST /auth/change-password`. These aren't entities at all.
- **Recommendation:** Filter `sync`, `auth`, and `reports` to log `entityId=null`. Better: thread an explicit `request.auditNote = { entityType, entityId, note }` from route handlers and merge it in the `onSend` hook (this also fixes H-9).

#### H-9 — Many mutating routes have no audit hook (or audit captures the response, not the reason)

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Observability / Compliance
- **Location:** `apps/api/src/routes/transactions.ts` (void/refund), `events.ts` PATCH/POST, `holds.ts:15,68`, `settlement.ts:115-139`, `payment-channels.ts:39`, `flush-pending-tx.ts`
- **Sources:** CLAUDE-2 (H5)
- **Problem:** The audit plugin hooks `onSend` and stores the response body. For void/refund the response lacks the `reason` field (which is in the request body). The PRD-mandated invariant "admin override only with forced reason note" is enforced on input but not auditable from the output-only log.
- **Recommendation:** Add `request.auditNote = { ...reason, ...beforeState }` from inside the handler's `db.transaction()`, and have `onSend` merge it into `diffJson`. Alternatively, write explicit `auditLog.insert(...)` rows from inside the route's transaction.

#### H-10 — `paymentChannels`, `cartItems`, `settings` lack the `version` column required by PRD §6.1

- **Severity / Confidence / Effort:** High / Medium / M
- **Category:** Functional defects / Concurrency
- **Location:** `packages/db/src/schema.ts` (paymentChannels, cartItems, settings)
- **Sources:** CLAUDE-2 (H6)
- **Problem:** PRD §6.1 mandates optimistic concurrency on `cards, events, users, payment_channels, carts, cart_items, settings`. Schema only adds `version` to cards/events/users/carts. Two admins editing the same settings row produce a silent last-write-wins.
- **Recommendation:** Add `version` columns + a new migration for the missing tables; reject mismatched-version PUT/PATCH with 409 (matching `cards.ts:80-84`).

#### H-11 — Session ID not regenerated on login (session fixation surface)

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:39-40`
- **Sources:** KIMI (H5)
- **Problem:** Login mutates `request.session.userId` / `userRole` on the existing session object without regenerating the session ID. `@fastify/session` exposes `request.session.regenerate(...)` for this purpose.
- **Impact:** If an attacker can seed a pre-login session cookie (XSS, MITM), they piggyback the authenticated session. Risk is low under the same-domain `sameSite=strict` configuration but defense-in-depth is cheap.
- **Recommendation:** Call `await new Promise<void>((res, rej) => request.session.regenerate((err) => err ? rej(err) : res()))` (or the promise variant your version exposes) before assigning user fields.

---

### Medium

#### M-1 — Settlement discount distribution has rounding residual

- **Severity:** Medium / **Effort:** S
- **Category:** Functional defects
- **Location:** `apps/api/src/routes/settlement.ts:64-67`
- **Sources:** CLAUDE-1 (M-1)
- **Problem:** `Math.round(txDisc.discountIdr * item.soldPriceIdr / txDisc.subtotalIdr)` distributes proportionally; cumulative rounding can leave `sum(ownerTotals) ≠ tx.totalIdr` by a few IDR.
- **Recommendation:** "Last owner absorbs remainder" — track distributed total, give residual to the last owner.

#### M-2 — Receipt printing uses `document.write` and skips `MaskedAmount` discipline

- **Severity:** Medium / **Effort:** S
- **Category:** Code quality / UX
- **Location:** `apps/web/src/pages/POSPage.tsx:376-418`
- **Sources:** CLAUDE-2 (M2)
- **Recommendation:** Render via a hidden `<div ref>` with React + `formatIDR()` and `window.print()` + `@media print` stylesheet so the masked-amount system is the single source of truth.

#### M-3 — Dead/duplicated `getCartIdleTtl` helper and a dead-comment block in `carts.ts`

- **Severity:** Medium / **Effort:** S
- **Category:** Code quality
- **Location:** `apps/api/src/routes/carts.ts:23-35` (defined, never called); `apps/api/src/routes/carts.ts:357-365` (9-line comment with no code)
- **Sources:** CLAUDE-2 (M3, M4)
- **Recommendation:** Delete the dead helper (the live copy is in `cart-sweeper.ts:11-23`). Trim the comment to a one-liner referencing PRD §10.

#### M-4 — `/sync/push` payload is `z.record(z.unknown())`; per-op-type schemas live only on the server

- **Severity:** Medium / **Effort:** M
- **Category:** Architecture / design
- **Location:** `packages/sync/src/protocol.ts:32, 72`
- **Sources:** CLAUDE-2 (M1), CLAUDE-1 (C-2 sibling)
- **Recommendation:** Convert `SyncOpSchema` to `z.discriminatedUnion("type", [...])` with per-op payload schemas in `@kolektapos/sync` so the client and server share them and the C-3-class drift cannot recur.

#### M-5 — `lib/sync.ts:fetchAndSync()` is a legacy full-pull path that diverges from cursor sync

- **Severity:** Medium / **Effort:** M
- **Category:** Maintainability / Reliability
- **Location:** `apps/web/src/lib/sync.ts`
- **Sources:** CLAUDE-1 (M-6)
- **Problem:** `fetchAndSync()` does `clear().then(bulkPut())` table-by-table via individual REST endpoints. If it runs after a delta sync, it wipes pending offline carts in IDB.
- **Recommendation:** Confirm whether it is still called; if so, replace its callers with `deltaSyncPull(0)`. If not, delete it.

#### M-6 — Workbox `runtimeCaching` for `/api/*` (NetworkFirst, 5 s timeout) duplicates Dexie and stalls UX

- **Severity:** Medium / **Effort:** S
- **Category:** Performance / UX
- **Location:** `apps/web/vite.config.ts:30-37`
- **Sources:** CLAUDE-2 (M8)
- **Recommendation:** The PWA contract is "every read hits IDB; the API is sync-only." Drop the runtime cache; keep precache for the SPA shell.

#### M-7 — Auth/query-cache/IDB not cleared on logout

- **Severity:** Medium / **Effort:** S
- **Category:** Security / UX
- **Location:** `apps/web/src/store/auth.ts:16-24`, `apps/web/src/lib/query-client.ts:14-22`
- **Sources:** CLAUDE-2 (M9)
- **Recommendation:** On logout: `useAuthStore.persist.clearStorage()`, `queryClient.clear()`, and at minimum clear sensitive Dexie tables before route change.

#### M-8 — `holds.ts` accepts unbounded `expiresInMinutes`

- **Severity:** Medium / **Effort:** S
- **Category:** Functional defects / Validation
- **Location:** `apps/api/src/routes/holds.ts:26-28`
- **Sources:** CLAUDE-2 (M6)
- **Recommendation:** `if (body.expiresInMinutes > 1440) return reply.status(400)...`. Match the bound in the PWA UI.

#### M-9 — Initial sync pull has unbounded `SELECT *` on cards/events/transactions

- **Severity:** Medium / **Effort:** M
- **Category:** Performance considerations
- **Location:** `apps/api/src/routes/sync.ts:104-137`; settlement reads (`settlement.ts:35,44,152,201`); audit pruner (`jobs/audit-pruner.ts:34-38`)
- **Sources:** CLAUDE-1 (L-5), GLM (M-4), CLAUDE-2 (M7), KIMI (H2)
- **Problem:** Initial pull dumps all cards + 30 days of transactions; `inArray(transactionItems.transactionId, txRows.map(...))` can exceed `SQLITE_MAX_VARIABLE_NUMBER` (32766) on big events. Settlement loads all rows into Node. Audit pruner loads all >90-day rows at once.
- **Recommendation:** Add `LIMIT 5000` + `hasMore` cursor on the initial pull (the response shape already declares `hasMore`). Chunk `inArray` calls in 1000-row slices. Push settlement aggregation into SQL `GROUP BY`. Loop the pruner with `LIMIT 10000` until empty.

#### M-10 — Missing indexes on hot-path foreign keys and filter columns

- **Severity:** Medium / **Effort:** M
- **Category:** Performance considerations
- **Location:** `packages/db/src/schema.ts` and migrations
- **Sources:** KIMI (H1)
- **Missing indexes (high-impact):** `cart_items(cart_id)`, `cart_items(card_id)`, `holds(card_id)`, `holds(expires_at, released_at)`, `cards(event_id)`, `cards(locked_by_cart_id)`, `transactions(cart_id)`, `transactions(parent_transaction_id)`, `transactions(paid_at)`, `events(status)`, `audit_log(created_at)`, `cash_reconciliations(event_id, date)`.
- **Recommendation:** Add `0004_add_indexes.sql`. While at it, drop the duplicate `unique` + `uniqueIndex` pairs in 0000 (`cards_client_id`, `cards_short_id`, `carts_client_id`, `transactions_client_id`, `users_email`).

#### M-11 — N+1 update loops in cart-sweeper, cart pay/abandon, void/refund, flush

- **Severity:** Medium / **Effort:** S–M
- **Category:** Performance considerations
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:71-94`; `apps/api/src/routes/carts.ts:428-442,522-531`; `apps/api/src/routes/transactions.ts:198-202`; `apps/api/src/routes/flush-pending-tx.ts:125-138`
- **Sources:** KIMI (H6)
- **Recommendation:** Batch with `db.update(cards).set({...}).where(inArray(cards.id, ids))`. For cases that need per-row branching (oversold preservation, status guard), still possible via a single `CASE` expression.

#### M-12 — `/sync/push` does not handle `create_cart`, `create_cart_item`, or `update_cart`

- **Severity:** Medium / **Effort:** M
- **Category:** Functional defects / Sync
- **Location:** `apps/api/src/routes/sync.ts:166-247`
- **Sources:** GLM (H-3), KIMI (M1)
- **Problem:** The PWA records offline carts in Dexie and queues `pendingTransactions`. Offline cart creation/abandonment is invisible to the server, and `flush-pending-tx` inserts transactions with `cartId: null` (M-13).
- **Recommendation:** Either add the cart op types to the push protocol (preferred), or document the local-only-cart design explicitly in an ADR and update the runbook.

#### M-13 — `flush-pending-tx` inserts transactions with `cartId: null`

- **Severity:** Medium / **Effort:** S
- **Category:** Functional defects / Observability
- **Location:** `apps/api/src/routes/flush-pending-tx.ts:85`
- **Sources:** KIMI (M6)
- **Recommendation:** If `cartClientId` resolves to an existing server cart, set `cartId` to its server ID. Otherwise persist `cartClientId` in a new column or accept null but document.

#### M-14 — `flushPendingTransactions` can leave rows stuck in `syncStatus='syncing'`

- **Severity:** Medium / **Effort:** S
- **Category:** Reliability
- **Location:** `apps/web/src/lib/background-sync.ts:125-129`
- **Sources:** GLM (M-3)
- **Problem:** All pending rows are marked `"syncing"` before the network call. If the call throws, no rollback path resets them to `"pending"`; they will never retry.
- **Recommendation:** Wrap the post in try/catch and reset `"syncing"` → `"pending"` on failure (idempotent because `clientId` dedups server-side).

#### M-15 — Swagger UI exposed unconditionally in production at `/docs/api`

- **Severity:** Medium / **Effort:** S
- **Category:** Security
- **Location:** `apps/api/src/server.ts:111-114`
- **Sources:** CLAUDE-1 (M-5), CLAUDE-2 (in §3 notes)
- **Recommendation:** `if (cfg.NODE_ENV !== "production") { await app.register(swaggerUI, ...) }`, or guard the route with `requireAdmin`.

#### M-16 — Audit-log API has no pagination, filters, or sort

- **Severity:** Medium / **Effort:** S
- **Category:** Observability / Operability
- **Location:** `apps/api/src/routes/audit-log.ts`
- **Sources:** CLAUDE-2 (M10)
- **Recommendation:** Add `parsePagination()` plus `?from=&to=&userId=&entityType=&action=` filters. Index `audit_log.created_at` (see M-10).

#### M-17 — Audit `diffJson` truncated mid-string can split UTF-16 surrogate pairs / break JSON

- **Severity:** Medium / **Effort:** S
- **Category:** Observability / Data integrity
- **Location:** `apps/api/src/plugins/audit.ts:60`
- **Sources:** KIMI (M2)
- **Recommendation:** Truncate at a safe Unicode boundary or store a structured summary `{ pathsChanged: [...], beforeKeys: [...] }` instead of raw stringified JSON.

#### M-18 — `sessionPlugin` re-reads `process.env.SESSION_SECRET` instead of using validated config

- **Severity:** Medium / **Effort:** S
- **Category:** Configuration
- **Location:** `apps/api/src/plugins/session.ts:6-8`
- **Sources:** GLM (H-5), CLAUDE-1 (in §8 notes)
- **Recommendation:** Pass `cfg` to `sessionPlugin(app, { cfg })` and use `cfg.SESSION_SECRET`. The boot ordering is already correct; this just removes a duplicate validation.

#### M-19 — No graceful shutdown for cron jobs or DB connection

- **Severity:** Medium / **Effort:** S
- **Category:** Reliability
- **Location:** `apps/api/src/server.ts`
- **Sources:** KIMI (M5)
- **Recommendation:** `process.on('SIGTERM' | 'SIGINT', async () => { cronTasks.forEach(t => t.stop()); await app.close(); db.close(); process.exit(0); })`.

#### M-20 — Acceptance test seed-count assertion outdated

- **Severity:** Medium / **Effort:** XS
- **Category:** Testing
- **Location:** `packages/db/src/test-acceptance.ts:53` (`settingsRows.length === 3`); seed now produces 4 rows.
- **Sources:** GLM (H-4)
- **Recommendation:** Bump to `>= 3` or update to the exact current count.

#### M-21 — Acceptance/test setup uses `require('node:crypto')` in ESM

- **Severity:** Medium / **Effort:** XS
- **Category:** Code quality
- **Location:** `packages/db/src/test-setup.ts`
- **Sources:** GLM (M-7)
- **Recommendation:** `import { webcrypto } from 'node:crypto'`.

#### M-22 — `MaskedScopeProvider` not audited on every pricing surface (Reports, Inventory)

- **Severity:** Medium / **Effort:** S
- **Category:** UX / Compliance with PRD §6 masking rule
- **Location:** `apps/web/src/pages/{ReportsPage,InventoryPage}.tsx`
- **Sources:** CLAUDE-2 (in §9), CLAUDE-1 (carry-over)
- **Recommendation:** Walk every page that renders an IDR figure and confirm a `MaskedScopeProvider` ancestor; add ones missing.

---

### Low

#### L-1 — `generateShortId` uses `Math.random()` (not a CSPRNG)

`packages/qr/src/index.ts:38-43`. Sources: CLAUDE-1 (L-1), GLM (M-5), KIMI. Replace with `crypto.getRandomValues`. Real risk is negligible (server uniqueness constraint catches collisions; QRs are physical), but the change is two lines.

#### L-2 — `apps/web/src/lib/api.ts` uses `unknown` types extensively

Type the client with the inferred Zod types from `@kolektapos/types`. Start with `carts` and `transactions` (POS hot path). Sources: CLAUDE-1 (L-2), GLM (L-2).

#### L-3 — `ProductSearch` IDB scan runs on every keystroke (no debounce)

`apps/web/src/pages/POSPage.tsx:1261-1283`. Add 150–200 ms debounce. Sources: CLAUDE-1 (L-3), CLAUDE-2 (L12).

#### L-4 — Backup snapshot tempfile leaked on process crash

`apps/api/src/routes/backup.ts:24`. Cleanup is wired to `archive.on("end"|"close")` and (per H-5 fix) should be wired to `request.raw.on('close')`; a `process.on('exit')` sweep is optional. Sources: CLAUDE-1 (L-4), KIMI (H4).

#### L-5 — README "60 passing tests across 14 files" claim is stale

After C-1 the source-level count is ~88 across 16 files. Source: CLAUDE-2 (L2).

#### L-6 — `audit-pruner.ts` writes JSONL by row month — clock skew can yield far-future filenames

`apps/api/src/jobs/audit-pruner.ts:50-52`. Source: CLAUDE-2 (L3).

#### L-7 — `events.{settledAt,settledByUserId}` and `cards.{lockedByCartId,lockedByUserId,lockedAt}` lack paired CHECK constraints

Server logic is correct today; CHECKs would prevent partial-update bugs forever. Source: CLAUDE-2 (L7).

#### L-8 — Migration 0000 has duplicate unique indexes (covered by M-10)

`packages/db/drizzle/0000_faulty_cerebro.sql:50-53`. Sources: GLM (M-2), CLAUDE-2 (L6).

#### L-9 — `transactions.ts` void/refund updates `cards.status` but does not bump `cards.version`

Concurrent clients mid-sync can step on the change. Combine with C-5 fix. Source: CLAUDE-2 (L8).

#### L-10 — `seed.ts` types `db: ReturnType<typeof drizzle>` (drops the schema generic)

Causes "any-ish" queries inside the seed file. Source: CLAUDE-2 (L5).

#### L-11 — `@fastify/session` uses an in-memory store; sessions reset on API restart

Documented behavior; acceptable for a single VPS. Add a sentence to the runbook. Sources: CLAUDE-1 (in §11 deps), CLAUDE-2 (L11).

#### L-12 — `request.session.userId!` non-null assertions scattered through routes

Safe today (gated by `requireAuth`), but a typed `requireAuth` returning `{ userId, role }` would prevent future regressions. Source: CLAUDE-2 (L4).

#### L-13 — `NetworkModeToggle` attaches `mousedown` to `document` without `typeof document` guard

SSR-unsafe — irrelevant today, flagged for portability. Source: CLAUDE-2 (L9).

#### L-14 — `xlsx` is large (~700 KB), already dynamically imported

Confirm the chunk is split in `vite build` output. Source: CLAUDE-2 (L10).

#### L-15 — `lint` script is wired through Turbo but no package implements it

Either add Biome/ESLint or remove the script + README claim. Sources: GLM (L-3), CLAUDE-2, KIMI (L3).

#### L-16 — `packages/ui` is an empty placeholder

Either populate or remove to prevent confusion. Source: GLM (L-1).

#### L-17 — `oversold: alreadySold ? true : false` (carts.ts:434) is redundant given the schema default

Cosmetic; rolls into H-6 fix. Source: GLM (L-6).

#### L-18 — Route param/query types use `as { id: string }` casts

Add Fastify route schemas for params + query for both runtime safety and OpenAPI docs. Source: GLM (L-4).

#### L-19 — POSPage `useTapHoldReveal(2000)` overrides the 5 s default mandated by PRD §6 / CLAUDE.md

`apps/web/src/pages/POSPage.tsx:68`. Source: KIMI (§9).

#### L-20 — Default `HOST=0.0.0.0`

Acceptable for a single-VPS booth; document or default to `127.0.0.1` if behind a reverse proxy. Source: CLAUDE-2 (§8).

#### L-21 — No request/correlation IDs

Add `@fastify/request-id` and include `requestId` in business-event log fields. Source: GLM (L-5), KIMI (§6).

---

## Debunked / clarified claims

- **KIMI L1 — "`archiver` is in `devDependencies`."** **Incorrect.** `apps/api/package.json` lists `"archiver": "^7.0.1"` under `dependencies`; only `@types/archiver` is in `devDependencies`. No action needed.
- **GLM C-1 — "`.env` was committed to git history."** Verified that `.env` exists on disk and is in `.gitignore`. Reviewers should run `git log --all --full-history -- .env` to confirm before rotating; the file may never have been tracked. The weak `ADMIN_PASSWORD=changeme` in dev `.env` is still worth fixing (low priority, not Critical).
- **CLAUDE-1 H-1 (flush price validation) and KIMI C4 (flush owner verification)** are merged into **C-8**; both halves are real and the fix should address both in one pass.
- **Several reviews call out the same "session.userId not regenerated" issue (KIMI H5).** Verified at `auth.ts:39-40`. Merged as **H-11**.
- **Sync cursor advance behavior** — KIMI's review says the cursor "may still advance" on partial pull failure; CLAUDE-2 (H1) verifies that per-change errors are swallowed inside `applyChanges` and the cursor advances unconditionally. The CLAUDE-2 statement matches the code; merged as **H-2**.

---

## Recommended Action Plan

### Phase 1 — Pre-event blockers (0–3 days)

| # | Item | Refs | Effort |
|---|---|---|---|
| 1 | Fix `card.test.ts` fixtures + exclude `dist/**` from Vitest | C-1 | S |
| 2 | Add migration `0003` to `_journal.json` (or regenerate) | C-2 | XS |
| 3 | Add `category` to `CreateCardPushPayloadSchema` | C-3 | XS |
| 4 | Implement (or 501) photo upload endpoint | C-4 | S–M |
| 5 | Guard void/refund: only revert `status='available'` if no other un-voided sale | C-5 | S |
| 6 | Hold-expiry sweeper: add `AND status='held'` filter | C-6 | XS |
| 7 | Hold creation: reject when `lockedByCartId` is set on a draft cart | C-7 | S |
| 8 | `flush-pending-tx`: server-verify `ownerUserIdSnapshot`, enforce price floor, assert totals | C-8 | M |
| 9 | Delta sync pull: emit `transaction_items`, `payment_channels`, `settings` | H-1 | S |
| 10 | `applyChanges`: do not advance cursor on per-row failure | H-2 | S |
| 11 | POSPage `handleRemoveItem`: skip API call when offline | H-3 | XS |
| 12 | Rate-limit + max-batch caps on `/sync/*` and `/backup` | H-4 | S |
| 13 | `backup.ts`: open `readonly: true`; terminate response on archiver error; cleanup on client abort | H-5 | S |
| 14 | Preserve `oversold = true` once set (carts.ts, flush-pending-tx) | H-6 | XS |
| 15 | Cart pay re-check holds | H-7 | S |
| 16 | `holds.ts`: cap `expiresInMinutes <= 1440` | M-8 | XS |
| 17 | Regenerate session ID on login | H-11 | XS |
| 18 | Update README test-count claim | L-5 | XS |
| 19 | Restore POSPage tap-and-hold to 5 s (PRD spec) | L-19 | XS |

### Phase 2 — Hardening (1–2 weeks)

| # | Item | Refs | Effort |
|---|---|---|---|
| 20 | Audit hooks: thread `request.auditNote` through void/refund/settle/events PATCH | H-8, H-9 | M |
| 21 | Add `version` columns + migration for `paymentChannels`, `cartItems`, `settings` | H-10 | M |
| 22 | `0004_add_indexes.sql` for hot-path FKs + filter columns (and drop duplicate uniques) | M-10 | M |
| 23 | Cap initial pull (`LIMIT 5000` + `hasMore`); chunk `inArray` for tx-items; SQL aggregation in settlement; loop pruner with LIMIT | M-9 | M |
| 24 | Batch N+1 update loops with `inArray` / `CASE` | M-11 | S |
| 25 | Add `create_cart` / `create_cart_item` to `/sync/push` (or document local-only design) | M-12 | M |
| 26 | `flush-pending-tx`: link transactions back to a server cart row | M-13 | S |
| 27 | `flushPendingTransactions`: reset `syncing` → `pending` on failure | M-14 | S |
| 28 | Convert `SyncOpSchema` to `z.discriminatedUnion` with shared per-op payloads | M-4 | M |
| 29 | Replace `document.write` receipt with React + `@media print` | M-2 | S |
| 30 | Drop Workbox `runtimeCaching` for `/api/*` | M-6 | S |
| 31 | Logout flow: clear Zustand persist + queryClient + sensitive IDB tables | M-7 | S |
| 32 | Audit-log API: pagination + filters | M-16 | S |
| 33 | Safe truncation of audit `diffJson` | M-17 | S |
| 34 | Pass validated `cfg` to `sessionPlugin` | M-18 | XS |
| 35 | Graceful shutdown for cron + DB | M-19 | S |
| 36 | Gate Swagger UI in production | M-15 | XS |
| 37 | Acceptance test seed-count assertion + ESM `crypto` import | M-20, M-21 | XS |
| 38 | Validate sync payloads against `@kolektapos/types` schemas before IDB writes | (defense-in-depth) | M |
| 39 | Add `@fastify/request-id` + correlation IDs | L-21 | S |
| 40 | Add `pnpm lint` (Biome recommended) or remove the script | L-15 | S |

### Phase 3 — Long-term refactors (2–6 weeks)

| # | Item | Effort |
|---|---|---|
| 41 | Playwright E2E for offline → flush → settlement happy path | L |
| 42 | Unit tests for void/refund (parent-sums-to-zero), cart-sweeper (hold expiry races), `flush-pending-tx` (oversold preservation, owner verification), settlement math with voids | M |
| 43 | Type the `apps/web/src/lib/api.ts` client with inferred Zod types | M |
| 44 | Replace `Math.random()` with `crypto.getRandomValues` in QR package | XS |
| 45 | Add CHECK constraints for paired-NULL columns | S |
| 46 | `/health/deep` returning `{ schemaVersion, lastBackupTimestamp, openCarts, oldestPendingTx }` | S |
| 47 | Split `POSPage.tsx` (1,324 lines) into focused sub-components | L |
| 48 | Cashier Quick Reference + runbook troubleshooting section | M |
| 49 | Document offline-trust-model ADR | S |
| 50 | Per-key schema validation for `settings` writes | S |
| 51 | Audit dependency licenses (`pnpm licenses list`); document `xlsx` ce/Apache-2.0 acceptance | S |

---

## Appendix

### How to run/build/test locally

```bash
# Prereqs: Node 22+ (.nvmrc), pnpm 10+
pnpm install
cp .env.example .env  # set SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD

pnpm dev              # api on :3001, web on :5173
pnpm typecheck        # all workspaces (passes today)
pnpm build            # turbo build
pnpm test             # ❌ currently fails — see C-1

# Workaround until C-1 lands:
pnpm --filter @kolektapos/api test
pnpm --filter @kolektapos/web test
pnpm --filter @kolektapos/db test
pnpm --filter @kolektapos/sync test
pnpm --filter @kolektapos/qr test
```

### Notable files reviewed

- **API:** `apps/api/src/server.ts`, `config.ts`, `plugins/{session,auth-guard,audit}.ts`, `routes/{auth,users,events,payment-channels,settings,cards,carts,holds,transactions,sync,flush-pending-tx,backup,settlement,audit-log,overrides,health}.ts`, `jobs/{cart-sweeper,audit-pruner}.ts`, `utils/{pagination,time,user-dto}.ts`
- **DB:** `packages/db/src/{schema,triggers.sql,migrate,seed,index}.ts`, `drizzle/0000…0003.sql`, `drizzle/meta/_journal.json`
- **Types:** `packages/types/src/{card,cart,event,payment-channel,settings,transaction,user,index}.ts` and tests
- **Sync:** `packages/sync/src/{protocol,conflict,index}.ts`
- **QR:** `packages/qr/src/index.ts`
- **Web:** `apps/web/src/{App,main,index.css}.tsx`, `lib/{db,api,sync,background-sync,format,query-client,time}.ts`, `store/{auth,pos,sync-state}.ts`, `hooks/*`, `components/*`, `pages/*` (notably `POSPage.tsx`, `OversoldQueuePage.tsx`, `ReportsPage.tsx`, `InventoryPage.tsx`, `BulkImportPage.tsx`), `vite.config.ts`

### Dependency notes

- `@fastify/session` uses an in-memory store — sessions reset on API restart (acceptable for a single-VPS booth; document in runbook).
- `bcryptjs` is the pure-JS implementation; cost 12 ≈ 200 ms on typical hardware. Consider native `bcrypt` only if login latency becomes an issue.
- `xlsx@0.18.5` is the SheetJS community Apache-2.0 build; used only for bulk import/export and dynamically imported.
- `html5-qrcode@2.3.8` last published in 2023; verify behavior on current iOS Safari.
- `archiver@^7.0.1` is in `dependencies` (not devDependencies, contrary to one source review).

*End of merged report.*
