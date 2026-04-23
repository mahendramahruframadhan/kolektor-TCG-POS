# Code Review Report – KolektaPOS

**Date:** 2026-04-24
**Reviewer:** Claude Code (Opus 4.7)
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `262c07eb9da59f6bbd8b0ab53a4743c339acbfd4` — "Simplify: remove dead code, extract shared util, fix perf issues" on branch `feat/complete-mvp`.

---

## Executive Summary

KolektaPOS is a well-scoped, local-first single-booth POS whose implementation tracks the PRD closely. The data layer is disciplined: integer IDR throughout, SQL-level append-only triggers on `transactions`/`transaction_items`/`audit_log`, owner snapshotting on transaction items, `client_id` idempotency, denormalized card locking, optimistic concurrency via `version`. The vertical POS slice works end-to-end (scan → review → cart → pay → receipt) with offline-first IndexedDB semantics, and a functional cart-sweeper + hold-expiry cron. Tests are green (24 tests across 6 files) and cover the non-negotiable invariants (append-only triggers, snapshot settlement math).

That said, several serious defects undermine the invariants or production-readiness of the system: the tap-and-hold bottom-price reveal is inverted (reveals immediately, masks after 5s — opposite of PRD §9.1); the `OversoldQueuePage` passes a **card.id** where a **transaction.id** is required, so admins cannot actually void oversold sales; server-side floor-price enforcement for **fixed-price** cards is missing (only discount-percentage limit is checked); the `/sync/push` handler blind-spreads client-supplied payloads into INSERT without Zod validation; there is no CORS/Helmet/CSRF/rate-limiting on the API; the audit plugin runs DB writes inside `onSend` without awaiting and with zero redaction of potentially sensitive payloads; and only a small fraction of the 11 route files has automated tests. None of these are hard to fix, but several block a safe first event.

### Top 5 Risks

- **Critical** — `OversoldQueuePage.handleVoid` calls `api.transactions.void(card.id, …)` with a card UUID instead of a transaction UUID. Oversold workflow is broken — admins cannot resolve oversold residuals, which is the whole point of accepting R5. (`apps/web/src/pages/OversoldQueuePage.tsx:104`)
- **Critical** — Inverted tap-and-hold reveal. PRD §9.1 requires tap-and-hold **5s to reveal**; implementation reveals on press and hides on release/timer. Bottom prices are visible to anyone who briefly taps the control. (`apps/web/src/hooks/useTapHoldReveal.ts:10-27`)
- **Critical** — Fixed-price floor enforcement missing on server. The server rejects excess **discount percentage** on fixed cards but never blocks `intendedPriceIdr < priceIdr` directly, so a malformed or malicious client can submit an arbitrary sold price under fixed pricing. The cart flow goes through validated `lineDiscountIdr`, but `/sync/push create_transaction` has no validation at all. (`apps/api/src/routes/carts.ts:142-172`, `apps/api/src/routes/sync.ts:116-170`)
- **High** — `/sync/push` spreads unknown payload directly into Drizzle INSERT with no Zod parsing. `{ id, clientId, ...op.payload }` can write any column (including `oversold=false`, inconsistent `eventId`, client-forged `createdAt`). Breaks invariant #7 (server-authoritative) and is a privilege-escalation-adjacent vector. (`apps/api/src/routes/sync.ts:140, 156`)
- **High** — No CORS, no Helmet, no CSRF token, no rate limit, cookies `sameSite: lax` only. A malicious page could POST `/auth/login` or other mutating routes against an admin's logged-in session. Running on the same domain as the PWA reduces CSRF exposure, but `sameSite: lax` still allows top-level `POST` via form submission. (`apps/api/src/plugins/session.ts:5-22`)

### Quick Wins

- Remove the committed `.env` from disk (gitignored but still on the reviewer's filesystem and likely on the maintainer's) and rotate the `SESSION_SECRET` before production. File currently contains a real 64-hex secret.
- Fix `OversoldQueuePage` to look up the latest `sale` transaction for the card and void that transaction id.
- Invert `useTapHoldReveal` to only set `revealed=true` after `holdMs` has elapsed with pointer still pressed.
- Add Zod schemas for `/sync/push` ops and reject unknown keys in payload.
- Replace `archive.finalize(); return reply.send(archive)` with `reply.send(archive); archive.finalize()` (or `reply.type().send(archive)`) — currently the response may beat finalize() or lose backpressure.
- Add `@fastify/helmet`, `@fastify/cors` (strict), and `@fastify/rate-limit` on auth routes. Tighten cookie to `sameSite: strict` (single-domain deployment, no cross-site flows needed).
- Paginate `/transactions`, `/cards`, `/audit-log`, settlement item lookups (all currently `.all()` with no `LIMIT`).
- Make the audit `onSend` hook async-aware and redact request bodies for `/auth/*` and `/users` POST/PATCH.

---

## Scorecard (0–10)

