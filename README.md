# KolektaPOS

Private, self-hosted, single-booth POS for Revota + 10 co-owners running shared TCG Sales booths at Indonesian conventions. **Local-first PWA** (React + Vite + Dexie) backed by a **Fastify + SQLite** sync server. Not multi-tenant, not a product — 11 known users, one booth, one purpose.

## Status

MVP-complete + hardened. Full cashier happy-path (login → scan → cart → pay → receipt), admin tools (users, events, oversold queue, cash reconciliation, audit log), daily/monthly/settlement reports, offline-capable sync, backups, and 60 passing tests across 14 files. See [`docs/progress/`](docs/progress/) for per-milestone and per-hardening-phase reports.

## Quick start

Prereqs: Node ≥ 22 (see `.nvmrc`), pnpm ≥ 10.

```bash
pnpm install

cp .env.example .env
# Fill SESSION_SECRET (openssl rand -hex 32), ADMIN_EMAIL, ADMIN_PASSWORD.

pnpm dev          # web on :5173 (vite), api on :3001
pnpm test         # full test suite (60 tests, 14 files)
pnpm typecheck    # all 3 workspaces
pnpm build        # api → dist/, web → PWA bundle
```

The API auto-runs migrations + conditionally seeds an admin on startup. OpenAPI UI is mounted at `http://localhost:3001/docs/api`.

## Docs

- [`docs/INDEX.md`](docs/INDEX.md) — **start here.** Agent-facing map of every document.
- [`docs/01-prd.md`](docs/01-prd.md) — consolidated PRD v1.0.
- [`docs/02-implementation-plan.md`](docs/02-implementation-plan.md) — milestone-by-milestone build plan.
- [`docs/03-runbook.md`](docs/03-runbook.md) — operational runbook (pre-event, day-of, recovery).
- [`docs/data-retention-policy.md`](docs/data-retention-policy.md) — what we store and for how long.
- [`docs/adr/`](docs/adr/) — architecture decision records.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to propose changes.
- [`CLAUDE.md`](CLAUDE.md) — architectural invariants for Claude Code agents.

## Workspace layout

```
apps/
  web/      React 19 + Tailwind 3 + Vite 6 + vite-plugin-pwa (local-first PWA)
  api/      Fastify 5 + better-sqlite3 11 (sync server, session auth)
packages/
  db/       Drizzle schema + migrations + hand-authored SQL triggers
  types/    Zod schemas + inferred TS types (shared monorepo-wide)
  sync/     Sync protocol (push/pull) + conflict resolution rules
  ui/       Reserved for shared shadcn/ui components (empty)
  qr/       Short-ID generator (O-XXXXX format) + QR payload helpers
```

## License

UNLICENSED / proprietary. See [`LICENSE`](LICENSE).
