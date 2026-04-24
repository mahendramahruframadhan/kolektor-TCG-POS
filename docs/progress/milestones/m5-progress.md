# M5 Progress Report — Feature Breadth for MVP

**Status:** ✅ Complete  
**Date:** 2026-04-23  
**Branch:** `claude/implement-plan-progress-eWMDE`

---

## What Was Built

### `packages/qr` — Short ID generator (F6)

- `generateShortId(ownerIndex: 0-10): string` → `O-XXXXX` format (base-36, uppercase, 7 chars)
- `isValidShortId(id: string): boolean` — validates format regex
- Owner chars: 0-9 → '0'-'9', 10 → 'A' (supports 11 owners per PRD §8)

### `packages/sync` — Sync protocol skeleton (M6 prep)

- `protocol.ts`: Zod schemas for SyncOp, SyncPushRequest/Response, SyncPullRequest/Response
- `conflict.ts`: `CONFLICT_RESOLUTIONS` map for all 6 PRD §16.3 scenarios

### `apps/api` — New routes

| Route | Feature |
|-------|---------|
| `routes/holds.ts` | POST /holds, DELETE /holds/:id, GET /holds/active (F18) |
| `routes/transactions.ts` | GET /transactions, GET /transactions/:id, POST /:id/void, POST /:id/refund (F20) |
| `routes/backup.ts` | GET /backup — streams SQLite as .db download (F36, admin-only) |
| `routes/sync.ts` | GET /sync/pull (cursor-based, initial + delta), POST /sync/push, POST /sync/photo/:cardClientId |

**Discount guards in `carts.ts`:**
- Fixed cards: `lineDiscountPct > max_line_discount_pct_fixed` → 422 unless `requiresAdminOverride=true`
- Negotiable cards: `intendedPriceIdr < bottomPriceIdr` → 422 unless `requiresAdminOverride=true`

**Hold auto-expiry in `cart-sweeper.ts`:**
- Sweep every 5 min: holds where `expires_at < now AND released_at IS NULL` → released, card status → available

### `apps/web` — New pages

| Page | Features |
|------|---------|
| `IntakePage.tsx` | Card intake form: owner select, title, set/number/rarity/language/condition/edition, pricing mode, auto-generated shortId, submit → POST /api/cards (F13, F14, F15) |
| `InventoryPage.tsx` | Card list from IDB, text search, status filter, status badges, masked prices, tap for detail panel |
| `ReportsPage.tsx` | Daily report from IDB: gross/net/void totals, transaction count, payment channel breakdown, top 5 sales, CSV export (F11) |
| `AdminPage.tsx` | Settings editor: max_line_discount_pct_fixed, max_transaction_discount_pct, cart_idle_ttl_minutes (F35) |

**POS Page updates:**
- Negotiable pricing: final price input, discount % display, bottomPriceIdr floor validation

---

## Acceptance Results

```
✓ API build: server starts cleanly with all 11 routes
✓ GET /sync/pull?cursor=0 → 14 changes (users + events + channels + settings + cards)
✓ GET /backup → 200 (SQLite file stream)
✓ apps/web pnpm build: 136 modules, 0 TypeScript errors
✓ All 4 new pages wired in App.tsx with RequireAuth / RequireAdmin guards
✓ Admin page guarded: cashiers redirected to /dashboard
```

---

## PRD Feature Coverage (M5)

| Feature | Status |
|---------|--------|
| F1 Fixed-price discount flow | ✅ Guard in carts.ts + admin override bypass |
| F2 Negotiable pricing / floor | ✅ bottomPriceIdr check + POSPage final-price input |
| F3 Event scoping | ✅ eventId on all cart/transaction inserts |
| F6 Short ID generator | ✅ packages/qr |
| F7 Payment channel picker | ✅ PaymentModal (M4) |
| F10 Masking coverage | ✅ MaskedAmount on all price fields |
| F11 Daily report | ✅ ReportsPage |
| F13 Owner + intaken-by fields | ✅ IntakePage + CreateCard schema |
| F14 Condition grade | ✅ IntakePage enum |
| F15 Set/number/rarity/language/edition | ✅ IntakePage fields |
| F17 Per-event owner payout (CSV) | ✅ ReportsPage CSV export |
| F18 Hold / reserve | ✅ holds routes + InventoryPage |
| F20 Void / refund (append-only) | ✅ transactions.ts POST void/refund |
| F28 Cash quick-tender | ✅ PaymentModal (M4) |
| F35 Settings editor | ✅ AdminPage |
| F36 One-click backup | ✅ backup.ts GET /backup |

---

## Dependencies for M6

- `packages/sync` protocol types ready for PWA background sync wiring
- `GET /sync/pull` and `POST /sync/push` endpoints live
- PWA `fetchAndSync()` still does full pull — M6 will add cursor-tracking and delta sync
