# ADR-0005: Oversold is an accepted residual risk

**Status:** Accepted · 2026-04-24

## Context

The PWA is **offline-first**: two cashiers on two devices can both be offline and both sell the same card's short-ID before either device reconnects. We can't detect the double-sale locally on either device — by the time `/sync/push` runs, both sales have been committed.

Eliminating this would require either (a) an always-online precondition on every sale (defeats the offline-first invariant, PRD §R1), or (b) a distributed lock with quorum (operationally heavy for a single-booth 11-user system).

## Decision

Accept oversold as a **residual risk** (PRD §R5). When the server detects a second sale on the same `card_id`:

1. The sale succeeds (we don't reject the second cashier's transaction).
2. The card row is flagged `oversold = true`.
3. The card surfaces in the **admin oversold queue** (`/admin/oversold`).
4. Admin resolves it manually by voiding one of the sales (and refunding the affected customer out-of-band).

## Consequences

- We never silently drop a sale, so the cashier's UI stays coherent.
- Settlement math for the two owners is correct until an admin voids; after the void, the owner of the voided sale sees their payout decrease (with a corresponding negative `transaction_item` row).
- Must have a working admin oversold workflow before any multi-device event (see Phase 3, T9).

## Operational guardrails

- Admin is trained to check the oversold queue after every event day.
- Backup + restore strategy covers oversold rows normally — they're regular transactions with a flag on the card.
- PRD §16.4 lists oversold as the **only** accepted residual; every other two-device conflict has deterministic resolution (last-write-wins on metadata, first-write-wins on short-ID uniqueness).

## Alternatives considered

- **Reject the second sale server-side.** Rejected — customer 2 already paid on-device; the booth would have to refund and explain.
- **Always-online sales.** Rejected — violates PRD §R1.
- **Optimistic lock with versioned decrement.** Rejected — two offline devices can't coordinate a decrement.
