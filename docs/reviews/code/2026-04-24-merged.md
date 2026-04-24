# Code Review Report – KolektaPOS (Merged)

**Date:** 2026-04-24 03:30:00 WIB
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `262c07e` — "Simplify: remove dead code, extract shared util, fix perf issues" on branch `feat/complete-mvp`
**Sources merged:** KIMI (`20260424-021634`), GLM (`20260424-022032`), CLAUDE (`20260424-022122`), CODEX (`20260424-022758`). All findings below were re-verified against the working tree; reviewer-specific claims that did not survive verification were removed or downgraded.

---

## Executive Summary

KolektaPOS is a well-scoped, local-first PWA + Fastify/SQLite POS whose architecture tracks the PRD closely. The data layer is disciplined: integer IDR throughout, SQL-level append-only triggers on `transactions`/`transaction_items`/`audit_log`, owner snapshotting on transaction items, `client_id` idempotency, denormalized card locking, optimistic concurrency via `version`. The monorepo (Turbo + pnpm) is clean, the vertical POS slice works end-to-end (scan → review → cart → pay → receipt), and the existing tests are green.

However, the codebase has several critical and high-severity defects that block a safe first event:

1. **Authorization is session-only.** No per-resource ownership or admin-role checks on cards edits, cart operations (add/remove/pay/abandon), hold release, or transaction void/refund. Any authenticated cashier can void any sale or manipulate any cart.
2. **`/sync/pull` leaks full `users` rows including `passwordHash`** to every authenticated client, and the cashier bootstrap relies on the admin-gated `/users` endpoint so first-device hydration fails for non-admins.
3. **`/sync/push` spreads unvalidated client payloads directly into `db.insert()`.** No Zod parse, no stripping of server-owned fields. Only `create_card` and `create_transaction` are handled, so offline carts/items/holds never reach the server.
4. **Cashier and intake flows are not actually offline-first**: writes go through live API calls, and the push protocol cannot reconstruct a pay flow from IndexedDB.
5. **Three PRD invariants are broken on the client:** `useTapHoldReveal` reveals on press (inverted from PRD §9.1), `OversoldQueuePage` voids with a *card* UUID (so the admin resolution queue for R5 cannot function), and `POSPage` writes cart `lastActivityAt`/`lockedAt` in ms while the server and sweeper use Unix seconds.
6. **Server-side floor-price enforcement is missing for fixed-price cards** — `carts.ts` validates only discount percentage.
7. **Backup zips the live SQLite file** (WAL/SHM excluded, no snapshot) and **settlement payout math double-negates voids/refunds** (items are stored negative *and* multiplied by `-1` in the aggregator), so per-owner payouts are overstated after any void. Dashboard and daily-report "net" figures *increase* on void/refund.
8. **Security perimeter is absent**: no `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, no CSRF; cookie `sameSite: lax`; seed creates a `sha256:<hex>` admin with default password `changeme` and the login handler permanently accepts `sha256:` hashes.
9. **Test coverage is thin** outside the packages. Critical routes (cart pay, void/refund, sync push/pull, settlement, oversold, backup) have zero tests. The DB trigger test exercises hand-rolled tables, not the real migrated schema.

### Top 5 Risks

- **Critical —** Missing object-level authorization on core mutation routes (cards PATCH, cart add/remove/pay/abandon, hold release, transaction void/refund).
- **Critical —** `OversoldQueuePage.handleVoid(card.id, …)` passes a card UUID where a transaction UUID is required; R5 (oversold) resolution workflow is broken.
- **Critical —** `/sync/push` accepts raw unvalidated payloads and handles only `create_card` / `create_transaction`; offline-first cart/intake flows cannot round-trip.
- **Critical —** `/sync/pull` returns full `users` rows including `passwordHash` to every authenticated client.
- **Critical —** Inverted tap-and-hold bottom-price reveal violates non-negotiable invariant #6 (prices leak on casual tap).

### Quick Wins

- Gate `cards` PATCH, `transactions` void/refund, and `carts` mutation routes with `requireAdmin` or explicit ownership checks.
- Add an explicit DTO projection for `/sync/pull` (and `/users` where appropriate) that excludes `passwordHash`; split cashier bootstrap onto a dedicated non-admin endpoint.
- Invert `useTapHoldReveal` so reveal fires only after the hold timer elapses; update its unit test (which currently pins the bug).
- Fix `OversoldQueuePage` to resolve and void the latest `sale`-kind transaction for the oversold card.
- Zod-parse every `/sync/push` op against `packages/types` schemas; strip `cashierUserId`, `createdAt`, `status`, `oversold`, `serverReceivedAt` from client payloads.
- Enforce `intendedPriceIdr >= card.priceIdr` server-side for `pricingMode === 'fixed'`.
- Change `POSPage.tsx:609,665` from `Date.now()` to `Math.floor(Date.now()/1000)` for `lastActivityAt` and `lockedAt`.
- Fix settlement per-owner math: sum `soldPriceIdr` directly (already signed) instead of multiplying by `sign`.
- Fix Dashboard (`DashboardPage.tsx:37`) and Reports (`ReportsPage.tsx:225`) net math: `net = gross + signed_void_total` (do not subtract a negative).
- Replace the `/backup` file stream with `sqlite.backup()` or `VACUUM INTO` to a temp file; include or checkpoint WAL before zipping.
- Register `@fastify/helmet`, strict `@fastify/cors`, and `@fastify/rate-limit` on `/auth/*`; tighten cookie `sameSite` to `strict` (single-domain deployment).
- Remove the `sha256:` branch from `auth.ts`; require `ADMIN_PASSWORD` or skip admin auto-creation (no `changeme` fallback).
- Align `lastActivityAt` units, align `PORT` default with `.env.example` (3001).

---

## Scorecard (0–10)

| Category | Score | Justification |
|----------|-------|---------------|
| Functionality & Code Quality | 5/10 | Core flows exist and invariants are mostly respected, but broken oversold workflow, inverted reveal, missing fixed-price floor enforcement, double-signed settlement math, and partial push protocol undermine correctness. |
| Testing | 4/10 | ~33 tests pass (triggers, QR, types, sync protocol, auth smoke, MaskedAmount). ~11 of 14 route files have no route-level tests. No tests for cart pay, void/refund, sync, oversold, settlement math, or backup. The trigger test builds its own schema instead of exercising the migrated one. |
| Security | 3/10 | Sessions + bcrypt(12) are fine. But: no object-level authz, `passwordHash` exposed via sync, no CORS/Helmet/CSRF/rate-limit, `sha256:` seed path accepted forever, unvalidated `/sync/push`, unredacted audit payloads. |
| Performance & Scalability | 5/10 | SQLite + WAL, indexed hot paths. But unbounded `.all()` everywhere, `/reports/monthly` loads all transactions ever, initial `/sync/pull` dumps every card/user/event, ~1.35 MB web bundle. Fine at 11-user scale today; degrades with data accumulation. |
| Reliability & Stability | 5/10 | Append-only triggers + `client_id` idempotency + DB-wrapped transactions are strong. But unsafe backup, not-offline-first writes, client/server timestamp drift, no graceful shutdown, sync cursor advances on partial failure, oversold void incorrectly reopens cards. |
| Observability | 4/10 | Fastify logger enabled; audit table exists. But `console.log` in sweeper, `catch {}` in audit, no structured business events, no health endpoint, no request correlation IDs. |
| Local Deployment & DevOps | 6/10 | `pnpm dev`/`test`/`build`/`typecheck` work; Turbo pipeline clean; runbook thorough. But `lint` is a no-op, `archiver` mis-declared in `devDependencies`, `PORT` default diverges from `.env.example`, no dir-creation on first boot. |
| Configuration & Environment | 5/10 | `.env.example` present and validated at boot for `SESSION_SECRET` length. But `.env` with a real 64-hex secret sits on disk, settings accept any key with `z.unknown()` value, no env-schema validation. |
| UX | 6/10 | Mobile-first Bahasa Indonesia cashier UI, masked amounts, camera + HID scanner, receipt modal are on-point. Bugs: inverted reveal, broken oversold resolution, silent sync failures, cart-pay failure leaves ambiguous state. |
| Compliance & Legal | 5/10 | No `LICENSE` file; `"private": true` in `package.json` but no license field. Audit log retention unbounded and stores up to 2000 bytes of response body (potential PII). No documented data-retention policy. |
| Documentation & Knowledge Sharing | 7/10 | PRD, implementation plan, runbook, per-milestone notes, and CLAUDE.md are excellent. README is stale ("no source code yet") and no CONTRIBUTING/ADRs. |

**Average: 5.0/10**

---

## Architecture Snapshot

- **Monorepo** (Turbo + pnpm 10, Node 22+): `apps/{web,api}` + `packages/{db,types,sync,qr,ui}` — `ui` is an empty placeholder.
- **API** (`apps/api`): Fastify 5 + better-sqlite3 11 via Drizzle 0.38. Plugins: `@fastify/session` + `@fastify/cookie`, custom `onSend` audit hook. Background job: `node-cron` sweeper every 5 min.
- **Web** (`apps/web`): React 19 + Vite 6 + vite-plugin-pwa (Workbox). Dexie 4 for IndexedDB, TanStack Query v5 (localStorage persister) for server state, Zustand 5 for UI state, react-router 7.
- **Sync**: cursor-based delta pull (`updatedAt`/`createdAt > cursor`), op-list push with per-op accept/reject; `client_id` UUID dedupes. Foreground polling every 60s + opportunistic trigger.
- **Data model** (PRD §6):
  - `transactions` / `transaction_items`: append-only (DB triggers enforce).
  - `cards`: denormalized `locked_by_cart_id` / `locked_by_user_id` / `locked_at` for fast scan.
  - `transaction_items.owner_user_id_snapshot`: the **only** field used for settlement.
  - `settings` JSON rows for `cart_idle_ttl_minutes`, `max_line_discount_pct_fixed`, `max_transaction_discount_pct`.
- **Auth**: bcryptjs cost 12 for user-created passwords; `sha256:` prefix fallback accepted for the seeded admin. 30-day rolling session cookie, `httpOnly`, `sameSite: lax`, `secure` in production.

---

## Findings (Prioritized)

### Critical

#### C1. Object-level authorization missing on core mutation routes

- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security
- **Location:** `apps/api/src/routes/cards.ts:41,65` (POST/PATCH); `apps/api/src/routes/carts.ts:41,76,92,234,291,458` (create/add/remove/pay/abandon); `apps/api/src/routes/transactions.ts:62,74` (void/refund); `apps/api/src/routes/holds.ts:14,67` (release)
- **Problem:** All mutating endpoints use `{ preHandler: requireAuth }` only. There is no check that the caller owns the cart/hold, is the card's owner, or is an admin. Any authenticated cashier can: void/refund another cashier's sales, pay or abandon another cashier's cart, release someone else's hold, or PATCH any card.
- **Impact:** A cashier can void their own sale and keep the cash; admin-only controls per PRD §7.1/§7.3 are unenforced.
- **Recommendation:** Carts and holds → owner-or-admin. Card PATCH → admin or (optionally) card-owner. Transaction void/refund → `requireAdmin`. Add regression tests for cross-user access attempts.

#### C2. `/sync/pull` leaks `passwordHash` to every authenticated client

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security
- **Location:** `apps/api/src/routes/sync.ts:44-45, 74-75, 85`; `packages/db/src/schema.ts:14-23`
- **Problem:** `/sync/pull` selects full user rows with `db.select().from(users).all()` and serializes them verbatim as `payload`, including `passwordHash`.
- **Impact:** Every cashier session can retrieve every user's bcrypt hash (and the admin's unsalted SHA-256 — see C7). Offline credential cracking risk.
- **Recommendation:** Define an explicit DTO projection (`{ id, email, displayName, role, ownerChar, avatarUrl, createdAt, updatedAt }`) and use it for both `/sync/pull` and `/users`. Never select `passwordHash` outside `/auth/*`.

#### C3. `/sync/push` accepts unvalidated payloads; only two op types supported

- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security / Reliability / Invariant #7 (server-authoritative)
- **Location:** `apps/api/src/routes/sync.ts:109-159` (no Zod parse; payload spread at line 140)
- **Problem:** `const body = request.body as { ops: Array<{ type; clientId; payload: Record<string, unknown> }> }` then `db.insert(cards).values({ id, clientId, ...op.payload })`. Any client can write forged `oversold`, `eventId`, `ownerUserId`, `status='sold'`, `lockedByCartId`, `createdAt`, or (for transactions) `cashierUserId`, `totalIdr`, `paidAt`. Only `create_card` and `create_transaction` cases are handled — there is no `create_cart`, `create_cart_item`, `create_hold`, or `create_transaction_item` branch.
- **Impact:** A compromised or buggy client can poison rows, backdate sales, or attribute them to other owners (breaking settlement). Offline carts/items/holds never reach the server, so full offline round-trip is impossible.
- **Recommendation:** Wrap each `op.type` in a Zod schema from `packages/types` (use `.strict()` to reject unknown keys). Strip server-owned fields before merge (`cashierUserId` from session, `serverReceivedAt = Date.now()`). Add the missing op handlers so offline cart/pay flows can actually sync.

#### C4. App is not offline-first for cashier and intake workflows

- **Severity / Confidence / Effort:** Critical / High / L
- **Category:** Reliability / PRD invariant #1
- **Location:** `apps/web/src/pages/POSPage.tsx:597,654,688,728`; `apps/web/src/pages/IntakePage.tsx:233`; `apps/web/src/lib/background-sync.ts:75`; `apps/api/src/routes/sync.ts:109`
- **Problem:** Core write paths (create cart, add item, pay, create card) call live API endpoints. Background sync only pulls; the push protocol is incomplete (C3). When network is unavailable, intake and POS-pay fail instead of continuing locally.
- **Impact:** Directly violates PRD non-negotiable #1 ("Every cashier operation must work with zero network"). At the convention hall, a flaky uplink halts checkout.
- **Recommendation:** Move writes to IndexedDB-first with an outbound operation queue; reconcile via `/sync/push` on reconnect. This is a scope-sized change (Phase 2); in the interim, document the current online-requirement in the runbook and add a prominent offline indicator.

#### C5. `OversoldQueuePage` voids with a card UUID

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality / Reliability / PRD R5
- **Location:** `apps/web/src/pages/OversoldQueuePage.tsx:104` (caller) and `:23-27` (receiver)
- **Problem:** `onClick={() => handleVoid(card.id, voidReason)}` passes a card UUID into `handleVoid(transactionId, reason)`, which in turn calls `api.transactions.void(transactionId, …)`. The server returns 404 "Parent transaction not found".
- **Impact:** The admin queue designated as the *only* resolution path for oversold (R5, PRD's single accepted residual risk) is non-functional. Oversold residuals accumulate and cash reconciliation at event-end cannot complete.
- **Recommendation:** For each oversold card, look up `transaction_items.where(cardId).equals(card.id)` → pull parent transactions with `kind='sale'` that have no matching `void`, present a picker if there are ≥2 (the whole point of oversold), and void the chosen transaction.

#### C6. Inverted tap-and-hold bottom-price reveal

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security / UX / PRD invariant #6
- **Location:** `apps/web/src/hooks/useTapHoldReveal.ts:10-17`
- **Problem:** `startReveal` calls `setRevealed(true)` *immediately* on pointer-down and schedules `setRevealed(false)` after `holdMs`. The 5-second hold is an auto-hide timer, not a reveal gate. A casual tap shows the price for up to 300 ms (and longer if the user holds).
- **Impact:** Bottom prices leak to any bystander who taps the control — violates non-negotiable invariant #6 ("Bottom prices are never rendered by default. Tap-and-hold 5s reveal, auto-hide.").
- **Recommendation:**
  ```ts
  const startReveal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRevealed(true);
      timerRef.current = setTimeout(() => setRevealed(false), AUTOHIDE_MS);
    }, holdMs);
  }, [holdMs]);
  const endReveal = useCallback(() => {
    if (timerRef.current && !revealed) clearTimeout(timerRef.current);
  }, [revealed]);
  ```
  Update `useTapHoldReveal.test.ts`, which currently asserts the buggy behaviour.

#### C7. SHA-256 seed path + default `changeme` admin password

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security / Secure defaults
- **Location:** `packages/db/src/seed.ts:7-10, 61-79`; `apps/api/src/routes/auth.ts:36-42`; `apps/api/src/server.ts:31-34` (seed auto-runs on startup)
- **Problem:** On startup, if no admin exists, the server seeds `admin@kolekta.id` / `changeme` hashed with **unsalted SHA-256** (`sha256:<hex>`). The login handler permanently branches on the `sha256:` prefix, so any operator who skips rotation retains an offline-crackable hash indefinitely.
- **Impact:** If the SQLite file leaks (backup zip, laptop backup, disk snapshot), the admin password is trivially reversible. `changeme` is also directly guessable by an attacker who can reach the login endpoint.
- **Recommendation:** Require explicit `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars; skip seed (or fail startup in non-test environments) if `ADMIN_PASSWORD` is not set. Use `bcrypt.hash()` in the seed. Remove the `sha256:` branch from `auth.ts` and `change-password`. If migration is needed, force-rotate on first login.

#### C8. Fixed-price floor not enforced on server

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Reliability / PRD invariant #4 (hard floor)
- **Location:** `apps/api/src/routes/carts.ts:142-181`
- **Problem:** For `pricingMode === 'fixed'`, the server checks only `lineDiscountPct > max_line_discount_pct_fixed`. It never compares `intendedPriceIdr` against `card.priceIdr`. A client sending `intendedPriceIdr: 1, lineDiscountIdr: 0` passes validation. The happy-path UI happens to pass the correct value, but the invariant is not enforced.
- **Impact:** Any client bug, future branch, or forged request can sell a fixed card below its listed price with no admin override. Violates invariant #4. Combined with C3 (unvalidated `/sync/push create_transaction`), this is directly exploitable.
- **Recommendation:** For fixed cards, also reject `intendedPriceIdr < card.priceIdr` unless `requiresAdminOverride && session.role === 'admin'`. Log attempts as a structured event.

#### C9. Cart `lastActivityAt` and `lockedAt` unit mismatch (ms vs seconds)

- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality / Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:609, 665` (uses `Date.now()` → ms) vs `apps/api/src/routes/carts.ts:59` + `apps/api/src/jobs/cart-sweeper.ts:34` (Unix seconds)
- **Problem:** When the PWA creates a local cart in IndexedDB, it writes `lastActivityAt: Date.now()` (~1.7 × 10¹²). The sweeper compares against `nowSec − ttlMinutes*60` (~1.7 × 10⁹). Client-originated rows are therefore never marked idle. The same ms/s drift exists on `lockedAt`.
- **Impact:** Locally-created carts never time out (PRD §6.4 TTL ineffective), and reconciliation logic becomes inconsistent once server and local rows coexist in IndexedDB.
- **Recommendation:** Standardise on Unix seconds end-to-end. Change `POSPage.tsx:609,665` to `Math.floor(Date.now()/1000)`. Introduce a single `nowSec()` helper and lint/typecheck for accidental ms usage on timestamp fields.

---

### High

#### H1. Settlement per-owner math double-negates voids/refunds

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality
- **Location:** `apps/api/src/routes/transactions.ts:182-196` (inserts negative `soldPriceIdr`, line 190); `apps/api/src/routes/settlement.ts:53-57` (applies `sign = kind === 'sale' ? 1 : -1`)
- **Problem:** Void/refund transaction items are stored with already-negative `soldPriceIdr`. The settlement aggregator then multiplies non-sale rows by `-1`, so `(-1000) * (-1) = +1000` — the owner's payout *increases* on each void. Grand totals (`grandTotalSalesIdr`, `grandTotalVoidsIdr` via `Math.abs`, `netIdr = sales − voids`) are calculated separately and are correct.
- **Impact:** Per-owner payout breakdown is wrong after any void/refund. Settlement exports and admin payouts are financially incorrect.
- **Recommendation:** Pick one convention. Easiest: sum `item.soldPriceIdr` directly (it is already signed): `ownerTotals[ownerId] += item.soldPriceIdr;`. Drop the `sign` multiplier. Add a unit test with a known sale + void sequence to lock the math.

#### H2. Dashboard / daily-report net math inverts on void

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality
- **Location:** `apps/web/src/pages/DashboardPage.tsx:30-37`; `apps/web/src/pages/ReportsPage.tsx:223-225`
- **Problem:** Both compute `net = gross - voids` where `voids = todayTxs.filter(void|refund).reduce(s + t.totalIdr, 0)`. Since `totalIdr` is already negative for voids/refunds, subtracting a negative *adds* to net.
- **Impact:** Operators see net sales *increase* after voiding a transaction — directly misleading during reconciliation.
- **Recommendation:** Either sum with magnitude (`Math.abs(t.totalIdr)`) or add the signed total without negating twice: `net = gross + signedVoidTotal`.

#### H3. Backup zips live SQLite file; WAL/SHM excluded, no snapshot

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Reliability
- **Location:** `apps/api/src/routes/backup.ts:27-38`; `packages/db/src/migrate.ts:11-16` (WAL mode enabled)
- **Problem:** `/backup` opens a `createReadStream` on the main DB file while the app is actively writing; the zip omits `-wal` and `-shm` files; no checkpoint/snapshot is taken. On restore, recent writes may be missing or the DB may be inconsistent.
- **Impact:** The disaster-recovery path documented in the runbook is unsafe. An event's data loss is unrecoverable (PRD §13 MVP justification).
- **Recommendation:** Snapshot to a temp file first: either `db.pragma('wal_checkpoint(TRUNCATE)')` followed by file copy, or `sqlite.backup(tempPath)` (better-sqlite3 API), or raw SQL `VACUUM INTO '…tmp'`. Stream the temp file, then unlink. Document and test a restore procedure.

#### H4. No CORS / Helmet / CSRF / rate limit; `sameSite: lax` cookie

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `apps/api/src/server.ts`; `apps/api/src/plugins/session.ts:5-22`
- **Problem:** None of `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, or `@fastify/csrf-protection` are registered. Login has no throttle. `sameSite: lax` still permits top-level form POSTs to execute with credentials.
- **Impact:** Brute-force against the public login endpoint is unthrottled. Cross-site POST with admin session cookies is feasible. No defence-in-depth headers.
- **Recommendation:** Register helmet (defaults), rate-limit (e.g. 20/min on `/auth/*`, 200/min global), strict CORS (same-origin only — PRD §10 confirms single domain). Tighten cookie to `sameSite: strict`. Add CSRF only if third-party origins are ever needed.

#### H5. Oversold void incorrectly reopens cards

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / PRD invariant #10
- **Location:** `apps/api/src/routes/transactions.ts:199-208`
- **Problem:** After voiding, the handler blindly sets `cards.status = 'available'` for every item's card — without checking whether *another* sale-kind item exists for that card (the oversold case, where two devices each sold it). Only one sale has been voided, but the card now appears available for re-sale.
- **Impact:** The oversold card reopens; a third sale becomes possible. Inventory count drifts from ground truth.
- **Recommendation:** Before resetting status, check for any other `sale`-kind `transaction_item` on this card without a matching void. If another sale remains, keep `status='sold'` and only clear the `oversold` flag if exactly one sale is left.

#### H6. Settled events are not locked against further transactions

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/settlement.ts:100-124` (settle stamps `settledAt` only); `apps/api/src/routes/carts.ts` (no `settledAt` check on any mutating route)
- **Problem:** Settling an event does not prevent new carts, pays, or voids against it. The append-only triggers don't care, and neither do the route handlers.
- **Impact:** A late-arriving offline sync push from another booth/device can re-open payouts for a settled event after admins have distributed cash.
- **Recommendation:** Reject cart create/addItem/pay (and ideally void/refund) when the referenced `event.settledAt` is not null. Surface `"settled_event_rejected"` in `/sync/push` results so the cashier sees it.

#### H7. Unbounded list queries throughout API

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Performance
- **Location:** `apps/api/src/routes/cards.ts:16`, `transactions.ts:31`, `events.ts:15`, `users.ts:17`, `payment-channels.ts:18`, `settings.ts:15`, `holds.ts:102`, `settlement.ts:35,175`
- **Problem:** All list endpoints call `.all()` with no `LIMIT`/`OFFSET`. `/reports/monthly` (`settlement.ts:175`) loads *every* transaction ever and filters in JS.
- **Impact:** Response sizes and memory grow linearly; mobile devices on convention Wi-Fi choke on a few MB of cards.
- **Recommendation:** Add `limit`/`offset` or cursor params with defaults (e.g. 500). Push filters into SQL — for monthly report, `WHERE paid_at BETWEEN ? AND ?`.

#### H8. `/sync/pull` initial dump is heavy and single-shot

- **Severity / Confidence / Effort:** High / Medium / M
- **Category:** Performance / Reliability
- **Location:** `apps/api/src/routes/sync.ts:42-80`
- **Problem:** Cursor=0 returns every user, every event (no active-plus-last-2-closed filter despite the comment), every payment channel, every setting, every card (plus a redundant `cardRows` query filtering `status='sold'` that's immediately overwritten by `allCards` at line 56), all 30-day transactions, and all their items. `hasMore: false` always.
- **Impact:** Initial pull grows to multi-MB after a few events; parsing + IDB writes block PWA startup; mobile devices on poor Wi-Fi time out.
- **Recommendation:** Paginate per entity type in chunks of ~500 rows with `hasMore`. Filter events to active + last 2 closed as the comment intends. Return `transaction_items` only for included transactions. Drop the dead `cardRows` query. Enable gzip at Fastify.

#### H9. Delta sync is missing five entity types

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Sync completeness
- **Location:** `apps/api/src/routes/sync.ts:82-94`
- **Problem:** The delta branch (cursor > 0) ships changes for `cards`, `events`, `users`, `carts`, `transactions` only. `settings`, `payment_channels`, `transaction_items`, `holds`, and `cash_reconciliations` are only returned on cursor=0.
- **Impact:** Admin-updated settings (e.g. `max_line_discount_pct_fixed`, cart TTL) and payment-channel renames never propagate to cashier devices mid-event. Client-computed reports miss items from transactions that arrived after cursor=0.
- **Recommendation:** Add the missing tables to the delta branch. `payment_channels` lacks `updatedAt`/`version` — add them (see M7 below).

#### H10. `@fastify/rate-limit` absent on `/auth/login`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:16-57`
- **Problem:** Login accepts unthrottled attempts. bcrypt is async but no cap per IP/account.
- **Impact:** Credential stuffing and brute-force feasibility against a small known user set.
- **Recommendation:** Register `@fastify/rate-limit` globally (e.g. 200/min) and tighter on `/auth/*` (20/min). Add 100–200 ms delay on failed compare + small lockout window on repeated failures.

#### H11. Audit plugin logs full payloads without redaction; swallows errors

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security / Observability / Privacy
- **Location:** `apps/api/src/plugins/audit.ts:11-41`
- **Problem:** The `onSend` hook writes `payload.slice(0, 2000)` into `audit_log.diff_json` for every mutation, with no field redaction. The catch block is empty (`catch {}`), so DB insert failures are invisible. `entityType`/`entityId` are derived from URL path with no allowlist.
- **Impact:** Password/session material may land in plaintext audit rows on `/auth/*` or `/users` POST/PATCH. Audit gaps are silent. Table grows unbounded with large bodies.
- **Recommendation:** Explicit allowlist of auditable routes; redact `password`, `passwordHash`, `newPassword`, `currentPassword`, `session`, `token`. Log `userId`, `method`, `path`, `entityType`, `status`, `timestamp` — not raw body. Emit a structured log line (not `console`) on insert failure. Add nightly archive/prune to cap growth.

#### H12. Cart sweeper has no graceful shutdown

- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Reliability
- **Location:** `apps/api/src/server.ts:60`; `apps/api/src/jobs/cart-sweeper.ts:29`
- **Problem:** `startCartSweeper(db)` returns a `ScheduledTask` which is never stored. No SIGTERM/SIGINT handler, no Fastify `onClose` hook. A cron tick can fire mid-shutdown against a closed DB handle.
- **Impact:** Potential crash or SQLite lock during restart; WAL may not be checkpointed cleanly.
- **Recommendation:** Store the task, stop it inside `app.addHook('onClose', …)`, and register SIGTERM/SIGINT to call `app.close()`.

#### H13. Photo upload endpoint is a stub

- **Severity / Confidence / Effort:** High / High / M
- **Category:** Functionality
- **Location:** `apps/api/src/routes/sync.ts:182-199`
- **Problem:** `POST /sync/photo/:cardClientId` updates `photoPath` in the DB but does not parse multipart, does not read the request body, and never writes a file. The client (`IntakePage.tsx:274-280`) sends a `FormData` that is discarded.
- **Impact:** Photos are silently lost; `pendingPhotos` accumulates orphaned IDB blobs; users believe photos are saved.
- **Recommendation:** Register `@fastify/multipart`, persist the file to `PHOTO_STORAGE_PATH` (create the directory on boot if missing), return the canonical URL. Add a backfill endpoint for `pendingPhotos`. Or — if photos are de-scoped from MVP — remove the stub and the client upload code and document the deferral.

#### H14. Cashier initial sync calls admin-only `/users`

- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality
- **Location:** `apps/web/src/lib/sync.ts:22`; `apps/api/src/routes/users.ts:16` (guarded by `requireAdmin`)
- **Problem:** `fetchAndSync()` calls `api.users.list()`, but the route requires admin. A cashier's first-device hydration fails with 403 before POS becomes usable.
- **Impact:** Single largest UX failure on first login for any non-admin user. Also blocks offline bootstrap on new devices.
- **Recommendation:** Add a dedicated `/sync/bootstrap` (or extend `/sync/pull` cursor=0) that returns the minimal user DTO (`id, email, displayName, role, ownerChar, avatarUrl`) — no passwordHash. Keep `/users` admin-only for management.

---

### Medium

#### M1. Client-reported `requiresAdminOverride` not re-verified by server

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Functionality / Security
- **Location:** `apps/web/src/pages/POSPage.tsx:616-682`; `apps/api/src/routes/carts.ts:139-181`
- **Problem:** The server accepts `requiresAdminOverride: true` from the client without verifying that the session role is `admin`. Combined with C1 and C8, a below-bottom sale can be recorded without real admin involvement.
- **Recommendation:** Server must assert `session.role === 'admin'` when `requiresAdminOverride` is set, or reject the request and log the attempt.

#### M2. Background sync silently swallows errors and advances cursor on failure

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability / UX
- **Location:** `apps/web/src/lib/background-sync.ts:106-113, 122-130`
- **Problem:** `deltaSyncPull` errors are `console.warn`ed only. The cursor advances to `response.newCursor` even if some rows fail to apply to IDB. A single failing row is permanently skipped.
- **Impact:** Silent divergence between devices; missing cards/transactions locally. Oversold likelihood increases.
- **Recommendation:** Only advance the cursor after all rows succeed. Surface sync failures in the UI (persistent banner or dot). Consider exponential backoff.

#### M3. POS pay failure does not reconcile with server

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** UX / Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:726-747`
- **Problem:** If `api.carts.pay` fails after the server has already committed (e.g., network timeout), the client shows a generic error; the cart remains `draft` locally while cards may be `sold` on the server.
- **Recommendation:** Use `transactionClientId` for idempotent pay. On network failure, query `/transactions?clientId=…` before showing an error. Offer "Check transactions" and "Retry" actions.

#### M4. Cart-sweeper misses orphan locks

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Reliability / PRD invariant #9
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:52-75`
- **Problem:** Sweeper releases cards whose cart is idle *and* still has a `cart_items` row. A crash between `cards.locked_by_cart_id` set and `cart_items` insert leaves an orphan lock that no sweep catches.
- **Recommendation:** Additionally sweep cards with `locked_at < now − ttl*2` that have no matching `cart_items` row or whose `lockedByCartId` points to a non-draft cart.

#### M5. Optimistic UI can desync on IDB write failure after server 200

- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:616-682`
- **Problem:** Server returns 201 then `idb.cartItems.put(newItem)` fires. If IDB fails (storage full, private mode), the cashier thinks the add failed and may re-scan.
- **Recommendation:** Wrap IDB writes in try/catch; on failure, call `opportunisticSync()` and show "Lokal gagal — disinkronkan dari server".

#### M6. `parent_transaction_id` has no foreign-key reference

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Data integrity
- **Location:** `packages/db/src/schema.ts:227`
- **Problem:** `parentTransactionId: text(…)` with no `.references(() => transactions.id)`. A void can reference a non-existent or wrong-event parent.
- **Recommendation:** Add the self-reference. If Drizzle's circular declaration is awkward, use a raw SQL foreign key via `sql`…`check constraint` or defer with `.references(() => transactions.id, { /* deferred */ })`.

#### M7. `payment_channels` PATCH does not bump `updatedAt`; delta sync misses changes

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality / Sync
- **Location:** `apps/api/src/routes/payment-channels.ts:39`; `packages/db/src/schema.ts` (payment channel table)
- **Problem:** `.set(body.data)` does not include `updatedAt: Math.floor(Date.now()/1000)`. Delta sync filters by `updatedAt > cursor`, so channel renames never propagate. (The table also lacks a `version` column for optimistic concurrency.)
- **Recommendation:** Add `updatedAt` on every PATCH (consistent with cards/events/users). Add `version`/`updatedAt` columns to the schema if missing; include the table in delta sync (see H9).

#### M8. Short-ID uniqueness not checked on `POST /cards`

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability / PRD invariant #12
- **Location:** `apps/api/src/routes/cards.ts:41-62` (sync push at `sync.ts:129-137` does check, good)
- **Problem:** The REST create path only checks `clientId` uniqueness. A collision on `shortId` surfaces as a generic 500 via Drizzle's unique-constraint error.
- **Recommendation:** Client: retry short-ID generation up to 5× against local IDB before submit. Server: wrap insert in try/catch for `SQLITE_CONSTRAINT_UNIQUE` and return a typed 409 `{ error: 'duplicate_short_id' }` with the existing card id.

#### M9. `GRADING_COMPANIES` mismatch between client and server

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality
- **Location:** `apps/web/src/pages/IntakePage.tsx:98` (`["PSA","BGS","CGC","ACE","Other"]`) vs `packages/types/src/card.ts:15` (`["PSA","BGS","CGC","SGC","Other"]`)
- **Problem:** The intake form offers `ACE`; the Zod schema rejects it as `SGC` is the fifth value.
- **Recommendation:** Import options from `GradingCompanySchema` rather than hard-coding. Choose `SGC` or `ACE` and align both sides.

#### M10. `UpdateSettingSchema` uses `z.unknown()`; settings route accepts any key

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security / Configuration
- **Location:** `packages/types/src/settings.ts:4`; `apps/api/src/routes/settings.ts:23-51`
- **Problem:** `value: z.unknown()` and no key allowlist. An admin typo (or an authorization mistake — see C1) can persist malformed config that breaks `getCartIdleTtlMinutes()` and other consumers.
- **Recommendation:** Define per-key schemas for the known set (`cart_idle_ttl_minutes: z.number().int().positive().max(1440)`, discount pct fields, etc.) and reject unknown keys.

#### M11. Duplicate `getCartIdleTtl`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Maintainability
- **Location:** `apps/api/src/routes/carts.ts:23-35` and `apps/api/src/jobs/cart-sweeper.ts:10-22`
- **Problem:** Despite the "extract shared util" commit, the cart-idle-TTL helper remains duplicated (slightly different names: `getCartIdleTtl` vs `getCartIdleTtlMinutes`) with identical logic.
- **Recommendation:** Extract to `apps/api/src/utils/settings.ts` and import from both consumers. Add a unit test on the setting fallback.

#### M12. Committed `.env` on disk with real 64-hex `SESSION_SECRET`

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security / Secrets management
- **Location:** `/.env` (gitignored, but present in working tree)
- **Problem:** A 64-char hex session secret sits on any laptop backup, IDE sync, or screenshot. Gitignore prevents pushes but not local exfiltration.
- **Recommendation:** Delete the file; source secrets from a password manager or deploy-time vault; rotate the current secret before the first event.

#### M13. `settings.ts` `JSON.parse` without try/catch

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/settings.ts:18`
- **Problem:** `JSON.parse(row.valueJson)` throws on malformed JSON, collapsing the entire `/settings` list response to a 500.
- **Recommendation:** Wrap per-row; log and skip malformed entries.