| Category | Score | Justification |
|----------|-------|---------------|
| Functionality & Code Quality | 7/10 | POS happy-path, cart-locking, void/refund, settlement snapshot math all work. Several bugs (oversold void, inverted reveal), duplicated inline short-id gen, `.all()` everywhere. |
| Testing | 4/10 | 24 tests, green, covering critical triggers and auth smoke. ~11 of 14 API routes have no route-level tests. No end-to-end test for pay flow, no sync tests, no oversold flow test, no cart-sweeper test. |
| Security | 4/10 | Sessions + bcrypt are fine. No CORS/Helmet/CSRF/rate-limit. `/sync/push` ingests unvalidated payloads. `sha256:` seed path is a foot-gun left in production code. No input-size limits on body. |
| Performance & Scalability | 6/10 | SQLite + WAL, indexes on hot paths, synchronous better-sqlite3 is fine at this scale. But unbounded `.all()` queries, `/reports/monthly` loads every transaction ever, `/sync/pull` full re-scans across 5 tables on cursor=0. Fine for 11 users / one booth, bad if scope grows. |
| Reliability & Stability | 6/10 | Append-only triggers enforced. Idempotency on carts/transactions via `clientId`. Optimistic version checks on cards/events. But `/sync/push` has no transaction wrapping the multi-op batch, cart-sweeper logs to console not a structured logger, uncaught errors in onSend are swallowed. |
| Observability | 3/10 | `fastify({ logger: true })` — default pino, no redaction, no request-id propagation, no structured business events. `console.log` in cart-sweeper. No health endpoint, no metrics, no sync-health dashboard. |
| Local Deployment & DevOps | 7/10 | Turbo + pnpm workspace boots cleanly; `pnpm test` runs green end-to-end. Missing: `pnpm dev` doesn't create the DB/photos dirs, runbook is thorough. No lint task (`turbo run lint` has no package-level scripts). |
| Configuration & Environment | 6/10 | `.env.example` present and minimal. Dotenv is loaded in two speculative paths (workspace root, app root). `PORT` default mismatch (`3000` vs `.env.example` `3001`). No schema validation of env vars at boot. |
| UX | 7/10 | Bahasa Indonesia cashier UI, large scan input, quick-amount tender buttons, receipt modal, status badges are on-point. Mobile-first layout, PWA manifest. Two bugs (inverted reveal, broken oversold void) are UX-critical. |
| Compliance & Legal | 7/10 | No PII beyond display-name/email. IDR amounts have no tax export (dropped per PRD). Receipt includes no VAT line — fine for scope. No license file in the repo. No data-retention policy documented for `audit_log` (unbounded growth risk). |
| Documentation & Knowledge Sharing | 8/10 | Excellent PRD, implementation plan, runbook, per-milestone progress notes, CLAUDE.md invariants. README is thin but adequate. Inline code comments reference PRD sections directly — great. |
| **Average** | **5.9/10** | |

---

## Architecture Snapshot

- **Monorepo** (Turbo + pnpm 10, Node 22+): `apps/{web,api}` + `packages/{db,types,sync,qr,ui}`.
- **Server** (`apps/api`): Fastify 5 + better-sqlite3 11 via Drizzle 0.38. Plugins: `@fastify/session` + `@fastify/cookie`, custom audit `onSend` hook. Background job: `node-cron` sweeper every 5 min.
- **Client** (`apps/web`): React 19 + Vite 6 + vite-plugin-pwa (Workbox NetworkFirst for `/api/`). Dexie 4 as IndexedDB driver. TanStack Query v5 + Zustand 5 for auth/POS UI state. Routing with react-router 7.
- **Sync**: cursor-based delta pull (`updatedAt` / `createdAt` > cursor), op-list push with per-op accept/reject. `client_id` UUID dedupes. Foreground polling every 60s + opportunistic trigger.
- **Data model** (§6 of PRD):
  - `transactions` / `transaction_items`: append-only (DB triggers enforce).
  - `cards`: denormalized `locked_by_cart_id`/`locked_by_user_id`/`locked_at` for fast scan.
  - `transaction_items.owner_user_id_snapshot`: the **only** field used for settlement.
  - `settings` JSON rows for `cart_idle_ttl_minutes`, `max_line_discount_pct_fixed`, `max_transaction_discount_pct`.
- **Auth**: bcrypt 12 rounds (cost) for production users; `sha256:` prefix fallback for seed-only admin. 30-day rolling session cookie.

Key data flow (happy path): scan → lookup card in IDB → optimistic `lockCard()` + `/carts/:id/items` POST (server validates floor + sets lock) → review/remove → `/carts/:id/pay` POST (server opens txn, INSERTs transaction + items atomically, sets `cards.status='sold'`, releases locks) → receipt modal → `idb` updates. Offline path identical except no server round-trip; relies on `/sync/push` at reconnect, which currently has gaps (see Findings).

---

## Findings (Prioritized)

### Critical

#### Broken oversold void workflow

- **Title:** `OversoldQueuePage` voids a non-existent transaction whose id is a card id
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Functionality / Reliability
- **Location:** `apps/web/src/pages/OversoldQueuePage.tsx:104`
- **Problem:** `onClick={() => handleVoid(card.id, voidReason)}` passes a **card UUID** into `api.transactions.void(transactionId, …)`. There is no transaction with that id, so `POST /transactions/:id/void` returns 404 "Parent transaction not found".
- **Impact:** The admin queue that is the designated resolution path for R5 (oversold, the *only* accepted residual risk in the PRD) is non-functional. Oversolds accumulate unresolved. Cash reconciliation at event-end cannot proceed correctly.
- **Recommendation:** Lookup all `transaction_items` where `cardId === card.id AND kind==='sale'`, present a picker if there are multiple (the whole point of oversold is ≥2 sales), and void the chosen transaction. Indexed on `ti_card_idx`, fast.
- **Notes / Example Fix:**
  ```ts
  const saleItems = await idb.transactionItems
    .where("cardId").equals(card.id).toArray();
  const saleTxs = await idb.transactions.bulkGet(
    saleItems.map(i => i.transactionId)
  );
  // show all saleTxs with kind==='sale' and no corresponding void, let admin pick
  ```

#### Inverted tap-and-hold bottom-price reveal

