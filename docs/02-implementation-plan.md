# Implementation Plan — KolektaPOS

**Companion to:** [`01-prd.md`](01-prd.md) v1.0
**Status:** M0 complete. Ready to start M1.
**Goal:** ship MVP (PRD §13 Phase 1) in time for the first event.

---

## Principles

1. **Vertical slices over horizontal layers.** The happy-path spike (M4) ships login → scan → pay end-to-end on a single card type before any feature breadth. This de-risks the hardest integration (cart-locking across PWA + sync + server) while everything else is still cheap to change.
2. **Offline discipline from day one.** Every feature is built client-first against IndexedDB. The API exists to sync, not to serve reads. If a milestone introduces a server-only read path, it's wrong.
3. **Append-only is a DB invariant, not a convention.** `transactions` / `transaction_items` triggers land in M1 alongside the schema. If tests can DELETE from these tables, M1 is not done.
4. **Settlement math uses snapshots only.** Payout code never joins through `cards.owner_user_id`. Enforced by test in every milestone that touches reports.
5. **Cut features to hold the date, never cut invariants.** If a milestone slips, drop scope (defer F28 quick-tender, skip PDF export) before bending R3, R5, or §6.1 rules.

---

## Milestones

### M0 — Repo scaffold ✅ done

Turbo + pnpm workspace, root configs, empty package manifests, `CLAUDE.md`, `README.md`. Initial commit pushed to `origin/main`.

---

### M1 — Data layer + migrations

**Goal:** `packages/db` contains the full schema from PRD §6, with append-only constraints enforced at DB level.

**Scope**
- Drizzle schema for every table in §6: `users`, `events`, `payment_channels`, `settings`, `cards`, `holds`, `carts`, `cart_items`, `transactions`, `transaction_items`, `cash_reconciliations`, `audit_log`.
- SQLite triggers blocking `UPDATE` and `DELETE` on `transactions` and `transaction_items` (§6.1 rule 1).
- Seed: payment_channels (Cash, BCA, Mandiri, BNI, GoPay, OVO, Dana, ShopeePay, QRIS, Other — F7), default settings keys (§5.1 F35), one admin user (env-seeded password).
- Integer IDR everywhere — no `REAL`, no `NUMERIC` (§6.1 rule 8).
- `client_id` unique indexes on cards, carts, transactions for idempotent sync.
- Denorm lock fields on `cards` with a comment pointing to §6.1 rule 4.

**Artifacts**
- `packages/db/src/schema.ts`
- `packages/db/drizzle/*.sql` (generated)
- `packages/db/src/seed.ts`
- `packages/db/src/triggers.sql` (applied post-migration)

**Acceptance**
- Fresh `sqlite3` file opens clean after `pnpm db:migrate`.
- `INSERT INTO transactions (...)` succeeds; subsequent `UPDATE transactions SET ...` and `DELETE FROM transactions` both error.
- Same for `transaction_items`.
- Test: settlement query using `owner_user_id_snapshot` returns correct totals after a card's `owner_user_id` is mutated post-sale.

**Dependencies:** none.

---

### M2 — API skeleton + auth

**Goal:** `apps/api` boots, serves authenticated sessions, exposes CRUD for the non-sync entities.

**Scope**
- Fastify app with `@fastify/session` + `@fastify/cookie` + bcrypt (PRD §10).
- 30-day rolling sessions, HttpOnly + Secure + SameSite=Lax.
- Routes: `POST /auth/login`, `POST /auth/logout`, `GET /me`, CRUD for `users` (admin), `events`, `payment_channels`, `settings`.
- `audit_log` middleware on every mutating route (§10 logged actions).
- Request validation via `packages/types` Zod schemas.
- HTTPS-only in production; dev cert acceptable.

**Non-scope**
- Sync routes (deferred to M6).
- Card CRUD — the client will write cards to IDB first; sync reconciles later.

**Artifacts**
- `apps/api/src/server.ts`, `apps/api/src/routes/*.ts`, `apps/api/src/plugins/session.ts`.
- `packages/types/src/*.ts` (Zod schemas for User, Event, PaymentChannel, Settings).

**Acceptance**
- `curl -b cookies.txt` login → `GET /me` returns user.
- Permission denied for non-admin on `POST /users`.
- Audit log row written on every mutation.

**Dependencies:** M1.

