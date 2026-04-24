# ADR-0001: bcrypt cost factor 12

**Status:** Accepted · 2026-04-24

## Context

Passwords are stored in the `users.password_hash` column. The hash needs to be slow enough to resist brute force if the SQLite file leaks, but fast enough that login + change-password stay responsive on the operator's laptop / VPS (Node.js, `bcryptjs` which is pure JS).

Empirically on a 2019-era VPS: cost 10 ≈ 40 ms, cost 12 ≈ 150 ms, cost 14 ≈ 650 ms.

## Decision

Use **bcrypt cost 12** everywhere a password is hashed:

- `packages/db/src/seed.ts` (admin bootstrap)
- `apps/api/src/routes/auth.ts` change-password
- `apps/api/src/routes/users.ts` create/update user

## Consequences

- ~150 ms login latency — acceptable for human interaction.
- Offline cracking rate on a consumer GPU drops by ~4× vs cost 10.
- Seed + tests are measurably slower than cost 10; accepted because test cardinality is small (11 users).

## Alternatives considered

- **Cost 10** (common default) — rejected; too fast on modern hardware.
- **Cost 14** — rejected; login feels sluggish for cashiers tapping 11 characters.
- **scrypt / argon2id** — rejected; `bcryptjs` is pure-JS and deploys without native build tools, which matters for our single-VPS Node-only target.