#### M14. `.find()` after `.all()` for void-existence check

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Performance / Code quality
- **Location:** `apps/api/src/routes/transactions.ts:128-140`
- **Problem:** `db.select().from(transactions).where(eq(parentTransactionId, parentId)).all().find(t => t.kind === 'void')` does a linear JS scan.
- **Recommendation:** Push the predicate into SQL: `…where(and(eq(parentTransactionId, parentId), eq(kind, 'void'))).get()`.

#### M15. Trigger tests don't exercise the migrated schema

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Testing
- **Location:** `packages/db/src/triggers.test.ts:11-16`
- **Problem:** Opens one in-memory DB, runs `runMigrations(":memory:")` on a *different* DB, then hand-creates tables and triggers on the first DB. A broken migration or a divergent `triggers.sql` can pass the suite.
- **Recommendation:** Run `runMigrations()` against the same in-memory instance used by the tests (adjust `migrate.ts` to accept a DB handle, or point the migration at the same URL). Assert behaviour on the real migrated schema.

#### M16. `test-setup.ts` uses `require()` in an ESM package

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Build / Testing
- **Location:** `packages/db/src/test-setup.ts:6-8`
- **Problem:** `// @ts-ignore` + `require('node:crypto')` in a `"type": "module"` package with `verbatimModuleSyntax: true`.
- **Recommendation:** Replace with `await import('node:crypto')` — same pattern as `apps/api/src/test-setup.ts`.