- **Title:** Bottom price reveals on tap, not on hold
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Security / UX / Compliance with PRD §9.1 & invariant 6
- **Location:** `apps/web/src/hooks/useTapHoldReveal.ts:10-27`; consumers: `apps/web/src/pages/POSPage.tsx:63-87`
- **Problem:** `startReveal` sets `revealed=true` **immediately** on pointer-down and schedules `revealed=false` after `holdMs`. The 5-second hold is a hide-timer, not a reveal-gate. A casual tap (< 300 ms) also toggles off — but within that 300 ms the price is fully on-screen.
- **Impact:** Bottom prices are trivially leaked to a customer peering at the screen — violates non-negotiable invariant #6 ("Bottom prices are never rendered by default. Tap-and-hold 5s reveal, auto-hide.").
- **Recommendation:** Only set `revealed=true` when the pointer has been held for `holdMs`. On release before timer fires → never reveal. On release after reveal → start auto-hide countdown (e.g. 3 s). Update the unit test to pin this behaviour.
- **Notes / Example Fix:**
  ```ts
  const startReveal = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRevealed(true);
      // schedule auto-hide
      timerRef.current = setTimeout(() => setRevealed(false), AUTOHIDE_MS);
    }, holdMs);
  }, [holdMs]);
  const endReveal = useCallback(() => {
    if (timerRef.current && !revealed) clearTimeout(timerRef.current);
  }, [revealed]);
  ```

#### Fixed-price floor not enforced on server

- **Title:** Server accepts arbitrary `intendedPriceIdr` for fixed-price cards
- **Severity / Confidence / Effort:** Critical / High / S
- **Category:** Reliability / Invariant #4 (hard floor)
- **Location:** `apps/api/src/routes/carts.ts:142-172`
- **Problem:** For `pricingMode === "fixed"`, server only checks `lineDiscountPct > max_line_discount_pct_fixed`. It never compares `intendedPriceIdr` against `card.priceIdr`. A client that sends `intendedPriceIdr: 1, lineDiscountIdr: 0` passes validation (pct = 0). The happy-path UI happens to set `intendedPriceIdr = scannedCard.priceIdr` for fixed cards, so normal usage is safe, but the invariant is not enforced.
- **Impact:** Any client bug (future branch, mis-typed form, a second device) or forged request can sell a fixed card below its listed price with no admin override. Violates invariant #4.
- **Recommendation:** For fixed cards, also reject `intendedPriceIdr < card.priceIdr` unless `requiresAdminOverride`. Log the attempt with a structured event.

#### `/sync/push` spreads unvalidated client payload into DB

- **Title:** Sync push has no Zod parse and trusts client-supplied columns
- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security / Reliability / Invariant #7 (server-authoritative)
- **Location:** `apps/api/src/routes/sync.ts:116-170`
- **Problem:** `db.insert(cards).values({ id, clientId, ...(op.payload as …) })` passes whatever the client sent. `oversold`, `eventId`, `ownerUserId`, `status='sold'`, `lockedByCartId`, and `createdAt` can all be forged. Same for `create_transaction` — `cashierUserId`, `totalIdr`, `paidAt` all accepted verbatim. The request body isn't Zod-parsed at all.
- **Impact:** A compromised or buggy client can write poisoned rows (e.g. mark cards oversold, backdate transactions, attribute sales to other owners). Settlement math is derived from `owner_user_id_snapshot` — if that is forged, payout is wrong.
- **Recommendation:** Wrap each op.type in a Zod schema (use `packages/types` CreateCardSchema etc.). For server-owned fields (`cashierUserId` from session, `serverReceivedAt` from `Date.now()`), strip them from the payload before merging. Reject unknown keys with `.strict()`.

### High

#### No CORS / Helmet / CSRF / rate limit

- **Title:** API has no perimeter security headers or rate limiting
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `apps/api/src/server.ts`, `apps/api/src/plugins/session.ts:5-22`
- **Problem:** No `@fastify/helmet`, `@fastify/cors`, `@fastify/csrf-protection`, or `@fastify/rate-limit` registered. Cookie `sameSite: "lax"` still permits top-level navigations (form POSTs) to execute with credentials. Login endpoint has no throttle.
- **Impact:** A malicious page can brute-force passwords over the public endpoint, or craft a top-level POST that submits with the admin's session cookie. Because the system runs on a single domain with no cross-site needs, lax is unnecessarily permissive.
- **Recommendation:** Register helmet (default headers), rate-limit (e.g. 20/min on `/auth/*`), strict CORS (reject everything except same-origin). Set `sameSite: "strict"` since PWA + API share a domain by design (PRD §10). Add a CSRF token on mutating requests if any third-party origins must be allowed.

#### Audit hook swallows errors and never redacts

- **Title:** `auditPlugin` writes unredacted payloads synchronously during `onSend`, errors silenced
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security / Observability / Privacy
- **Location:** `apps/api/src/plugins/audit.ts:11-41`
- **Problem:** `onSend` handler writes `payload.slice(0, 2000)` into `audit_log.diff_json`. Login responses, `/auth/change-password` (no password hash is returned, but new session state is), `/users` POST with password echoes… all funneled into the audit log. `catch {}` silently eats DB errors; race between finalize and `onSend` is masked. `entityType`/`entityId` are derived from URL path with no allowlist (`/auth/login` → entityType=`auth`, entityId=`login`).
- **Impact:** (a) potential PII/secret leak into plaintext audit rows, (b) audit gaps are invisible, (c) audit log grows unbounded with large payloads.
- **Recommendation:** Explicitly list auditable routes and what to log. Redact `password`, `passwordHash`, `newPassword`, `currentPassword` fields. Log `userId`, `method`, `path`, `entityType`, `status`, timestamp — not raw body. Emit a structured log line (not console) on audit-insert failure.

#### `/sync/pull` initial dump is heavy and not paginated

- **Title:** Initial sync loads all events, users, cards, 30-day tx items into one response
- **Severity / Confidence / Effort:** High / Medium / M
- **Category:** Performance / Scalability
- **Location:** `apps/api/src/routes/sync.ts:42-80`
- **Problem:** Cursor=0 returns every user row, every event row (no filter despite the comment "active + last 2 closed"), every payment channel, every setting, every card (comment says non-retired, code says `status === 'sold'` then immediately overwrites with `allCards`), all transactions in last 30 days and all their items. `hasMore: false` always. Response size grows linearly with inventory.
- **Impact:** After a few events, initial pull becomes multi-MB. Parsing + IDB writes block the PWA startup. Mobile devices on poor convention hall Wi-Fi may time out.
- **Recommendation:** Paginate by entity type and by chunks of 500 rows with `hasMore`. Honour the comment: filter events to active + last 2 closed. Return tx items only for included txs. Consider gzip at Fastify level.