---

### M3 — PWA shell

**Goal:** `apps/web` installs as a PWA, login works online, dashboard renders with masked totals from IndexedDB.

**Scope**
- Vite + React + Tailwind + shadcn/ui in `packages/ui`.
- `vite-plugin-pwa` with Workbox; manifest + icons.
- Dexie schema mirroring §6 (client-side subset — carts, cards, transactions, users, events, payment_channels, settings, pending_photos).
- TanStack Query with IDB persistence; Zustand for UI state.
- Login page → Dashboard page (active event + masked totals only).
- Eye-icon reveal component + long-press reveal hook (PRD §9.1).
- Bahasa Indonesia copy for cashier routes; bilingual scaffolding for admin.

**Acceptance**
- PWA installable on Chrome + Safari (mobile).
- After first login, closing network → reload → dashboard still renders from IDB.
- Masked totals are hidden by default, revealed via eye tap, auto-hide on long-press after N seconds.

**Dependencies:** M2 (for initial login pull).

---

### M4 — POS happy-path spike 🎯 **critical de-risking milestone**

**Goal:** end-to-end sale of one fixed-price card, with cart-locking wired through every layer.

**Scope**
- Stock-receive one card manually via API (seed or admin tool — no UI yet).
- Checkout page with camera viewfinder (`html5-qrcode`) + USB HID scanner feeding the same input.
- Scan → card review screen (masked price, eye-reveal).
- Add to cart → writes `cart_items` row + updates `cards.locked_by_cart_id` atomically.
- Cart panel with line items.
- Pay → select payment channel → `transactions` + `transaction_items` insert → cart `status='paid'` → locks released.
- Receipt view (screen only; no print yet).
- Server cron (node-cron) sweeping stale carts every 5 min per §16.7.
- Sync push for create_cart / add_cart_item / pay_cart / create_transaction (minimal subset).
- Cross-device lock visibility: device B sees "Di keranjang [Name]" after sync.

**Out of scope for M4**
- Negotiable pricing, discounts, overrides (M5).
- Label printing, bulk import, photos (M5).
- Conflict resolution for offline-offline race (M6).

**Acceptance**
- Two laptops on same LAN, both logged in. Device A scans card → adds to cart. Within 60s device B scans same card → sees yellow "Di keranjang [A]" state, cannot add.
- Device A completes sale → device B sees "Terjual" after next sync.
- Kill device A's network mid-cart → device A still completes sale locally. On reconnect, sale reaches server; device B sees it.
- DB state after all of the above: append-only tables never mutated in place.

**Dependencies:** M1, M2, M3.

**Budget:** this milestone should take the most time. Don't rush it.

---

### M5 — Feature breadth for MVP

**Goal:** remaining MVP features (PRD §13 Phase 1) layered onto the M4 spine.

**Scope (PRD feature IDs)**
- **F1** fixed-price discount flow with reason note + `max_line_discount_pct_fixed` guard + admin override path.
- **F2** negotiable pricing: listed + bottom, cashier enters final, auto-discount %, hard floor block, admin override for below-bottom.
- **F3** event scoping on every mutation; active-event selector (single active).
- **F4** scanner flows already present from M4 — wire to real inventory.
- **F5** label PDF rendering (50×25mm) + `window.print()`.
- **F6** short-ID generator in `packages/qr` (O-XXXXX, collision retry).
- **F7** payment channel picker (already seeded M1).
- **F10** masking coverage audit across all screens.
- **F11** daily report (single date × active event).
- **F13** owner + stock-received-by fields on stock-receive form.
- **F14, F15** condition / set / rarity / language / edition inputs.
- **F17** per-event owner payout report (CSV export).
- **F18** hold flow with user-set expiry + auto-release.
- **F20** void/refund UI producing compensating rows.
- **F28** cash quick-tender buttons + change calc.
- **F34** already wired in M4; polish cross-device copy.
- **F35** admin settings editor.
- **F36** one-click backup: zip of SQLite snapshot + `storage/photos/`.

**Acceptance**
- All MVP feature IDs demonstrable on real devices.
- Reports reconcile: daily gross − voids − refunds = net, matched against manual spot-check.
- Override queue visible to admin; reason notes required and stored on `transaction_items`.
- Backup zip restores cleanly into a fresh server.

**Dependencies:** M4.

---

