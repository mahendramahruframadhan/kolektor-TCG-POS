# M2 Progress Report — API Skeleton + Auth

**Status:** ✅ Complete  
**Date:** 2026-04-23  
**Branch:** `claude/implement-plan-progress-eWMDE`

---

## What Was Built

### `packages/types`

Zod schemas for all API-surface types:

| File | Schemas |
|------|---------|
| `src/user.ts` | CreateUser, UpdateUser, LoginInput |
| `src/event.ts` | CreateEvent, UpdateEvent |
| `src/payment-channel.ts` | CreatePaymentChannel, UpdatePaymentChannel |
| `src/settings.ts` | UpdateSetting, KnownSettingKeys |
| `src/card.ts` | CreateCard, UpdateCard (with refinements for fixed/negotiable) |
| `src/cart.ts` | CreateCart, AddCartItem, PayCart |
| `src/transaction.ts` | CreateVoidRefund |

### `apps/api`

| File | Purpose |
|------|---------|
| `src/server.ts` | Fastify app bootstrap, DB init, plugin wiring |
| `src/plugins/session.ts` | `@fastify/session` + `@fastify/cookie`; 30-day rolling, HttpOnly+Secure+SameSite=Lax |
| `src/plugins/audit.ts` | `onSend` hook writing `audit_log` rows on every successful mutation |
| `src/plugins/auth-guard.ts` | `requireAuth` / `requireAdmin` preHandler hooks |
| `src/routes/auth.ts` | POST /auth/login, POST /auth/logout, GET /me |
| `src/routes/users.ts` | CRUD /users (admin only for create/list/patch) |
| `src/routes/events.ts` | CRUD /events (single-active enforcement) |
| `src/routes/payment-channels.ts` | CRUD /payment-channels (soft delete = deactivate) |
| `src/routes/settings.ts` | GET /settings, PUT /settings/:key |

---

## Acceptance Results

```
✓ POST /auth/login → returns user object + sets session cookie
✓ GET /me → returns authenticated user (401 when unauthenticated)
✓ POST /users (as admin) → 201 Created
✓ POST /users (as cashier) → 403 Forbidden
✓ GET /settings → returns all 3 default settings as parsed JSON
✓ audit_log middleware fires on every successful mutation
```

---

## Design Decisions

- **bcryptjs** instead of native `bcrypt` — no native build required; equivalent security at slightly lower speed (irrelevant for login operations).
- **Seed password support**: `sha256:` prefix in `password_hash` accepted at login for dev/seed workflow; production users always get bcrypt hashes.
- **Single active event constraint** enforced at API layer on `POST /events` and `PATCH /events/:id`.
- **Optimistic concurrency**: `PATCH /events/:id` requires `version` in body, returns `409 Version conflict` if stale.
- **Soft-delete** for payment channels: `DELETE` sets `is_active=false` rather than removing the row (preserves audit trail).
- **Audit plugin** is best-effort: errors are swallowed so auditing never breaks a response. Future hardening can make it synchronous/transactional.

---

## Non-scope for M2 (deferred to M4+)

- Card CRUD routes (client writes to IDB first; sync reconciles)
- Cart / transaction routes
- Sync push/pull

---

## Dependencies for M3

- `POST /auth/login` and `GET /me` are ready for the PWA login page.
- `GET /settings`, `GET /payment-channels`, `GET /events` are ready for the PWA initial pull.