#### M17. `archiver` declared in `devDependencies` but imported at runtime

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Deploy
- **Location:** `apps/api/package.json`
- **Problem:** `apps/api/src/routes/backup.ts` imports `archiver`; a `pnpm install --prod` deploy will miss it and `/backup` will 500 at runtime.
- **Recommendation:** Move `archiver` to `dependencies`; keep `@types/archiver` in `devDependencies`.

#### M18. `PORT` default mismatch

- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Configuration
- **Location:** `apps/api/src/server.ts:28` (default `3000`) vs `.env.example:6` (`3001`) vs `apps/web/vite.config.ts:42` (proxy → `3001`)
- **Problem:** A fresh checkout without a copied `.env` starts the API on 3000 while the PWA proxy targets 3001; all requests fail with no obvious error.
- **Recommendation:** Pick 3001 everywhere (matches runbook + `.env.example`). Validate `PORT` with Zod at boot.

#### M19. No env-schema validation at boot

- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Configuration
- **Location:** `apps/api/src/server.ts` startup
- **Problem:** Only `SESSION_SECRET` length is checked. `DATABASE_PATH`, `PHOTO_STORAGE_PATH`, `PORT`, `DOMAIN`, `ADMIN_PASSWORD` are not validated. `PHOTO_STORAGE_PATH` is not auto-created.
- **Recommendation:** Adopt `envalid` or a Zod-based `config.ts`. Fail fast with clear messages. Create `PHOTO_STORAGE_PATH` on boot if absent.

