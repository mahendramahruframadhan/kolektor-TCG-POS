# KolektaPOS

Private, self-hosted, single-booth POS for Pokémon TCG conventions. Local-first PWA + Fastify sync server.

See [`docs/kolektapos-prd.md`](docs/kolektapos-prd.md) for the consolidated PRD and [`CLAUDE.md`](CLAUDE.md) for the architectural invariants.

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