### M6 — Full sync + conflict resolution

**Goal:** sync protocol per PRD §16, including the oversold queue.

**Scope**
- Push/pull cursor-based sync in `packages/sync`, consumed by both PWA (Workbox BackgroundSync) and API.
- `server_received_at` authoritative ordering (§16.4).
- Conflict scenarios in §16.3 all handled, with test coverage per row of that table.
- Oversold detection: when two `transaction_items` reference the same `card_id` with `kind='sale'` and no intervening void, flag `cards.oversold=true`.
- Admin "Oversold queue" screen listing flagged cards with one-click void + refund wizard.
- Photo upload backfill via multipart POST per §16.5.
- Initial install pull per §16.6.

**Acceptance**
- Scripted test: 2 offline devices both sell card X, both sync. Both sales present, card flagged, admin queue shows it. Admin voids one → card no longer flagged.
- Photos captured offline upload on reconnect; canonical URL stored on card.

**Dependencies:** M5.

---

### M7 — Reports + settlement

**Goal:** monthly + per-event settlement + inventory value (PRD §7).

**Scope**
- F12 monthly report.
- §7.3 per-event settlement with "settled" lock + timestamp.
- §7.4 inventory-value report.
- CSV + PDF export for all reports.
- F21 end-of-day cash reconciliation (expected vs counted + variance + notes).

**Acceptance**
- Closing an event generates settlement CSV matching hand-computed totals for a seeded test event.
- "Settled" view locks further edits on settlement but underlying `transactions` remain append-only.

**Dependencies:** M6.

---

### M8 — Stock-receive polish + bulk import

**Goal:** remaining Phase 2 features (PRD §13).

**Scope**
- F16 graded card fields.
- F19 photo-at-stock-receive capture + thumbnail on device.
- F23 transaction-level discount with cap + override.
- F26 xlsx bulk import via SheetJS with row-level validation + error report.
- F30 transaction notes field.

**Dependencies:** M5.

---

### M9 — Dry-run + first event

**Goal:** de-risk the real event with a controlled rehearsal.

**Scope**
- Internal test with real cards, real phones, 2+ cashiers, simulated network flapping.
- Bug triage + fix cycle.
- Runbook: pre-event backup, day-start checklist, network-down procedure, oversold resolution, end-of-day reconciliation, post-event backup.
- Production deploy to `pos.kolekta.id` (VPS of choice per §12.2).

**Acceptance**
- Dry-run surfaces zero data-loss bugs and zero hard-blocker UX bugs on the happy path.
- Runbook lives at `docs/03-runbook.md`.
- First event runs without Revota having to open the DB directly.

**Dependencies:** M7 at minimum; M8 preferred.

---

## Deferred (explicit non-goals for this plan)

Per PRD §5.2 and §5.3: bundle sale (F22), parallel events (F33), buylist, store credit, low-stock alerts, booth fees, event expenses, tax export, authenticity (F24), price history (F25), customer lookup (F27), showcase mode (F29), trade-in (F31), external price API (F32). Any request for these during M1–M9 is a scope conversation, not a task.

---

## Risks to the plan

- **M4 underestimation.** Cart-locking across IDB + sync + server triggers is the single hardest piece. If M4 slips, M5 slips 1:1.
- **IDB storage on low-end Android.** Photo blobs (~150KB each) on 10k+ cards could approach quota. Mitigation: thumbnails only on client, full-res server-only (already in §16.5).
- **SQLite triggers vs Drizzle migrations.** Drizzle's migration tool doesn't manage trigger lifecycle well. Mitigation: keep triggers in a hand-authored `triggers.sql` re-applied after every migration via a post-migrate hook.
- **Clock skew at the booth.** Multiple devices, no NTP. Mitigation already in design: `server_received_at` is authoritative; client wall-clock is display-only (§16.4).
- **First-event panic scope creep.** The week before the event will surface "just one more feature" asks. Mitigation: this plan; anything not in Phase 1 is a no.

---

## Definition of done (MVP)

1. All Phase 1 feature IDs demonstrable on real hardware.
2. Every PRD §6.1 hard rule enforced and tested.
3. Every PRD §16.3 conflict scenario has a test.
4. Backup zip verified by restoring on a fresh server.
5. Dry-run (M9) completed without data-loss bugs.
6. Runbook exists and Revota has walked through it once.
