# KolektaPOS

Private, self-hosted, single-booth POS for TCG Sales conventions. Local-first PWA + Fastify sync server.

- [`docs/INDEX.md`](docs/INDEX.md) — **start here.** Agent-facing map of every document with a recommended default per topic.
- [`docs/01-prd.md`](docs/01-prd.md) — consolidated PRD (v1.0).
- [`docs/02-implementation-plan.md`](docs/02-implementation-plan.md) — milestone-by-milestone build plan.
- [`docs/03-runbook.md`](docs/03-runbook.md) — operational runbook for the first event.
- [`CLAUDE.md`](CLAUDE.md) — architectural invariants for Claude Code.

## Workspace layout

```
apps/
  web/      React + Tailwind + Vite + vite-plugin-pwa (local-first PWA)
  api/      Fastify + better-sqlite3 (sync server)
packages/
  db/       Drizzle schema + migrations
  types/    Zod schemas + inferred TS types
  sync/     Sync protocol + conflict resolution
  ui/       Shared Tailwind + shadcn/ui components
  qr/       Short ID gen + QR payload helpers
```

## Status

Pre-implementation. Monorepo scaffold only; no source code yet. Next step per PRD §17: Drizzle schema + migrations for §6 tables.

## Requirements

- Node >= 22
- pnpm >= 10
