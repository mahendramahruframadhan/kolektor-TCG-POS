# Phase 4 Progress Report — Sync Integrity

**Status:** Complete
**Date:** 2026-04-24
**Branch:** `feat/complete-mvp`
**Plan:** [`docs/plans/2026-04-24-mvp-hardening-phase-1.md`](plans/2026-04-24-mvp-hardening-phase-1.md)

## Findings Closed

| ID | Finding | Fix |
|----|---------|-----|
| C3 (validation portion) | `/sync/push` cast `request.body as any` and spread `op.payload` directly into `db.insert(...).values(...)` — client could forge `oversold`, `status`, `cashierUserId`, `createdAt`, etc. | Envelope now validated with `SyncPushRequestSchema` (400 on failure). Each op's payload parsed against a strict per-op schema (`.strict()` rejects unknown keys). `cashierUserId` pulled from session — never from payload. `kind: z.literal("sale")` forces void/refund through the admin route. |

**Scope note:** C3 has two halves — (a) validation of the existing `create_card` / `create_transaction` ops, and (b) adding handlers for the missing op types (`create_cart`, `add_cart_item`, `create_hold`, etc.) so full offline round-trip works. T15 covers only (a). The remaining handlers (and the full offline-first write queue) are explicitly deferred to the next hardening plan, as noted in the original plan's "Out of scope" block.

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| T15 — Zod-validate `/sync/push` ops | `2a97ceb` | `apps/api/src/routes/sync.ts`, `apps/api/src/routes/sync.test.ts`, `apps/api/package.json`, `pnpm-lock.yaml` |

Passed two-stage review (spec compliance, then code quality).

## Tests Added

| File | Cases | What they prove |
|------|-------|-----------------|
| `apps/api/src/routes/sync.test.ts` (extended) | 3 | Forged `oversold: true` in `create_card` → rejected; empty `create_transaction` payload → rejected; malformed envelope (missing `deviceId`) → 400 |

Total `sync.test.ts` cases after Phase 4: 5 (2 from T6 password-hash redaction + 3 new).

## Verification

- `pnpm typecheck` — green
- `pnpm test` — green (16 API tests across 5 files + 8 web tests + package-level tests)
- `pnpm build` — green

## Carry-over / Notes

- **Push handler still only accepts `create_card` and `create_transaction`.** Offline carts, cart items, and holds cannot round-trip. This is the remaining half of C3 and is tracked as part of the Phase 2 offline-first work in the merged review.
- **Card-ownership forgery is possible via push today**: `CreateCardPushPayloadSchema` accepts `ownerUserId` and `intakenByUserId` from the client without cross-checking against the session (matches baseline `CreateCardSchema`, which is used by the REST intake route as well). Locking ownership to the session is a separate finding for the next hardening plan.
- **New workspace dep:** `apps/api` now depends on `@kolektapos/sync` (`workspace:*`).
- **Unused imports in `sync.ts`** (`cartItems`, `holds`, `and`) predate this commit — not removed because they're out of scope.
- Phase 5 (backup safety) is the final phase: replace the live-file stream in `/backup` with a `better-sqlite3` `.backup()` snapshot + WAL checkpoint.