#### Unbounded list queries throughout API

- **Title:** Many `GET` routes `.all()` with no LIMIT/offset
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Performance / Reliability
- **Location:** `apps/api/src/routes/cards.ts:16`, `transactions.ts:31`, `routes/settlement.ts:35,175`, `audit-log.ts:19` (capped 500 — OK), `holds.ts:102`, `events.ts:15`, `users.ts:17`, `payment-channels.ts:18`, `settings.ts:15`
- **Problem:** `/cards`, `/transactions`, `/events`, `/holds/active`, `/cash-reconciliations`, monthly report, settlement all load every row.
- **Impact:** Monthly report scans every transaction ever (fine at 11 users and 1000 tx/event; bad at 50k). `/cards` with inventory of a few thousand will choke mobile memory.
- **Recommendation:** Add `LIMIT` + `OFFSET`/`cursor` params and index on `createdAt`. For monthly report, filter in SQL (`WHERE paid_at >= ? AND paid_at < ?`) instead of `allTxs.filter(...)`.

#### `/backup` streaming may race finalize with response flush

- **Title:** Backup zip archive uses unconventional stream-send that can truncate
- **Severity / Confidence / Effort:** High / Medium / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/backup.ts:27-38`
- **Problem:** Pattern `archive.finalize(); return reply.send(archive);` is backwards — finalize() fires before the archive stream is piped into the response. Backpressure is not respected.
- **Impact:** Partial or empty zips on large backups; silent data loss at the most important moment (post-event backup).
- **Recommendation:** Use `reply.type('application/zip').send(archive)` and call `archive.finalize()` **after** the send (the stream will pump as data is appended). Better: pipe to a `PassThrough` and test with a non-empty photos dir. Add a post-download integrity check (crc32 header) in the runbook.

#### No validation of oversold void side-effects

- **Title:** Void/refund sets *all* parent cards back to `available`, even if they were oversold
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Reliability / Invariant #10 (oversold)
- **Location:** `apps/api/src/routes/transactions.ts:199-208`
- **Problem:** When voiding one of two oversold sales for the same card, the handler sets `cards.status = 'available'`. But the *other* sale (the one not voided) is still a valid sale — the card is semantically `sold`.
- **Impact:** Card reopens for re-sale after admin voids one oversold tx; inventory count wrong; potential for third sale of same card.
- **Recommendation:** Before resetting status to `available`, check `transaction_items` for any other `sale`-kind item on this card without a matching `void`. If another sale exists, keep `status='sold'` and clear only the `oversold` flag if exactly one sale remains.

#### `sha256:` seed password path in production code

- **Title:** Seed hashes with SHA-256; auth accepts `sha256:` prefix forever
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `packages/db/src/seed.ts:9-11`; `apps/api/src/routes/auth.ts:36-42`
- **Problem:** Seed path uses unsalted SHA-256 (`sha256:<hex>`) for the initial admin. The auth handler permanently branches on this prefix, so any operator who seeds and never changes the password keeps an un-salted SHA-256 in the DB indefinitely — and offline-capable (precomputable) from leak.
- **Impact:** If the SQLite file leaks, admin password is trivially reversible (no work factor, no salt, short alphabet).
- **Recommendation:** Make seed call `bcrypt.hash(...)` synchronously (bcryptjs works in Node without native dep). Remove the `sha256:` branch from `auth.ts` and `change-password`. If a migration is needed, force-rotate on first login.

### Medium

#### Committed `.env` file on disk

- **Title:** Real `SESSION_SECRET` in `.env` (gitignored but present)
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security / Secrets management
- **Location:** `/Users/thebennies/dev/repo/thebennies/kolektapos/.env` (not in git)
- **Problem:** A 64-character hex `SESSION_SECRET` sits in the working tree. Gitignored, so not pushed — but still on any backup, laptop, sync tool (iCloud, Dropbox), or PR screenshot.
- **Impact:** If the workstation is compromised/backed-up off-machine, the production session secret leaks. Session cookies of all users can then be forged.
- **Recommendation:** Keep only `.env.example`, load the real secret from a password manager / secrets vault at deploy. Rotate the current secret before first event.

#### Cart-sweeper lock cleanup ignores `cart_items` vs `cards.locked_by_cart_id` drift

- **Title:** Sweeper looks up `cart_items` but doesn't sweep cards whose denorm lock is stale without a matching cart_item row
- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Reliability / Invariant #9
- **Location:** `apps/api/src/jobs/cart-sweeper.ts:52-75`
- **Problem:** Sweeper only releases cards whose cart is idle *and* still has a `cart_items` row. The POS client does local cleanup for cards locked by paid/abandoned carts, but a crash between server lock set and cart_item insert leaves an orphan lock that no sweep catches.
- **Impact:** Cards stuck `locked` indefinitely; cashier must manually unlock or restart POS.
- **Recommendation:** Additionally sweep cards with `locked_at < now - ttl*2` that have no matching `cart_items` row, or whose `lockedByCartId` points to a non-draft cart.

#### `/events/:eventId/settle` doesn't lock the settlement

- **Title:** Settling an event just stamps `settledAt`; subsequent transactions still allowed
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability
- **Location:** `apps/api/src/routes/settlement.ts:100-124`
- **Problem:** After settle, no enforcement that `transactions` for a settled event are rejected. The `carts` endpoint doesn't check event.settledAt. Append-only triggers don't care either.
- **Impact:** A late-arriving sync push (offline cashier at another booth) re-opens payouts for a settled event; admin payouts are already distributed.
- **Recommendation:** Reject cart creation / addItem / pay when `cart.event.settledAt != null`. Optionally surface a warning in sync push results ("settled_event_rejected").

#### Delta pull misses `payment_channel`, `settings`, `transaction_items`, `holds`, `cash_reconciliation`

- **Title:** Only `card`/`event`/`user`/`cart`/`transaction` delta-synced; other entities only on cursor=0
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability / Sync completeness
- **Location:** `apps/api/src/routes/sync.ts:82-94`
- **Problem:** If admin edits settings mid-event, cashier devices never receive the update on delta pull. Same for payment channels or settlement reconciliations.
- **Impact:** Cashier device enforces a stale `max_line_discount_pct_fixed` or cart TTL. Payment channel name changes don't propagate.
- **Recommendation:** Include those five tables in the delta branch. Add their `updatedAt` columns where missing (settings already has it, payment_channels does not — add a `version`/`updatedAt`).

#### Short-ID collision handling absent

- **Title:** `/cards` POST does not retry short-ID on collision
- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Reliability / Invariant #12 (collision → retry 5× locally, server rejects globals)
- **Location:** `apps/api/src/routes/cards.ts:41-62`; `apps/api/src/routes/sync.ts:129-137` (sync rejects, good)
- **Problem:** The client (IntakePage) generates the short-ID inline with no uniqueness check against IDB or server. `/cards` POST inserts it without re-checking unique constraint; on conflict, `db.insert` throws a Drizzle error that surfaces as a generic 500.
- **Impact:** The 1-in-60M collision is rare but will happen. Current failure mode is an ugly error and a stuck intake form.
- **Recommendation:** In `IntakePage`, generate and retry against `idb.cards.where('shortId').equals(id).first()` up to 5 times before submit. On server, wrap insert in try/catch for `SQLITE_CONSTRAINT_UNIQUE` and return a typed 409 `{ error: 'duplicate_short_id' }`.

#### Optimistic UI in POSPage can desync from server on add-to-cart failure

- **Title:** `handleAddToCart` updates IDB after server call, but failure after server-200 + IDB-fail leaves divergence
- **Severity / Confidence / Effort:** Medium / Medium / M
- **Category:** Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:616-682`
- **Problem:** Server returns 201; then `idb.cartItems.put(newItem)` fires. If IDB fails (storage full, private mode), the server row exists but local state doesn't. On reload, the cart shows items from server-pull, but in the meantime cashier thinks the card wasn't added and re-scans.
- **Impact:** Double-entry / ghost cart items.
- **Recommendation:** Wrap IDB updates in try/catch, on failure call `opportunisticSync()` to resync from server and show a toast "Lokal gagal — disinkronkan dari server".