---

### Low

#### L1. Inline `genShortId` duplicates `@kolektapos/qr`

- **Severity / Confidence / Effort:** Low / High / S
- **Location:** `apps/web/src/pages/IntakePage.tsx:12-18`; `apps/web/src/pages/BulkImportPage.tsx:41-47`
- **Recommendation:** Import `generateShortId` from `@kolektapos/qr`.

#### L2. README is stale

- **Severity / Confidence / Effort:** Low / High / S
- **Location:** `README.md:23-25` ("Pre-implementation. Monorepo scaffold only; no source code yet.")
- **Recommendation:** Rewrite with verified commands (`pnpm install`, `pnpm dev`, `pnpm test`, `pnpm build`), entrypoints, current feature coverage, and troubleshooting.

#### L3. No `LICENSE` file

- **Severity / Confidence / Effort:** Low / High / S
- **Recommendation:** Add an explicit `LICENSE` (even `UNLICENSED` / proprietary) and populate the `license` field in `package.json` files.

#### L4. No `/health` endpoint

- **Severity / Confidence / Effort:** Low / High / S
- **Recommendation:** `GET /health` that runs `SELECT 1` and returns `{ ok, dbSize, uptime, activeCarts }`.

#### L5. `useAuthStore` has no `/me` bootstrap on reload

