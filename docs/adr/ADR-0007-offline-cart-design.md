# ADR-0007: Offline Carts Are Local-Only by Design

**Date:** 2026-04-26  
**Status:** Accepted  
**Context:** PRD §11 — offline-first; §16.2 — sync push/pull protocol

## Decision

When the POS operates offline, carts created in IndexedDB are **never synced to the server**. Only the resulting `pendingTransaction` (after payment) is queued for flush via `POST /sync/flush-pending-tx`.

The server receives `cartId: null` on flushed transactions from offline carts.

## Rationale

1. **Simplicity** — the offline sale flow (scan → add → pay → receipt) is complete without the server knowing about the cart lifecycle. The transaction is the atomic record of truth.
2. **No conflict risk** — if the device went offline during an active online cart, pushing a stale local cart could conflict with the server's cart state. Avoiding this eliminates an entire conflict category.
3. **Cart sweeper safety** — the server's cart sweeper (`*/5 * * * *`) only operates on server-side carts. Offline carts never hold server-side card locks (card locks in the server DB are only acquired on `POST /carts/:id/items`).

## Consequences

- `transactions.cartId` will be `NULL` for all transactions created from offline carts. Reports and audits that join `transactions → carts` must handle `NULL` cartId.
- The Oversold Queue shows cards sold by offline transactions (`cartId: null`) with no cart ancestry. This is expected.
- If a device is lost mid-event while offline, there is no server record of what was in its local cart (only completed, paid transactions are recoverable via flush).

## Alternatives considered

- **Push `create_cart` / `create_cart_item` ops via `/sync/push`** — rejected because the offline cart lifecycle (create → add items → pay → abandon) would require the full cart protocol, adding significant complexity with no benefit since the transaction payload already contains all necessary financial data.
