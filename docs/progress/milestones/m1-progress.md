# M1 Progress Report — Data Layer + Migrations

**Status:** ✅ Complete  
**Date:** 2026-04-23  
**Branch:** `claude/implement-plan-progress-eWMDE`

---

## What Was Built

### `packages/db`

| File | Purpose |
|------|---------|
| `src/schema.ts` | Full Drizzle schema for all 12 tables from PRD §6 |
| `src/triggers.sql` | Append-only enforcement triggers (transactions, transaction_items, audit_log) |
| `src/seed.ts` | Payment channels, default settings, admin user (env-configured) |
| `src/migrate.ts` | Migration runner that applies Drizzle migrations + triggers post-migrate |
| `src/index.ts` | Re-exports for consumers |
| `drizzle.config.ts` | drizzle-kit config |
| `drizzle/0000_faulty_cerebro.sql` | Generated SQL migration (12 tables) |

---

## Acceptance Results

```
11 passed, 0 failed

✓ 10 payment channels seeded (Cash IDR, BCA, Mandiri, BNI, GoPay, OVO, Dana, ShopeePay, QRIS, Other)
✓ 3 default settings seeded (max_line_discount_pct_fixed=20, max_transaction_discount_pct=30, cart_idle_ttl_minutes=30)
✓ admin user seeded
✓ transactions INSERT succeeds
✓ transactions UPDATE raises
✓ transactions DELETE raises
✓ transaction_items INSERT succeeds
✓ transaction_items UPDATE raises
✓ transaction_items DELETE raises
✓ settlement shows 50000 for original owner (snapshot)
✓ live owner does NOT appear in settlement (snapshot is source of truth)
```

---

## Design Decisions

- **All monetary fields are `integer`** — no `REAL` or `NUMERIC` anywhere (§6.1 rule 8).
- **Triggers are in `triggers.sql`**, not in Drizzle migrations — drizzle-kit doesn't reliably track trigger lifecycle. The `migrate.ts` runner re-applies them with `CREATE TRIGGER IF NOT EXISTS` after every migration run.
- **`client_id` unique indexes** on `cards`, `carts`, `transactions` enable idempotent sync (§16.1).
- **Denormalized lock fields** (`locked_by_cart_id`, `locked_by_user_id`, `locked_at`) on `cards` — single source of truth remains `cart_items`; denorm is for fast scan-screen UI (§6.1 rule 4).
- **`owner_user_id_snapshot`** on `transaction_items` is intentionally duplicated from `cards.owner_user_id` at sale time. Settlement math must never join through the live `cards` row (§6.1 rule 5).
- **Seed uses SHA-256** for the admin password at seed time; production API layer uses bcrypt. ADMIN_EMAIL and ADMIN_PASSWORD are env-configurable.

---

## Invariants Enforced

| Rule | How Enforced |
|------|-------------|
| transactions append-only | SQLite BEFORE UPDATE/DELETE triggers |
| transaction_items append-only | SQLite BEFORE UPDATE/DELETE triggers |
| audit_log append-only | SQLite BEFORE UPDATE/DELETE triggers |
| All monetary = integer IDR | Drizzle `integer()` columns only (no REAL/NUMERIC) |
| client_id uniqueness | `UNIQUE INDEX` on cards, carts, transactions |
| Settlement via snapshot | Column design: `owner_user_id_snapshot` always populated at insert |

---

## Dependencies for M2

- `packages/db` is ready to be imported by `apps/api`.
- `runMigrations(dbPath)` returns `{ sqlite, db }` for direct use.
- `seed(db)` is idempotent (checks before insert).