- **Severity / Confidence / Effort:** Low / Medium / S
- **Location:** `apps/web/src/store/auth.ts`
- **Problem:** Auth state persists to localStorage; if the server session expires, the user sees protected UI shells until 401s start cascading.
- **Recommendation:** Call `api.auth.me()` on app mount; clear auth state on 401.

#### L6. Login endpoint has a user-enumeration timing gap

- **Severity / Confidence / Effort:** Low / Medium / S
- **Location:** `apps/api/src/routes/auth.ts:28-45`
- **Problem:** Unknown email returns 401 before bcrypt runs; known email runs bcrypt (~100 ms). Timing difference reveals whether an email exists.
- **Recommendation:** On user-not-found, run a dummy `bcrypt.compare()` against a static known-bad hash to equalize timing.

#### L7. `audit_log` has no retention or size cap

- **Severity / Confidence / Effort:** Low / High / S
- **Location:** `packages/db/src/schema.ts:298-313`
- **Recommendation:** Nightly archive/prune — keep 90 days hot, export older rows as monthly JSONL.

#### L8. `xlsx` and `uuid` bloat the web bundle

- **Severity / Confidence / Effort:** Low / Medium / M
- **Location:** `apps/web/package.json`; `POSPage.tsx`, `IntakePage.tsx`, `BulkImportPage.tsx`
- **Problem:** `xlsx` (~2 MB) is eagerly loaded but used only for bulk import. `uuid` is unnecessary since `crypto.randomUUID()` is available in all target runtimes. Verified build emits a ~1.35 MB main JS asset with a Vite chunk-size warning.
- **Recommendation:** Dynamic `import('xlsx')` inside the bulk-import handler; replace `uuid` with `crypto.randomUUID()`. Code-split admin/reports/bulk-import pages.

