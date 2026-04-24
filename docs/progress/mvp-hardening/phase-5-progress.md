# Phase 5 Progress Report — Backup Safety + Branch Completion

**Status:** Complete (final phase)
**Date:** 2026-04-24
**Branch:** `feat/complete-mvp`
**Plan:** [`docs/plans/2026-04-24-mvp-hardening-phase-1.md`](../../plans/2026-04-24-mvp-hardening-phase-1.md)

## Findings Closed

| ID | Finding | Fix |
|----|---------|-----|
| H3 | `/backup` streamed the live SQLite file with WAL/SHM excluded and no snapshot; restore could lose recent writes or be inconsistent | Rewrote `apps/api/src/routes/backup.ts` to open a short-lived `better-sqlite3` handle on the DB path, best-effort `wal_checkpoint(TRUNCATE)`, `await source.backup(tempPath)` to a `os.tmpdir()` file, then zip the snapshot + photos. `unlinkSync` fires on archive `end`/`close`/`error` to avoid orphaned tempfiles. Send/finalize order flipped to `reply.send(archive); archive.finalize();` |

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| T16 — SQLite snapshot + WAL checkpoint for `/backup` | `c45202b` | `apps/api/src/routes/backup.ts`, `apps/api/src/routes/backup.test.ts` (new), `apps/api/package.json`, `pnpm-lock.yaml` |

Passed two-stage review (spec compliance, then code quality).

## Tests Added

| File | Cases | What they prove |
|------|-------|-----------------|
| `apps/api/src/routes/backup.test.ts` (new) | 2 | Response is a valid zip (PK header bytes, non-trivial length); back-to-back `/backup` requests don't 500 (tempfile cleanup works) |

## Verification

- `pnpm typecheck` — green (FULL TURBO cache)
- `pnpm test` — green (18 API tests + 8 web + package-level tests)
- `pnpm build` — green
- Post-test check: no orphan `/tmp/kolektapos-snapshot-*` files

---

## Branch-Level Final Review

Reviewed by `superpowers:code-reviewer` against `1a34d00..HEAD`. Assessment: **merge-ready, no Critical blockers**. One Important finding and three Minors flagged as non-blocking follow-ups (see Carry-over below).

### Summary of MVP Hardening Phase 1 (all 5 sub-phases)

| Phase | Theme | Tasks | Commits |
|-------|-------|-------|---------|
| 1 | Perimeter & config hygiene | T1, T2, T3, T4, T17 | 5 |
| 2 | Auth hardening | T5, T6, T7, T8 | 4 |
| 3 | Business correctness bugs | T9, T10, T11, T12, T13, T14 | 6 |
| 4 | Sync integrity | T15 | 1 |
| 5 | Backup safety | T16 | 1 |

**Total:** 17 implementation commits + 5 progress-report commits + 1 final report commit = 23 commits on this branch (plus 2 pre-plan commits that set up the merged review and the plan itself).

### Findings Closed Across the Branch

Critical (from merged review): **C1, C2, C3 (validation half), C5, C6, C7, C8, C9** — 8 of 9 closed.
High: **H1, H2, H3, H4, H10, H11** — 6 closed.
Medium: **M1, M12, M17, M18** — 4 closed.

C4 (full offline-first write queue) is explicitly deferred — see "Deferred to next plan" below.

### Tests Added Across the Branch

| Area | File | Cases |
|------|------|-------|
| Seed bcrypt + env-gate | `packages/db/src/seed.test.ts` | 2 |
| Sync redaction + push validation | `apps/api/src/routes/sync.test.ts` | 5 |
| Authz boundaries | `apps/api/src/routes/authz.test.ts` | 5 |
| Cart fixed-price floor | `apps/api/src/routes/carts.test.ts` | 1 |
| Settlement sign math | `apps/api/src/routes/settlement.test.ts` | 1 |
| Backup snapshot | `apps/api/src/routes/backup.test.ts` | 2 |
| Tap-hold reveal (rewritten) | `apps/web/src/hooks/useTapHoldReveal.test.ts` | 5 |

**Total new / rewritten test cases:** 21.

### Carry-over / Non-blocking Follow-ups

Raised by the final branch review:

1. **(Important) CORS in dev reflects any origin.** `apps/api/src/server.ts:48` uses `origin: true` with `credentials: true` when `DOMAIN` is unset. In production this resolves to `https://${DOMAIN}`, which is correct. In dev, an explicit allowlist (e.g. `["http://localhost:5173", "http://127.0.0.1:5173"]`) would tighten the posture. Not a merge blocker for a single-booth self-hosted deployment; tracked as first item in the Phase 2 hardening plan.
2. **(Minor) Dead `cardRows` query in `/sync/pull` cursor=0 branch.** `apps/api/src/routes/sync.ts` — a `cards where status='sold'` query is immediately overwritten by `allCards`. Harmless but confusing; delete in a follow-up.
3. **(Minor) `/sync/push` whitelist must evolve lockstep with client schema.** `.strict()` is the intended safety posture, but any future field addition needs a matching server deploy before clients can sync. Document in the runbook.
4. **(Minor) `/sync/push` still lacks handlers for `update_*`, `pay_cart`, `add_cart_item`, `create_hold`, etc.** Default branch rejects `unsupported_op_type`, so nothing breaks — but offline clients that queue an unsupported op will never drain. Since the MVP operates largely online, this is acceptable pre-event; tracked as part of the deferred C4.

### Deferred to Next Plan (unchanged from plan's "Out of scope" block)

- **C4** — Full offline-first write queue + complete `/sync/push` op coverage (the partner item to #4 above).
- **H5** — Void-of-oversold card reopens status; should keep `sold` if another sale remains.
- **H6** — Settled-event lock (no new carts/pays/voids on a settled event).
- **H9** — Delta sync for `settings`, `payment_channels`, `transaction_items`, `holds`, `cash_reconciliations` (currently only on cursor=0).
- **H13** — Photo upload stub: implement multipart persistence or remove.
- **H14** — Dedicated cashier bootstrap endpoint (first-device hydration without hitting `/users`).
- All remaining Mediums/Lows per the merged review's action plan.

### Operator Actions Before First Live Event

1. **Rotate `SESSION_SECRET`** — `openssl rand -hex 32` — and place in production `.env` (not the working tree).
2. **Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`** — server seed now refuses to create admin without them.
3. **Ensure `DOMAIN` is set** in production env so CORS locks to `https://${DOMAIN}`.
4. **Verify `@fastify/rate-limit` thresholds** (20/min `/auth/login`, 10/min `/auth/change-password`) are sane for team size (11 users).
5. **Run `GET /backup`** at least once post-deploy to confirm the snapshot-based zip restores to a working SQLite database.
6. **Pre-existing SHA-256 password hashes will fail login** — reseed with a different email or manually bcrypt-update rows if migrating an existing DB.

### Merge Recommendation

Branch is ready to merge into `main` (or to be reviewed on GitHub). All Critical findings from the merged review that are in scope for this plan are closed; tests exercise the critical PRD invariants; typecheck, test, and build are all green. The Important CORS-dev concern is a follow-up, not a blocker.