#### `parent_transaction_id` has no foreign-key reference

- **Title:** Schema declares `parentTransactionId` as plain text, not a foreign key
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Data integrity
- **Location:** `packages/db/src/schema.ts:227`
- **Problem:** `parent_transaction_id: text(…)` with no `.references(() => transactions.id)`. A void can reference a non-existent or different-event transaction.
- **Impact:** Orphan voids; settlement math treats them as independent transactions with negative totals.
- **Recommendation:** Add the self-reference. Verify it doesn't break Drizzle's circular-reference handling (requires `sql` raw FK if needed).

#### `void` check for existing void uses `.all().find()` instead of query

- **Title:** Linear scan to detect prior void
- **Severity / Confidence / Effort:** Medium / Medium / S
- **Category:** Performance
- **Location:** `apps/api/src/routes/transactions.ts:128-140`
- **Problem:** `db.select().from(transactions).where(eq(parentTransactionId, parentId)).all().find(kind==='void')`. Should be `WHERE parent_transaction_id = ? AND kind = 'void' LIMIT 1`.
- **Impact:** Negligible at current scale, idiomatic rot as tx volume grows.
- **Recommendation:** Push the `kind` filter into the WHERE.

### Low

#### Inline `genShortId` in `IntakePage` duplicates `@kolektapos/qr`

- **Title:** Intake uses local copy of short-ID gen instead of shared package
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Code quality
- **Location:** `apps/web/src/pages/IntakePage.tsx:12-18`; canonical: `packages/qr/src/index.ts`
- **Problem:** Duplicated logic; if the algorithm changes (base62, checksum) one call site gets missed.
- **Recommendation:** Import `generateShortId` from `@kolektapos/qr`.

#### `PORT` default mismatch

- **Title:** `server.ts` defaults to `3000`; `.env.example` sets `3001`; vite proxy targets `3001`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Configuration
- **Location:** `apps/api/src/server.ts:28` vs `.env.example:6` vs `apps/web/vite.config.ts:42`
- **Problem:** Fresh checkout without `.env` starts API on 3000, PWA proxy points at 3001 → 100% request failures with no obvious error.
- **Recommendation:** Pick one (3001 matches runbook). Validate env with Zod at boot.

#### `audit_log` has no retention or size cap

- **Title:** Unbounded audit log growth
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Compliance / Reliability
- **Location:** `packages/db/src/schema.ts:298-313`
- **Problem:** Every mutating request dumps up to 2000 bytes of response body into a row. No archiving, no TTL. Over a long event day with many edits this grows linearly.
- **Recommendation:** Add a nightly archive-and-prune cron: keep 90 days hot, export older rows to a monthly JSONL file.

#### `crypto.randomUUID()` in Node < 19 / browser edge cases

- **Title:** Code assumes globalThis.crypto everywhere
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Portability
- **Location:** all server routes; `packages/db/src/seed.ts`; `apps/web/src/lib/sync.ts:150`
- **Problem:** Node 22 + modern browsers have `crypto.randomUUID()`. Test-setup polyfills it. The `engines.node >= 22` constraint covers this, but any future downgrade breaks silently.
- **Recommendation:** Document the constraint in README; keep the polyfill.

#### `useAuthStore` persists to localStorage, no `/me` bootstrap on reload