#### L9. `packages/ui` is empty

- **Severity / Confidence / Effort:** Low / High / S
- **Recommendation:** Either populate with shared shadcn/ui components (migrate `MobileAppBar`, `MaskedAmount`, `StatusBadge`) or remove the package from the workspace until needed.

#### L10. `turbo run lint` is a no-op

- **Severity / Confidence / Effort:** Low / High / S
- **Recommendation:** Add ESLint (`@typescript-eslint`) + Prettier; define `lint` scripts in every workspace package.

#### L11. Receipt printing uses `document.write`

- **Severity / Confidence / Effort:** Low / High / S
- **Location:** `apps/web/src/pages/POSPage.tsx:351-381`
- **Recommendation:** Use `Blob` + `URL.createObjectURL` or an iframe.

#### L12. `CameraScanner` module-level counter is HMR-unsafe

- **Severity / Confidence / Effort:** Low / Medium / S
- **Location:** `apps/web/src/components/CameraScanner.tsx:12`
- **Recommendation:** Use React 19 `useId()`.

#### L13. Login page label "Email address" remains English

- **Severity / Confidence / Effort:** Low / High / S
- **Location:** `apps/web/src/pages/LoginPage.tsx`
- **Recommendation:** Localize to Bahasa Indonesia for consistency with the rest of the cashier UI.

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

**Strengths**
- Invariants called out inline with PRD section references (`packages/db/src/schema.ts:114, 214, 263`).
- Clean monorepo boundaries; Zod validation on most POST/PATCH bodies.
- Append-only transaction design enforced at both ORM and DB-trigger layers.
- Optimistic concurrency (`version` field) on mutable entities.
- Idempotent operations via `client_id` on cards/carts/transactions.
- Owner snapshot (`ownerUserIdSnapshot`) correctly used as the settlement basis.
- `db.transaction()` wraps multi-table mutations in carts, transactions, and the sweeper.

**Issues**
- C5 broken oversold void, C6 inverted reveal, C8 missing fixed-price floor, H1 double-negated settlement math, H2 inverted net math, H5 oversold void reopens cards.
- Duplicate utilities (`getCartIdleTtl`, `genShortId`), GRADING_COMPANIES mismatch, `.find()`-after-`.all()` patterns.

**Recommendations**
- Every route must go through a Zod schema from `packages/types`; treat unvalidated handlers as a lint error.
- Centralize money-sign convention and timestamp units in helpers; document in CLAUDE.md.

### 2) Testing

