# Phase 2 Progress Report — Auth Hardening

**Status:** Complete
**Date:** 2026-04-24
**Branch:** `feat/complete-mvp`
**Plan:** [`docs/plans/2026-04-24-mvp-hardening-phase-1.md`](plans/2026-04-24-mvp-hardening-phase-1.md)

## Findings Closed

| ID | Finding | Fix |
|----|---------|-----|
| C7 | Unsalted SHA-256 seed + `changeme` default + `sha256:` branch accepted at login forever | Seed now requires `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars and bcrypt-hashes the password (cost 12). Login + change-password handlers drop the `sha256:` branch entirely. |
| C2 | `/sync/pull` serializes full `users` rows including `passwordHash` to every authenticated client | Shared `userDto()` helper (in `apps/api/src/utils/user-dto.ts`) strips `passwordHash`. Applied in both initial-pull and delta-pull branches of `/sync/pull`. `/users` routes already project responses manually — verified. |
| C1 | Every mutating route used `requireAuth` only — no object-level authz | New factories `makeRequireCartOwnerOrAdmin` / `makeRequireHoldOwnerOrAdmin` in `auth-guard.ts`. Applied: cards PATCH → `requireAdmin`; cart mutations (add/remove-item, pay, abandon) → ownership-or-admin; hold release → ownership-or-admin; transaction void/refund → `requireAdmin`. |
| M1 | Server trusted client-asserted `requiresAdminOverride` flag | Server now rejects `requiresAdminOverride: true` from non-admin sessions with 403 before any price validation. |

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| T5 — bcrypt seed + drop SHA-256 | `6442291` | `packages/db/src/seed.ts`, `packages/db/src/seed.test.ts` (new), `packages/db/package.json`, `apps/api/src/routes/auth.ts`, `pnpm-lock.yaml` |
| T6 — strip `passwordHash` | `0ef5cc4` | `apps/api/src/utils/user-dto.ts` (new), `apps/api/src/routes/sync.ts`, `apps/api/src/routes/sync.test.ts` (new) |
| T7 — object-level authz | `f8c3a64` | `apps/api/src/plugins/auth-guard.ts`, `apps/api/src/routes/cards.ts`, `apps/api/src/routes/carts.ts`, `apps/api/src/routes/holds.ts`, `apps/api/src/routes/transactions.ts`, `apps/api/src/routes/authz.test.ts` (new) |
| T8 — admin-override role check | `2307f48` | `apps/api/src/routes/carts.ts`, `apps/api/src/routes/authz.test.ts` |

All four tasks passed a two-stage review (spec compliance, then code quality).

## Tests Added

| File | Cases | What they prove |
|------|-------|-----------------|
| `packages/db/src/seed.test.ts` | 2 | Seed skips admin creation when env unset; uses bcrypt (`$2` prefix) when env set |
| `apps/api/src/routes/sync.test.ts` | 2 | `/sync/pull?cursor=0` and `?cursor=1` never include `passwordHash` in user payloads |
| `apps/api/src/routes/authz.test.ts` | 5 | Cashier blocked / admin allowed on PATCH cards + void tx; cashier forbidden to set `requiresAdminOverride` |

Integration tests use the real Drizzle migration SQL files (same pattern adopted in Phase 2), so they exercise the production schema.

## Verification

- `pnpm typecheck` — green (FULL TURBO cache hit after the final rerun)
- `pnpm test` — green (`@kolektapos/api`: 11 tests across 3 files — 4 auth + 2 sync + 5 authz; `@kolektapos/db`: 8 tests incl. 2 new seed)
- `pnpm build` — green

## Carry-over / Notes

- **Operator action:** before the next seed run, export `ADMIN_EMAIL` and `ADMIN_PASSWORD`; seed silently skips admin creation when either is missing (log message only). Any pre-existing `sha256:` password hashes in a production DB will now fail login — either reseed with a different email or manually bcrypt-update.
- The authz test fixtures load real Drizzle migrations via `readFileSync` with hard-coded filenames. When a new migration lands, both `sync.test.ts` and `authz.test.ts` need the new filename appended.
- A positive-case test for admin successfully setting `requiresAdminOverride` is not present (spec only requires the negative case); consider adding for defense-in-depth.
- Phase 3 will address business-correctness bugs (oversold void target, tap-and-hold reveal inversion, fixed-price floor, timestamp unification, settlement + dashboard/reports net math).