- **Title:** Stale auth state after server session expiry
- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** UX / Reliability
- **Location:** `apps/web/src/store/auth.ts`
- **Problem:** If the session cookie expires or is revoked server-side, `useAuthStore.user` remains populated from localStorage. User navigates to a protected route, sees the page shell, then gets 401s from every query.
- **Recommendation:** On app mount, call `api.auth.me()` and clear auth if 401.

#### `archive` dependency only in devDependencies

- **Title:** `archiver` is a runtime dependency but listed under `devDependencies`
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Deploy / Configuration
- **Location:** `apps/api/package.json:28-33`
- **Problem:** `import archiver from "archiver"` is server runtime code. A `pnpm install --prod` deploy will miss it.
- **Recommendation:** Move `archiver` to `dependencies`. Same for `@types/archiver` stays in dev.

#### No `/health` or `/ready` endpoint

- **Title:** Nothing for uptime checks or sync-status dashboard
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Observability
- **Recommendation:** Add `GET /health` that pings SQLite with `SELECT 1` and returns `{ ok, dbSize, uptime, activeCarts }`.

#### Login endpoint throws on bcrypt compare mismatch — timing attack surface

- **Title:** `Invalid credentials` returned after user lookup vs. after bcrypt — different timings
- **Severity / Confidence / Effort:** Low / Medium / S
- **Category:** Security
- **Location:** `apps/api/src/routes/auth.ts:28-45`
- **Problem:** Unknown email returns 401 before bcrypt runs; known email runs bcrypt (~100ms with cost=12). An attacker can enumerate valid emails by timing difference.
- **Recommendation:** On unknown user, run a dummy `bcrypt.compare()` against a known-bad hash to equalize timing. (11-user system, so the blast radius is small, but easy to fix.)

#### `DocsPage` is public (no auth guard)

- **Title:** `/docs` renders without requiring login
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Consistency
- **Location:** `apps/web/src/App.tsx:175`
- **Problem:** Everything else is behind `RequireAuth`; docs slip through. Probably intentional, but worth confirming — the docs reveal the short-ID format and business rules.
- **Recommendation:** If intentional, add a comment; otherwise wrap in `RequireAuth`.

#### Cart-locking race: concurrent `addItem` + `removeItem` isn't transactional with lock

- **Title:** Server add/remove wraps DB in `db.transaction()` but client state mutations are separate
- **Severity / Confidence / Effort:** Low / Medium / M
- **Category:** Reliability
- **Location:** `apps/web/src/pages/POSPage.tsx:684-724`
- **Problem:** Two rapid taps on remove (within the same cart) can fire two DELETEs; second hits 404 (handled); but IDB cleanup may run twice on same item.
- **Recommendation:** Guard with a Set of in-flight cart-item ids; disable the X button while removing.

---

## Detailed Review by Criteria

### 1) Functionality & Code Quality

#### Strengths
- Invariants are clearly called out in inline comments with PRD section references (e.g. `packages/db/src/schema.ts:114, 214, 263`).
- Happy-path POS flow is coherent: scan → review → cart → pay → receipt.
- Server-side transactions wrap the multi-table mutations in `carts.ts` and `transactions.ts` — good atomicity.
- Void/refund uses negative-totals + append-only correctly.

#### Issues
- Broken oversold void (Critical above).
- Inverted reveal (Critical above).
- Missing fixed-price floor enforcement (Critical above).
- Duplicate short-ID generator in IntakePage.
- Several routes use `.find()` after `.all()` instead of SQL predicates.

#### Recommendations
- Adopt Zod-validated handlers as the default; any route without one is a finding.
- Lint rule banning `crypto.randomUUID()` outside the server layer; client should use `uuid` v4 or import a wrapper that guarantees offline-safe IDs.

### 2) Testing

#### Strengths
- Append-only triggers tested (`packages/db/src/triggers.test.ts`) — the most load-bearing invariant.
- Short-ID format tested (`packages/qr/src/index.test.ts`).
- Zod schemas tested (`packages/types/src/card.test.ts`).
- Auth happy-path + unhappy-paths tested (`apps/api/src/routes/auth.test.ts`).
- Sync protocol schema tested.
- MaskedAmount component tested.
- `pnpm test` works end-to-end (24 tests green in 16 ms cached).

#### Issues
- No tests for `/carts/:id/pay` (the highest-value endpoint).
- No tests for `/sync/push` or `/sync/pull` handlers.
- No test for the cart-sweeper cron.
- No test for oversold detection or settlement calculation.
- No integration test of the offline-then-sync path.
- `useTapHoldReveal.test.ts` asserts the (incorrect) current behaviour — writing the test locked in the bug.

#### Recommendations
- Add a test harness that spins up the Fastify app + in-memory SQLite + runs migrations + triggers, reuse in all route tests (only auth has it now).
- Add E2E tests with Playwright for the POS happy-path against the PWA dev server.
- Property-test settlement math with a shuffled mix of sales/voids/oversolds.

#### How to run tests locally
```bash
pnpm install
pnpm test            # runs all vitest projects
pnpm --filter @kolektapos/api test   # single package
pnpm --filter @kolektapos/web test
```

### 3) Security

#### Strengths
- bcrypt cost 12.
- Session cookie httpOnly + secure-in-prod.
- Admin/cashier role split enforced at plugin level (`requireAdmin`).
- Zod validation on most POST/PATCH bodies.
- Append-only DB triggers prevent tampering via ORM.

#### Issues
- No CORS / Helmet / CSRF / rate-limit (High).
- `/sync/push` ingests unvalidated payloads (Critical).
- `sha256:` seed path still accepted for login (High).
- `.env` with real secret on disk (Medium).
- Login timing attack (Low).

#### Recommendations
- Minimum acceptable set: `@fastify/helmet`, `@fastify/cors` (origin=[DOMAIN]), `@fastify/rate-limit` (20/min on `/auth/*`, 200/min global), Zod on all endpoints, redact audit log, `sameSite: strict`.