**Strengths**
- 33 passing tests across 6 files: append-only triggers (most load-bearing invariant), QR/short-ID format, card Zod schemas, sync protocol types, auth happy/unhappy paths, `MaskedAmount`, `useTapHoldReveal` (pins current behaviour — which is the bug).

**Issues**
- No tests for: cart create/add/remove/pay/abandon, transaction void/refund, `/sync/push`, `/sync/pull`, cart sweeper cron, oversold flow, settlement math, backup, holds, authorization boundaries, bulk import.
- The trigger test exercises hand-rolled schema instead of the migrated one (M15).
- Auth tests share state (no per-test isolation).

**Recommendations**
- Build a reusable Fastify + in-memory SQLite + migrations harness; reuse across all route tests (only auth has it today).
- Prioritize: (a) `/carts/:id/pay` happy path + below-bottom reject, (b) void/refund authz + sign math with a settlement assertion, (c) oversold resolution flow, (d) `/sync/push` validation.
- Property-test settlement math (`fast-check`) across randomized sale/void/refund sequences.
- One Playwright E2E for the POS happy path + offline-then-sync.

### 3) Security

**Strengths**
- bcryptjs cost 12 for user-created passwords.
- Session cookies `httpOnly`, `secure` in prod, 30-day rolling.
- `SESSION_SECRET` length validated at startup.
- Append-only triggers cannot be bypassed via ORM.

**Issues**
- Critical: C1 authz, C2 passwordHash leak, C3 unvalidated push, C7 SHA-256 seed.
- High: H4 no CORS/Helmet/CSRF/rate-limit, H11 unredacted audit, H10 login unthrottled.
- Medium: M1 `requiresAdminOverride` not re-checked, M10 unvalidated settings, M12 `.env` on disk, L6 timing leak.

**Recommendations**
- Minimum perimeter: helmet (defaults), strict CORS (single domain), rate-limit (20/min on `/auth/*`, 200/min global), `sameSite: strict`, Zod on every endpoint, redacted audit.
- Treat the `passwordHash` field as never-serializable — wrap `users` in a mapper that always strips it.

### 4) Performance & Scalability

**Strengths**
- SQLite WAL mode + foreign_keys ON.
- Indexed hot paths (`cards.shortId`, `cards.clientId`, `transactions.clientId`, `ti_card_idx`, `ti_owner_snapshot_idx`).
- Dexie `bulkPut` for batch sync operations.
- Denormalized card locks avoid joins on scan.

**Issues**
- H7 unbounded `.all()` queries; H8 single-shot initial sync dump; H1/H2-adjacent in-JS aggregations; L8 bundle bloat.

**Recommendations**
- Paginate all list endpoints; push filters and aggregation into SQL. Measure response sizes at 10× projected data and codify perf budgets.

### 5) Reliability & Stability

**Strengths**
- Append-only triggers, `client_id` idempotency, `version` optimistic concurrency, wrapped `db.transaction()` blocks, cart sweeper with TTL cleanup, best-effort offline paths in POS.

**Issues**
- H3 unsafe backup, C4 not offline-first, C9 timestamp drift, H5 oversold reopen, H6 settled events unlocked, H12 no graceful shutdown, M2 cursor-on-failure, M3 pay-failure ambiguity, M4 orphan locks.

**Recommendations**
- Nightly integrity check: compare `count(cards.status='sold')` to `count(distinct transaction_items.cardId WHERE sign=sold)`; alert on drift.

### 6) Observability

**Strengths**
- Fastify pino logger enabled; audit log table exists; sweeper logs sweep results.

**Issues**
- `console.log` in sweeper; `catch {}` in audit; no structured business events (`sale_completed`, `oversold_detected`, `cart_abandoned_by_sweeper`); no request correlation IDs; no `/health`; no metrics.

**Recommendations**
- Use `request.log.info({ event, ... })` for business events. Surface sync failures in the UI. Expose `/health` with `{ ok, dbSize, uptime, activeCarts }`.

### 7) Deployment & DevOps (Local-first)

**Strengths**
- `pnpm dev`/`test`/`build`/`typecheck` work out of the box (verified). Turbo pipeline is correct. Runbook (`docs/03-runbook.md`) is thorough. `.nvmrc` pins Node 22. `better-sqlite3` and `esbuild` are in `onlyBuiltDependencies`.

**Issues**
- L10 no lint, M17 `archiver` misdeclared, M18 PORT mismatch, no auto-creation of `storage/` dirs, README stale, no production serve config for the PWA.

**Recommendations**
- `pnpm setup` script: copy `.env.example` → `.env`, create `storage/photos`, run migrations. Add shared ESLint + Prettier. Document production build + reverse-proxy setup.

### 8) Configuration & Environment Management

**Strengths**
- `.env.example` present and minimal. `SESSION_SECRET` length check at boot.

**Issues**
- M12 `.env` on disk, M18 PORT mismatch, M19 no env schema, M10 unvalidated settings, C7 weak bootstrap defaults.

**Recommendations**
- `envalid` or Zod at boot. Typed schemas per setting key. Require explicit bootstrap credentials (fail startup in non-test if missing).

### 9) User Experience (UX)

**Strengths**
- Mobile-first Bahasa Indonesia cashier UI, large scan input (HID + camera), quick tender amounts, change calculation, receipt modal, masked amounts with eye-icon toggle, status badges, sheet-style modals from bottom.

**Issues**
- C6 inverted reveal, C5 broken oversold resolution, M2/M3 silent sync / ambiguous pay failure, L13 English login label, no prominent online/offline banner, `err.message` leaks from Zod flatten into user-facing errors.

**Recommendations**
- Persistent online/offline dot in the `MobileAppBar`. Localize all UI text. User-friendly error map for known server error codes. Add empty-state guidance when no active event.

### 10) Compliance & Legal

**Strengths**
- No customer-side PII captured; payment-channel labels only.

**Issues**
- L3 no LICENSE, L7 unbounded audit retention + potential PII in payloads, no documented data-retention / owner-removal policy.

**Recommendations**
- Add LICENSE. Document retention + owner-removal procedure in the runbook. Redact email addresses from audit payloads.

### 11) Documentation & Knowledge Sharing

**Strengths**
- Excellent PRD, implementation plan, runbook, per-milestone notes, CLAUDE.md invariants. Inline comments reference PRD sections.

**Issues**
- README stale (L2). No CONTRIBUTING, no ADRs for design decisions (bcrypt cost, session duration, Drizzle choice, oversold policy).

**Recommendations**
- Rewrite README with current status + verified commands. Add `docs/adr/` for key decisions. Short CONTRIBUTING.md: read CLAUDE.md → pick a milestone → green tests → PR.

---

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

