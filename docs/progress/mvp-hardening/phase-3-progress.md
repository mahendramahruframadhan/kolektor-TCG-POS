# Phase 3 Progress Report — Business Correctness Bugs

**Status:** Complete
**Date:** 2026-04-24
**Branch:** `feat/complete-mvp`
**Plan:** [`docs/plans/2026-04-24-mvp-hardening-phase-1.md`](../../plans/2026-04-24-mvp-hardening-phase-1.md)

## Findings Closed

| ID | Finding | Fix |
|----|---------|-----|
| C5 | `OversoldQueuePage.handleVoid(card.id, …)` passed a card UUID where a transaction UUID was expected — server always returned 404, oversold resolution broken | Rewrote `handleVoid` to look up `transactionItems.where("cardId")`, resolve parent transactions, exclude already-voided sales, and void the most-recent open sale |
| C6 | `useTapHoldReveal` revealed on pointer-down and auto-hid after `holdMs` (inverted from PRD §9.1 invariant #6 — bottom prices leaked on any tap) | Rewrote hook: reveal only fires AFTER `holdMs` elapses; `endReveal` cancels pending reveal; `AUTOHIDE_MS = 3000` auto-hide after successful reveal |
| C8 | Server accepted arbitrary `intendedPriceIdr` for fixed-price cards (no `intendedPriceIdr < card.priceIdr` check) | Added hard-floor guard in `POST /carts/:id/items` fixed-pricing branch; returns 422 `{ error, fixedPriceIdr }` unless the (T8-validated) admin override is set |
| C9 | `POSPage.tsx` wrote `lastActivityAt`/`lockedAt` in milliseconds while the server + cart-sweeper used Unix seconds; local carts never timed out | New `apps/web/src/lib/time.ts` exporting `nowSec()`; two call sites in `POSPage.tsx` switched from `Date.now()` to `nowSec()` |
| H1 | Settlement per-owner aggregator multiplied already-negative void/refund `soldPriceIdr` by `-1`, inflating payouts | Dropped the `sign` multiplier; now sums signed `soldPriceIdr` directly. Grand totals (which use `Math.abs`) left unchanged |
| H2 | Dashboard + Reports computed `net = gross − voids` where `voids` summed already-negative `totalIdr`, so net *increased* on void | Both files now sum `Math.abs(t.totalIdr)` for void/refund reducers; formula unchanged |

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| T9 — Oversold void targets correct transaction | `4c8c59d` | `apps/web/src/pages/OversoldQueuePage.tsx` |
| T12 — Timestamp unification | `4fc76b9` | `apps/web/src/lib/time.ts` (new), `apps/web/src/pages/POSPage.tsx` |
| T14 — Net math fix | `bccac6d` | `apps/web/src/pages/DashboardPage.tsx`, `apps/web/src/pages/ReportsPage.tsx` |
| T10 — Inverted tap-and-hold reveal | `e519b1a` | `apps/web/src/hooks/useTapHoldReveal.ts`, `apps/web/src/hooks/useTapHoldReveal.test.ts` |
| T11 — Fixed-price floor (server) | `a5e3009` | `apps/api/src/routes/carts.ts`, `apps/api/src/routes/carts.test.ts` (new) |
| T13 — Settlement sign math | `3c1ea53` | `apps/api/src/routes/settlement.ts`, `apps/api/src/routes/settlement.test.ts` (new) |

All six tasks passed a two-stage review (spec compliance, then code quality).

## Tests Added

| File | Cases | What they prove |
|------|-------|-----------------|
| `apps/web/src/hooks/useTapHoldReveal.test.ts` (rewritten) | 5 | No reveal on press, no reveal on early release, reveal after full hold, auto-hide after reveal, `clearReveal` resets |
| `apps/api/src/routes/carts.test.ts` (new) | 1 | Fixed-price floor rejects below-price with 422, accepts at-price with 201 (both within one test) |
| `apps/api/src/routes/settlement.test.ts` (new) | 1 | Sale + full void → per-owner payout is 0 (locks in the no-double-negation invariant) |

## Verification

- `pnpm typecheck` — green (FULL TURBO cache on re-run)
- `pnpm test` — green (6 task targets, all cached after final run)
- `pnpm build` — green

## Carry-over / Notes

- `OversoldQueuePage.handleVoid` now depends on Dexie's `transactionItems.where("cardId")` index — verified present in `apps/web/src/lib/db.ts` (`transactionItems` index string includes `cardId`). If a future IDB migration changes that index, this code breaks silently at runtime.
- The new `nowSec()` helper is only used by POSPage today. Other web-side call sites that persist `updatedAt`/`lastActivityAt` should adopt it when touched; a codebase-wide sweep is out of scope here.
- Settlement per-owner math fix does NOT backfill existing incorrect settlement rows. Any event that was settled BEFORE this commit has an incorrect `breakdown` stored in reports — admins must re-compute if they care about pre-fix accuracy.
- Phase 4 (sync integrity) will Zod-validate `/sync/push` ops and strip server-owned fields.