### 4) Performance & Scalability

#### Strengths
- better-sqlite3 is synchronous and plenty fast for this workload.
- WAL mode + foreign_keys ON.
- Indexes on hot paths (`cards.shortId`, `cards.clientId`, `transactions.clientId`, `ti_card_idx`, `ti_owner_snapshot_idx`).

#### Issues
- Unbounded `.all()` queries across reports + list endpoints.
- Initial sync pulls entire card table.
- `/reports/monthly` scans all transactions in memory.

#### Recommendations
- Paginate. Add `WHERE paidAt BETWEEN ? AND ?` in monthly report. Measure response size at 10x projected data and add explicit perf budgets.

### 5) Reliability & Stability

#### Strengths
- Idempotent `client_id` on cards/carts/transactions.
- Optimistic concurrency (`version`) on mutable entities.
- `db.transaction()` wraps multi-statement mutations in carts.ts / transactions.ts / sweeper.
- Append-only enforced at DB, not just ORM.

#### Issues
- Settled events not actually locked.
- Oversold void reopens cards incorrectly.
- Cart-sweeper misses orphan locks (no cart_item row).
- Backup stream finalize order.

#### Recommendations
- Add a nightly integrity check that compares `cards.status='sold'` count with distinct sold `transaction_items.card_id` count; alert on drift.

### 6) Observability

#### Strengths
- Fastify default logger (pino).
- Progress notes capture milestone state.

#### Issues
- No structured business-event logging ("sale_completed", "cart_abandoned_by_sweeper", "oversold_detected").
- No request-id propagation to IDB/client.
- `console.log` in cart-sweeper; `catch {}` in audit.
- No health endpoint.
- No metrics exporter.

#### Recommendations
- Emit pino logs with `event: 'sale_completed'`, `cartId`, `totalIdr`, etc. on pay endpoint. Run runbook Section 7 (monitoring) against these log lines.

### 7) Local Deployment & DevOps

#### Strengths
- Turbo + pnpm workspace boots cleanly.
- `pnpm test` succeeds green out of the box.
- Runbook (`docs/03-runbook.md`) is thorough.
- `.nvmrc` pins Node.

#### Issues
- No top-level `pnpm dev` verified (`turbo run dev` persistent but requires both packages built).
- `apps/api` has no `lint` script; turbo `lint` task is a no-op everywhere.
- `archiver` in devDependencies but imported at runtime.
- No `postinstall`/`prepare` script to auto-run migrations on fresh clone.

#### Recommendations
- Add a single `pnpm setup` script that (a) copies `.env.example` to `.env` if missing, (b) creates `storage/` dirs, (c) runs migrations. Add ESLint config (shared) and package-level `lint` scripts.

### 8) Configuration & Environment Management

#### Strengths
- `.env.example` present, minimal, documented.
- `DATABASE_PATH`, `PHOTO_STORAGE_PATH`, `SESSION_SECRET`, `DOMAIN`, `PORT` are the only env vars.
- Session secret length-checked at boot.

#### Issues
- Port default mismatch (3000 vs 3001 vs vite proxy).
- Two dotenv `config({ path: … })` calls in speculative paths — implicit behaviour.
- No schema for env (`envalid`/Zod).

#### Recommendations
- Adopt `envalid` or Zod: fail fast at boot with a typed `config.ts`.

### 9) User Experience (UX)

#### Strengths
- Bahasa Indonesia labels throughout cashier flows.
- Large scan input with autoFocus; USB scanner (Enter-terminated) works identically.
- Quick tender amounts, change calculation, abandon-cart button with stale-server recovery.
- Receipt modal with print preview.
- MobileAppBar back button, sheet-style modals from bottom.
- Status badges localized and color-coded.

#### Issues
- Inverted tap-and-hold (Critical).
- Broken oversold resolution (Critical).
- No offline indicator on the scan screen when `navigator.onLine` is false.
- No "stale data" warning after long offline.
- Error messages sometimes leak server internals (`err.message` from Zod flatten).

#### Recommendations
- Add a persistent online/offline dot in the MobileAppBar.
- User-friendly error map for known server error codes.

### 10) Compliance & Legal

#### Strengths
- No PII beyond email+displayName of 11 owners; no customer-side PII captured.
- No payment card data (payment channels are labels).
- Single-domain, single-tenant — GDPR-like exposure is low.

#### Issues
- No `LICENSE` in repo (package.json sets `"private": true` but license field absent).
- Audit log retention unbounded.
- No documented data-export/deletion policy for owners (if one retires).

#### Recommendations
- Add `LICENSE` (even private/UNLICENSED) to be explicit. Document retention + owner-deletion procedure in runbook.

### 11) Documentation & Knowledge Sharing

#### Strengths
- `docs/01-prd.md` is consolidated, versioned, all open questions resolved.
- `docs/02-implementation-plan.md` maps milestones to PRD phases.
- `docs/03-runbook.md` covers pre-event, during-event, post-event operations.
- `docs/m1..m9-progress.md` capture rationale per milestone.
- `CLAUDE.md` states invariants for Claude Code sessions.
- Inline comments reference PRD sections in-place.

#### Issues
- README thin (21 lines, mostly pointing at other docs).
- No ADR log for design decisions (e.g. why bcrypt cost 12, why 30-day session, why Drizzle).
- No CONTRIBUTING.md or onboarding doc.

#### Recommendations
- Add a short CONTRIBUTING.md that says: "read CLAUDE.md → pick a milestone → ensure tests green → PR". Convert key decisions into ADRs under `docs/adr/`.

---

## Recommended Action Plan

### Phase 1: Immediate fixes (0–3 days)

