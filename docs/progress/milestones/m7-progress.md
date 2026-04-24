# M7 Progress Report — Reports + Settlement

**Status:** Complete  
**Date:** 2026-04-23

## Deliverables

### Schema migration (`packages/db/drizzle/0001_event_settlement.sql`)
- Added `settled_at integer` and `settled_by_user_id text` to `events` table
- Schema updated in `packages/db/src/schema.ts`

### IDB updates (`apps/web/src/lib/db.ts`)
- `IdbEvent.settledAt` and `IdbEvent.settledByUserId` optional fields
- New `IdbCashReconciliation` interface
- Dexie version 2: `cashReconciliations` table (`id, eventId, date`)

### API routes (`apps/api/src/routes/settlement.ts`)
| Method | Path | Description |
|---|---|---|
| `GET` | `/reports/event/:eventId/settlement` | Per-owner payout using `ownerUserIdSnapshot` |
| `POST` | `/events/:eventId/settle` | Lock settlement on closed event (admin only) |
| `GET` | `/reports/event/:eventId/inventory-value` | Card count + value by status |
| `GET` | `/reports/monthly?year=&month=` | Monthly aggregate + per-day breakdown |
| `POST` | `/cash-reconciliations` | Record end-of-day cash reconciliation |
| `GET` | `/cash-reconciliations?eventId=&date=` | Query reconciliation history |

### Settlement invariant (PRD §6.1 rule 3)
Per-owner payout computed exclusively from `transaction_items.owner_user_id_snapshot` — never joins through live `cards.owner_user_id`. Sign-correct: sale items add, void/refund items subtract.

### Reports page (`apps/web/src/pages/ReportsPage.tsx`)
Four-tab interface:
- **Harian (Daily)**: event + date filter, summary, channel breakdown, top 5 sales, CSV export
- **Bulanan (Monthly)**: year+month pickers, aggregate totals, per-day table, CSV export
- **Settlement**: per-owner masked payouts, "Kunci Settlement" button (admin + closed event only), settled badge with timestamp, CSV export
- **Inventori**: card counts by status + listed values by status

### Cash reconciliation page (`apps/web/src/pages/CashReconciliationPage.tsx`)
- Admin-only form: auto-fills expected cash from IDB (cash channel transactions for the day)
- Counted cash input, real-time variance display (green = balanced, red = discrepancy)
- Notes field; saves to API + IDB on submit
- History list for selected event+date

### Background sync
`applyChanges()` now handles `cash_reconciliation` entity type — delta pull updates local IDB.

### Dashboard
Admin quick-action grid now shows "Rekonsiliasi" link alongside Admin.

## CSV export
All four report types generate RFC-4180-compliant CSV with Indonesian + English column headers. Downloaded client-side via Blob URL.

## Settlement lock semantics
- Only closed events can be settled (422 if still active/draft)
- Once settled, `POST /events/:id/settle` returns 409 — settlement is final
- Underlying `transactions` remain append-only; settlement is a metadata lock on the event
- "Settled" view is read-only: no UI affordance for modification after lock
