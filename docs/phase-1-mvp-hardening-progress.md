# Phase 1 Progress Report — Perimeter & Config Hygiene

**Status:** Complete
**Date:** 2026-04-24
**Branch:** `feat/complete-mvp`
**Plan:** [`docs/plans/2026-04-24-mvp-hardening-phase-1.md`](plans/2026-04-24-mvp-hardening-phase-1.md)
**Merged review:** [`docs/dev-notes/20260424-033000-CODE_REVIEW_REPORT-MERGE.md`](dev-notes/20260424-033000-CODE_REVIEW_REPORT-MERGE.md)

## Findings Closed

| ID | Finding | Fix |
|----|---------|-----|
| M18 | `PORT` default mismatch between `server.ts` (3000), `.env.example` (3001), and vite proxy (3001) | `server.ts:28` fallback now `3001` |
| M17 | `archiver` imported at runtime but declared in `devDependencies` — breaks `pnpm install --prod` | Moved to runtime `dependencies`; `@types/archiver` remains dev |
| H4 | No CORS / Helmet / CSRF on the API | `@fastify/helmet` + `@fastify/cors` registered (origin from `DOMAIN`, `credentials: true`) |
| H10 | No rate limiting on `/auth/*` | `@fastify/rate-limit` registered with `global: false`; `/auth/login` → 20/min, `/auth/change-password` → 10/min |
| H11 | Audit plugin logs unredacted payloads + silently swallows DB insert errors | Recursive `redact()` for known sensitive keys (password, passwordHash, token, session, etc.); `catch` now calls `request.log.error(…)` |
| M12 | `.env` file with real `SESSION_SECRET` on disk | `.env.example` rewritten with rotation guidance (`openssl rand -hex 32`) + required `ADMIN_EMAIL`/`ADMIN_PASSWORD` placeholders; on-disk `.env` removal is an operator step |
| n/a | Cookie `sameSite: lax` (bundled with H4 per plan Quick Wins) | Tightened to `sameSite: strict` — PRD §10 confirms single-domain deployment |

## Tasks Completed

| Task | Commit | Files |
|------|--------|-------|
| T1 — Align PORT default | `44f5bae` | `apps/api/src/server.ts` |
| T2 — Move archiver to runtime deps | `8b1cdfd` | `apps/api/package.json`, `pnpm-lock.yaml` |
| T4 — Document env rotation + admin vars | `5324fb9` | `.env.example` |
| T3 — Helmet + CORS + rate-limit + sameSite | `663c55c` | `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/src/server.ts`, `apps/api/src/plugins/session.ts`, `apps/api/src/routes/auth.ts` |
| T17 — Audit redaction + error logging | `3565c48` | `apps/api/src/plugins/audit.ts` |

All five tasks passed a two-stage review (spec compliance, then code quality).

## Tests Added

None. Phase 1 changes are either configuration (deps, env-var placeholders, PORT fallback) or cross-cutting plugins (perimeter headers, audit hook) whose behaviour is exercised indirectly by Phase 2+ integration tests. No regression in the existing suite.

## Verification

- `pnpm typecheck` — green (3 packages successful)
- `pnpm test` — green (all existing tests pass; 4 API auth tests + 6 web hook/component tests + package-level tests)
- `pnpm build` — green (both `@kolektapos/api` and `@kolektapos/web` build cleanly)

## New Runtime Dependencies

| Package | Version |
|---------|---------|
| `@fastify/helmet` | `^12.0.1` |
| `@fastify/cors` | `^10.1.0` |
| `@fastify/rate-limit` | `^10.3.0` |
| `archiver` (promoted from devDeps) | `^7.0.1` |

## Carry-over / Notes

- **Operator action required before first event:** rotate `SESSION_SECRET` (`openssl rand -hex 32`), set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the production `.env`. Phase 2 Task T5 will make the seed hard-fail without them.
- Rate-limiter is registered with `global: false`; only `/auth/login` and `/auth/change-password` are currently throttled. If additional sensitive routes surface later (e.g., `/auth/forgot-password`, admin override endpoints), opt them in individually via `{ config: { rateLimit: { max, timeWindow } } }`.
- Audit redaction is key-based (`passwordHash`, `token`, etc.) — it does not scrub sensitive material placed inside non-sensitive keys (e.g. `notes: "token=abc"`). Acceptable for the single-booth threat model but worth revisiting if audit data is ever exported.
- Phase 2 (auth hardening) will build on this foundation: remove the `sha256:` fallback, strip `passwordHash` from `/sync/pull` and `/users`, add object-level authz on cards PATCH / cart mutations / void-refund.
