# Data Retention Policy

**Status:** Living document. Last reviewed: 2026-04-24.

KolektaPOS is a private, single-booth POS for one group (Revota + 10 co-owners). We do not handle customer PII. This document records what we store, how long we keep it, and how data is removed.

## 1. What we store

| Category | Contents | Location |
|----------|----------|----------|
| **Operator accounts** | Email, display name, bcrypt password hash, role, timestamps. 11 known users. | `users` table (SQLite) |
| **Card inventory** | Card metadata, prices (inc. bottom), graded fields, short-IDs, ownership. | `cards` table |
| **Transactions (append-only)** | Sales, voids, refunds. Snapshot of owner + listed price at sale time. | `transactions`, `transaction_items` |
| **Carts** | Draft/paid/abandoned cart state + items. | `carts`, `cart_items` |
| **Photos** | JPEG ≤ 1024 px per card at stock-receive time. | Filesystem under `PHOTO_STORAGE_PATH` |
| **Audit log** | Mutating-route summaries with redacted payloads. | `audit_log` table |
| **Sync artefacts** | Per-device last-cursor state + pending op queue. | IndexedDB on each device |
| **Session cookies** | 30-day rolling HttpOnly/SameSite-strict cookies. | Browser cookie store |
| **Backups** | Operator-initiated zip (SQLite snapshot + photos dir). | Operator's machine |

We do **not** store: customer personally identifiable information, payment card numbers (payment-channel labels only), biometric data, geolocation.

## 2. Retention windows

| Category | Retention | Rationale |
|----------|-----------|-----------|
| **Operator accounts** | Indefinite while active; deleted on operator departure request. | Required to authenticate. |
| **Card inventory** | Indefinite. | Resale records must survive across events. |
| **Transactions + items** | Indefinite. | Financial record; append-only by design (SQL triggers). |
| **Carts (non-paid)** | 30 days, then soft-purge by `createdAt`. | Debug aid; never contains money. |
| **Photos** | Indefinite while the card exists; deleted when card is retired. | Tied to inventory lifecycle. |
| **Audit log** | **90 days** hot in SQLite; older rows archived to `storage/audit-archive/YYYY-MM.jsonl` then deleted from the table. | Security visibility vs. unbounded table growth. Archive files can be removed after 2 years. |
| **Sync artefacts (IDB)** | Wiped on logout; otherwise tied to device lifetime. | Local cache. |
| **Session cookies** | 30-day rolling; invalidated on logout. | Standard session hygiene. |
| **Backups** | Operator-managed. Recommended: keep last 3 dailies + last 6 monthlies. | Operator discretion; document in `docs/03-runbook.md`. |

## 3. Operator departure ("right to be forgotten")

When a co-owner leaves the group:

1. Mark the `users` row as disabled (role=`cashier`, password rotated to a random value so they can't log in).
2. Do NOT delete historical transactions or `owner_user_id_snapshot` on `transaction_items` — those are load-bearing for past settlement accuracy.
3. Optionally anonymise `users.email` and `users.displayName` to `former-owner-<ownerChar>`.
4. Remove the operator's entry from `payment_channels` if they had a dedicated channel.

## 4. Implementation notes

- **Audit archive cron.** A daily cron (see `apps/api/src/jobs/audit-pruner.ts`, new as of 2026-04-24) archives rows older than 90 days into a JSONL file under `storage/audit-archive/YYYY-MM.jsonl` and deletes them from the table.
- **Photos** are not automatically swept. When a card is retired, its photo should be unlinked in the same DB transaction (tracked as a follow-up).
- **Transactions** cannot be deleted or modified — DB triggers enforce append-only.

## 5. Review cadence

This policy is reviewed once per calendar year or when a co-owner joins/leaves. Any change is recorded in the adjacent ADR series under `docs/adr/`.
