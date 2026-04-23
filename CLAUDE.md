# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

Monorepo scaffold only; no source code yet. The PRD (`docs/01-prd.md`, v1.0, all open questions resolved) is the source of truth for scope and architecture. The implementation plan (`docs/02-implementation-plan.md`) sequences the build into milestones — consult it before starting or re-sequencing work.

## Project summary

KolektaPOS — private, self-hosted, single-booth POS for one group (Revota + 10 co-owners) running shared TCG Sales booths at Indonesian conventions. Not multi-tenant, not a product. 11 known users, one booth, one purpose.

## Planned architecture (per PRD §12)

Turbo + pnpm monorepo:

- `apps/web` — React + Tailwind + Vite + vite-plugin-pwa (Workbox). Local-first PWA; all reads/writes hit IndexedDB (Dexie).
- `apps/api` — Fastify + better-sqlite3. Sync server on same domain as the PWA.
- `packages/db` (Drizzle schema + migrations), `packages/types` (Zod + inferred TS), `packages/sync` (protocol + conflict resolution), `packages/ui` (shadcn/ui), `packages/qr` (short-ID + QR payload).

Client state: TanStack Query (IDB-persisted) for server-state, Zustand for UI-state. Auth: `@fastify/session` + `@fastify/cookie` + bcrypt, 30-day rolling sessions. Deployment: single VPS node, SQLite on persistent disk. PostgreSQL migration path reserved but not planned.

## Non-negotiable design rules

These are architectural invariants from the PRD — violating them requires re-opening scope with the user, not a local code change.

1. **Local-first, offline 100%.** Every cashier operation must work with zero network. Sync is background (60s + opportunistic). Online is required only for initial pull, sync, and photo upload backfill.
2. **`transactions` and `transaction_items` are insert-only.** No UPDATE, no DELETE — enforce at DB level (triggers) *and* ORM layer. Void/refund is a new row with `kind = void | refund` and `parent_transaction_id` set. Reports compute net by subtraction.
3. **Settlement uses `owner_user_id_snapshot` on `transaction_items`.** Never join through live `cards.owner_user_id` for payout math.
4. **Bottom price is a hard floor.** Cashier UI and server both block `final < bottom`. Only admin override with forced reason note unblocks it. Same pattern for `max_line_discount_pct_fixed` and `max_transaction_discount_pct` (both in `settings`).
5. **All monetary values are integer IDR.** No decimals anywhere in the stack.
6. **Bottom prices are never rendered by default.** Tap-and-hold 5s reveal, auto-hide. Masking applies to totals, per-card prices, owner payouts too (eye-icon reveal).
7. **Idempotent sync via `client_id` UUID** on cards, carts, transactions. Server dedups. Conflict ordering uses `server_received_at`, never client wall-clock.
8. **Optimistic concurrency via `version`** for mutable entities (cards, events, users, payment_channels, carts, cart_items, settings). Server wins; client re-surfaces local edit.
9. **Cart-locking is denormalized onto `cards`** (`locked_by_cart_id`, `locked_by_user_id`, `locked_at`) for fast scan-screen display. Single source of truth is `cart_items`; update the denorm atomically on insert/remove. Server cron every 5 min sweeps carts where `last_activity_at < now − cart_idle_ttl_minutes` → `status='abandoned'`, releases locks.
10. **Oversold is accepted residual risk** (R5). Two devices both offline can each sell the same card; both sales recorded, card flagged `oversold`, surfaces in admin queue for manual void/refund. Do not try to eliminate this — it's the accepted cost of offline-first.
11. **Cashier-facing UI is Bahasa Indonesia.** Admin/reports bilingual. Scan-first: default checkout screen is camera viewfinder; USB HID scanner feeds the same input field.
12. **Short card ID format `O-XXXXX`** (owner char + base-36 5-char random). 7 chars total, uppercase, fits QR Version 1 alphanumeric EC-H. Collision → retry 5× locally, server rejects globals → regenerate + reprint.

## Phasing (PRD §13)

- **MVP (before first event):** F1, F2, F3, F4, F5, F6, F7, F8, F10, F11, F13, F14, F15, F17, F18, F20, F28, F34, F35, F36. Cart-locking (F34) and settings (F35) are MVP because retrofitting them forces migrations + UX reflow. Backup (F36) is MVP because an event's data loss is unrecoverable.
- **v1 (after shakedown):** F12, F16, F19, F21, F23, F26, F30.
- **Deferred:** F22 (bundles), F33 (parallel events), buylist, store credit, booth fees, event expenses, tax export.
- **Explicitly dropped:** F24, F25, F27, F29, F31, F32.

When asked to add a feature, check its phase before implementing — "add low-stock alerts" is a deferred-bucket scope discussion, not a task.

## Implementation sequence (PRD §17)

1. Drizzle schema + migrations for §6 tables, including triggers for append-only constraints.
2. Turbo + pnpm workspace bootstrap.
3. API routes: auth, users, events, cards CRUD, carts (create/update/abandon/pay), transactions (insert-only), sync push/pull, backup download.
4. PWA shell: React + Tailwind + shadcn/ui, Dexie, Workbox SW.
5. **POS happy-path spike first** — login → scan → review → add to cart → pay → receipt. Wire cart-locking end-to-end in this spike; it touches every layer and de-risks the hardest integration.
6. Reports: daily, then monthly + per-event settlement.
7. Admin tooling: override approval, oversold queue, cash reconciliation, settings editor, backup.

## Commands

None yet — repo is pre-bootstrap. Once `apps/`, `packages/`, and `turbo.json` exist, expect standard Turbo commands (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm test`, with `--filter` for single-package work). Update this section when the workspace is scaffolded.