1. Fix `OversoldQueuePage` to void the correct transaction (Critical).
2. Invert `useTapHoldReveal` to require 5s hold before reveal (Critical).
3. Enforce fixed-price floor on server (`carts.ts` addItem) (Critical).
4. Zod-validate `/sync/push` ops; strip server-owned fields (Critical).
5. Register `@fastify/helmet` + `@fastify/cors` (strict) + `@fastify/rate-limit` on `/auth/*` (High).
6. Redact `password*` fields from audit log payloads (High).
7. Remove `sha256:` branch from auth; force-rotate admin on first login (High).
8. Fix `/backup` finalize ordering + test with non-empty photos dir (High).
9. Move `archiver` to `dependencies` (Low).
10. Align PORT default with `.env.example` and runbook (Low).

### Phase 2: Short-term improvements (1–2 weeks)

1. Paginate all list endpoints; push filters into SQL (High).
2. Split `/sync/pull` cursor=0 into paged batches per entity type (High).
3. Include `settings`, `payment_channels`, `transaction_items`, `holds`, `cash_reconciliations` in delta sync (Medium).
4. Expand cart-sweeper to detect orphan locks (Medium).
5. Lock settled events against further transactions (Medium).
6. Retry short-ID on client-side uniqueness collision (Medium).
7. Write integration tests for `/carts/:id/pay`, `/sync/push`, `/transactions/:id/void`, oversold flow (Medium).
8. Add `/health` endpoint; structured pino business events (Medium).
9. Adopt `envalid` or Zod env parsing with explicit failure at boot (Medium).

### Phase 3: Longer-term refactors (2–6 weeks)

1. Playwright E2E for cashier happy-path + offline-then-sync.
2. Property-test settlement math (fast-check) across randomized sale/void/refund sequences.
3. Add ESLint + Prettier + `lint` scripts in every package; wire into Turbo.
4. Rework audit plugin to emit structured events to a separate log file *and* a pruned audit table.
5. Document ADRs for bcrypt cost, session duration, sync-cursor choice, oversold policy.
6. Add nightly integrity check comparing `cards.status='sold'` count vs distinct `transaction_items.card_id`.
7. Consider replacing Dexie storage for cart drafts with a TanStack Query persister — simpler invalidation.

---

## Appendix

### How to Run/Build/Test Locally

```bash
# Prereqs: Node >= 22, pnpm >= 10 (see .nvmrc)
pnpm install

# Copy env and fill SESSION_SECRET (>=32 chars)
cp .env.example .env
# Ensure storage dirs exist (API expects them):
mkdir -p apps/api/storage/photos

# First migration (also seeds admin@kolekta.id / changeme)
pnpm --filter @kolektapos/db exec tsx src/migrate.ts
pnpm --filter @kolektapos/db exec tsx src/seed.ts

# Dev (web on 5173 via vite, api on 3001; web proxies /api → 3001)
pnpm dev

# Full test suite
pnpm test

# Typecheck
pnpm typecheck

# Build (for deploy)
pnpm build
```

The runbook at `docs/03-runbook.md` covers the production deployment flow.

### Notable Files Reviewed

- Schema & triggers: `packages/db/src/schema.ts`, `packages/db/src/triggers.sql`, `packages/db/src/migrate.ts`, `packages/db/src/seed.ts`, `packages/db/src/triggers.test.ts`, `packages/db/src/test-acceptance.ts`
- API server + plugins: `apps/api/src/server.ts`, `apps/api/src/plugins/session.ts`, `apps/api/src/plugins/auth-guard.ts`, `apps/api/src/plugins/audit.ts`
- API routes: `apps/api/src/routes/auth.ts`, `apps/api/src/routes/carts.ts`, `apps/api/src/routes/transactions.ts`, `apps/api/src/routes/cards.ts`, `apps/api/src/routes/sync.ts`, `apps/api/src/routes/settlement.ts`, `apps/api/src/routes/backup.ts`, `apps/api/src/routes/holds.ts`, `apps/api/src/routes/overrides.ts`, `apps/api/src/routes/settings.ts`, `apps/api/src/routes/users.ts`, `apps/api/src/routes/events.ts`, `apps/api/src/routes/payment-channels.ts`, `apps/api/src/routes/audit-log.ts`
- Jobs: `apps/api/src/jobs/cart-sweeper.ts`
- Shared packages: `packages/qr/src/index.ts`, `packages/sync/src/protocol.ts`, `packages/sync/src/conflict.ts`, `packages/types/src/*.ts`
- Web shell: `apps/web/src/App.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/lib/db.ts`, `apps/web/src/lib/sync.ts`, `apps/web/src/lib/background-sync.ts`
- Web pages: `apps/web/src/pages/POSPage.tsx`, `apps/web/src/pages/IntakePage.tsx`, `apps/web/src/pages/OversoldQueuePage.tsx`, `apps/web/src/pages/LoginPage.tsx`, `apps/web/src/pages/ReportsPage.tsx`, `apps/web/src/pages/InventoryPage.tsx`
- UI primitives: `apps/web/src/components/MaskedAmount.tsx`, `apps/web/src/components/CameraScanner.tsx`, `apps/web/src/hooks/useTapHoldReveal.ts`
- Config: `package.json`, `apps/api/package.json`, `apps/web/package.json`, `turbo.json`, `.env.example`, `apps/web/vite.config.ts`

### Dependency Notes

- Server: Fastify 5, better-sqlite3 11, Drizzle 0.38, bcryptjs 3, node-cron 3, archiver 7 (wrongly in devDependencies), zod 3.
- Client: React 19, Vite 6, vite-plugin-pwa 0.21, Dexie 4, TanStack Query 5, Zustand 5, react-router 7, html5-qrcode 2, lucide-react 1.8, xlsx 0.18, uuid 11.
- No high-CVE dependencies spotted; recommend a scheduled `pnpm audit` in Phase 2.
- `bcryptjs` is JS-only (fine for pnpm deploy without rebuild step). `better-sqlite3` is native — listed in `pnpm.onlyBuiltDependencies` correctly.
- Missing from dependencies (recommended for Phase 1): `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, optionally `@fastify/csrf-protection`, `envalid`.