| # | Item | Effort |
|---|------|--------|
| 1 | Enforce object-level authz on cards PATCH, cart mutations, hold release, and void/refund (C1). | M |
| 2 | Stop serializing `passwordHash` anywhere outside `/auth/*`; add a DTO projection for `/sync/pull` and `/users` (C2). | S |
| 3 | Zod-validate every `/sync/push` op, strip server-owned fields, add missing op handlers for cart/item/hold (C3). | M |
| 4 | Fix `OversoldQueuePage` to resolve and void the correct sale-kind transaction (C5). | S |
| 5 | Invert `useTapHoldReveal` + fix its unit test to assert the corrected behaviour (C6). | S |
| 6 | Remove the `sha256:` branch from `auth.ts`; require `ADMIN_PASSWORD`; bcrypt-hash in the seed (C7). | S |
| 7 | Enforce `intendedPriceIdr >= card.priceIdr` for fixed cards server-side (C8). | S |
| 8 | Change `POSPage.tsx:609,665` to seconds (C9); introduce a single `nowSec()` helper. | S |
| 9 | Fix settlement per-owner math (H1) and Dashboard/Reports net math (H2). | S |
| 10 | Replace backup stream with `sqlite.backup()`/`VACUUM INTO` + WAL checkpoint (H3). | M |
| 11 | Register `@fastify/helmet`, strict `@fastify/cors`, `@fastify/rate-limit` on `/auth/*`; tighten cookie `sameSite: strict` (H4, H10). | S |
| 12 | Remove the committed `.env`; rotate `SESSION_SECRET` (M12). | S |
| 13 | Align `PORT` default to 3001 across server/vite/env (M18). | S |
| 14 | Redact `password*`/`session`/`token` from audit payloads; stop swallowing audit insert errors (H11). | S |
| 15 | Move `archiver` from `devDependencies` to `dependencies` (M17). | S |

### Phase 2: Short-term improvements (1–2 weeks)

| # | Item | Effort |
|---|------|--------|
| 1 | Implement offline-first write queue and complete `/sync/push` processing for carts/items/holds/photos (C4, partial H13). | L |
| 2 | Split cashier bootstrap onto `/sync/bootstrap` (H14). | M |
| 3 | Fix oversold void-vs-remaining-sale logic (H5). | S |
| 4 | Lock settled events against further carts/pays/voids (H6). | S |
| 5 | Paginate all list endpoints; push filters and aggregations into SQL; page the initial sync dump (H7, H8). | M |
| 6 | Include `settings`, `payment_channels`, `transaction_items`, `holds`, `cash_reconciliations` in delta sync; add `updatedAt`/`version` to `payment_channels` (H9, M7). | M |
| 7 | Implement or remove photo upload stub (H13). | M |
| 8 | Add graceful shutdown (H12). | S |
| 9 | Build a Fastify + in-memory SQLite test harness; add integration tests for cart pay, void/refund (authz + sign math), oversold flow, `/sync/push` (M15 + Phase 1 regressions). | L |
| 10 | Add `/health`, structured pino business events (H11 adjacent). | M |
| 11 | Env schema validation at boot (`envalid`/Zod); auto-create `storage/` dirs (M19). | S |
| 12 | Tighten `UpdateSettingSchema` to per-key schemas (M10). | S |
| 13 | Short-ID retry + typed 409 (M8). Align GRADING_COMPANIES (M9). Migrate `test-setup.ts` to `await import()` (M16). | S |
| 14 | Persistent online/offline indicator; surface sync failures (M2). Idempotent pay reconcile on timeout (M3). | M |
| 15 | Update README; add LICENSE (L2, L3). | S |

### Phase 3: Longer-term refactors (2–6 weeks)

| # | Item | Effort |
|---|------|--------|
| 1 | Playwright E2E for cashier happy-path + offline-then-sync. | L |
| 2 | Property-test settlement math across randomized sale/void/refund sequences. | M |
| 3 | Add ESLint + Prettier; wire into Turbo; package-level `lint` scripts (L10). | S |
| 4 | Rework audit plugin: structured events to pino + pruned audit table with retention (H11, L7). | M |
| 5 | Add ADRs for bcrypt cost, session duration, sync-cursor choice, oversold policy. | M |
| 6 | Code-split admin/reports/bulk-import flows; lazy-load `xlsx`; drop `uuid` for `crypto.randomUUID()` (L8). | M |
| 7 | Populate `packages/ui` with shared shadcn/ui components, or remove the package (L9). | M |
| 8 | Nightly integrity check comparing `cards.status='sold'` count vs distinct `transaction_items.card_id` sold count. | S |

---

## Appendix

### How to run/build/test locally (verified)

```bash
# Prereqs: Node >= 22, pnpm >= 10 (see .nvmrc)
pnpm install

cp .env.example .env
# Fill SESSION_SECRET (>= 32 chars), ADMIN_EMAIL, ADMIN_PASSWORD.
mkdir -p apps/api/storage/photos

# Migrations run automatically on server boot; manual trigger:
pnpm --filter @kolektapos/db exec tsx src/migrate.ts
pnpm --filter @kolektapos/db exec tsx src/seed.ts

# Dev (web on 5173 via vite, api on 3001; web proxies /api → 3001)
pnpm dev

# Tests, typecheck, build
pnpm test
pnpm typecheck
pnpm build

# Per-package
pnpm --filter @kolektapos/api dev
pnpm --filter @kolektapos/web dev
```

Verified against `262c07e` on branch `feat/complete-mvp`: `pnpm test`, `pnpm build`, `pnpm typecheck` all pass. Full API+PWA browser-driven happy-path was not executed end-to-end; UI-behaviour findings are based on static review of the code.

### Notable files reviewed

- Schema & migrations: `packages/db/src/schema.ts`, `packages/db/src/triggers.sql`, `packages/db/src/migrate.ts`, `packages/db/src/seed.ts`, `packages/db/src/triggers.test.ts`, `packages/db/src/test-setup.ts`
- API server + plugins: `apps/api/src/server.ts`, `apps/api/src/plugins/session.ts`, `apps/api/src/plugins/auth-guard.ts`, `apps/api/src/plugins/audit.ts`
- API routes: `apps/api/src/routes/auth.ts`, `carts.ts`, `transactions.ts`, `cards.ts`, `sync.ts`, `settlement.ts`, `backup.ts`, `holds.ts`, `overrides.ts`, `settings.ts`, `users.ts`, `events.ts`, `payment-channels.ts`, `audit-log.ts`
- Jobs: `apps/api/src/jobs/cart-sweeper.ts`
- Web shell: `apps/web/src/App.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/db.ts`, `apps/web/src/lib/sync.ts`, `apps/web/src/lib/background-sync.ts`, `apps/web/src/store/auth.ts`, `apps/web/src/store/pos.ts`
- Web pages: `apps/web/src/pages/POSPage.tsx`, `IntakePage.tsx`, `OversoldQueuePage.tsx`, `LoginPage.tsx`, `ReportsPage.tsx`, `DashboardPage.tsx`, `InventoryPage.tsx`, `BulkImportPage.tsx`, `AdminPage.tsx`, `UsersAdminPage.tsx`
- UI primitives / hooks: `apps/web/src/components/MaskedAmount.tsx`, `CameraScanner.tsx`, `MobileAppBar.tsx`; `apps/web/src/hooks/useTapHoldReveal.ts`
- Shared packages: `packages/qr/src/index.ts`, `packages/sync/src/protocol.ts`, `packages/sync/src/conflict.ts`, `packages/types/src/card.ts`, `cart.ts`, `transaction.ts`, `settings.ts`
- Config: `package.json`, `apps/api/package.json`, `apps/web/package.json`, `turbo.json`, `.env.example`, `apps/web/vite.config.ts`

### Dependency notes

- Server: Fastify 5, better-sqlite3 11, Drizzle 0.38, bcryptjs 3, node-cron 3, archiver 7 (misdeclared — M17), zod 3.24.
- Client: React 19, Vite 6, vite-plugin-pwa 0.21, Dexie 4, TanStack Query 5, Zustand 5, react-router 7, html5-qrcode 2, lucide-react, `xlsx` 0.18, `uuid` 11.
- No high-CVE dependencies spotted; schedule a recurring `pnpm audit`.
- `bcryptjs` is JS-only (deploy-friendly). `better-sqlite3` is native and correctly listed in `pnpm.onlyBuiltDependencies`.
- Missing (recommended for Phase 1): `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/multipart` (for H13), optional `envalid`.
