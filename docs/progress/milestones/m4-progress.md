# M4 Progress Report — POS Happy-Path Spike

**Status:** ✅ Complete  
**Date:** 2026-04-23  
**Branch:** `claude/implement-plan-progress-eWMDE`

---

## What Was Built

### `apps/api`

| File | Purpose |
|------|---------|
| `src/routes/cards.ts` | CRUD /cards — GET list, GET by ID, GET by short-ID, POST (intake), PATCH (optimistic concurrency) |
| `src/routes/carts.ts` | Cart lifecycle — POST /carts, GET /carts/:id, POST /carts/:id/items, DELETE /carts/:id/items/:cardId, POST /carts/:id/pay, POST /carts/:id/abandon |
| `src/jobs/cart-sweeper.ts` | node-cron `*/5 * * * *` — sweeps idle draft carts, releases card locks |

### `apps/web`

| File | Purpose |
|------|---------|
| `src/lib/sync.ts` | `fetchAndSync()` — initial pull: fetches events, channels, settings, users, cards → IDB |
| `src/store/pos.ts` | Zustand POS store: `activeCartId`, `scannedCard` |
| `src/pages/POSPage.tsx` | Full checkout screen: scan input, card review, cart panel, PaymentModal, ReceiptModal |

---

## Acceptance Results

```
✓ Event created (active)
✓ Card created via POST /cards (priceIdr=50000)
✓ Cart created via POST /carts
✓ Card added to cart → card.locked_by_cart_id set atomically
✓ POST /carts/:id/pay → kind=sale, total=50000, 1 transaction_item
✓ Card.status = 'sold' after payment
✓ Card.locked_by_cart_id = None after payment (lock released)
```

---

## Cart Locking Flow

The end-to-end cart locking invariant is enforced at multiple layers:

1. **Server** (`carts.ts`): `POST /carts/:id/items` wraps card lock update + cart_item insert + cart.last_activity_at update in a single `db.transaction()`.
2. **Client** (`POSPage.tsx`): optimistically updates `idb.cards` lock fields immediately on add-to-cart, so other scans on the same device see the lock without waiting for sync.
3. **Cron** (`cart-sweeper.ts`): sweeps every 5 min, reads `cart_idle_ttl_minutes` from settings (default 30), atomically releases locks and abandons stale carts.
4. **Abandonment**: `DELETE /carts/:id/items/:cardId` and `POST /carts/:id/abandon` both release locks in the same transaction as the cart mutation.

---

## POS UI (PWA)

- **Scan input**: large autofocused monospace field, refocuses after every action; accepts USB HID scanner `\n` as Enter.
- **Status badge**: Tersedia (green) / Di keranjang (yellow) / Ditahan (orange) / Terjual (gray)
- **Cart panel**: masked line totals, masked grand total; remove items; abandon cart.
- **Payment modal**: channel picker grid; cash quick-tender (50k, 100k, 200k, 500k, 1jt); change display; confirm button.
- **Receipt modal**: shows transaction ref + item count + masked total; "Transaksi Baru" resets the full state.

---

## Append-only Invariant Preserved

The pay flow uses `db.insert(transactions)` and `db.insert(transactionItems)` — never UPDATE/DELETE. The SQLite triggers from M1 provide a hard DB-level backstop. The server `db.transaction()` wrapping the pay flow means either everything (tx + items + card status + cart status) commits or nothing does.

---

## Cart Sweeper

```ts
cron.schedule("*/5 * * * *", () => {
  const ttl = getCartIdleTtlMinutes(db);  // from settings, default 30
  const cutoff = now - ttl * 60;
  // find idle carts → release card locks → mark abandoned
})
```

Reads `cart_idle_ttl_minutes` live from the settings table so admin can change the TTL without a server restart.

---

## Dependencies for M5

- M4 provides the full POS spine. M5 will add:
  - Negotiable pricing (final price input + floor validation)
  - Line discounts + admin override flow
  - Short ID generator (`packages/qr`)
  - Intake form UI
  - Inventory list page
  - Label PDF generation
  - Daily report
  - Hold/release flow
  - Void/refund flow
