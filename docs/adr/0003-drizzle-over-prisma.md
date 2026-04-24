# ADR-0003: Drizzle ORM over Prisma (for now)

**Status:** Accepted · 2026-04-24

## Context

We need a TypeScript-first ORM on top of SQLite that:

1. Generates and applies migrations we can audit.
2. Lets us write hand-authored SQL triggers for our append-only invariants (`transactions`, `transaction_items`, `audit_log`).
3. Plays well with `better-sqlite3`'s synchronous API (simpler transaction semantics for a single-node write path).
4. Produces inferred TS types usable by Zod schemas in `packages/types`.

## Decision

Use **Drizzle ORM 0.38** with `drizzle-orm/better-sqlite3` and `drizzle-kit` for migration generation.

- Schema in `packages/db/src/schema.ts`.
- Migrations in `packages/db/drizzle/*.sql` (hand-editable when needed).
- Triggers in `packages/db/src/triggers.sql`, applied after migrations in `runMigrations()`.
- Test fixtures load the real migrations via `apps/api/src/test-migrations.ts`.

## Consequences

- Schema + migrations + triggers are all plain SQL — auditable, no magic.
- Synchronous DB calls match the better-sqlite3 model and keep our test harness simple.
- `drizzle-kit generate` emits a `meta/*.snapshot.json` that we commit — manual migrations must keep the snapshot consistent or the next generate will diff.

## Alternatives considered

- **Prisma.** Rejected at the time we evaluated because: (a) Prisma's SQLite client was async only, forcing us to rewrite the 14 route handlers around `await`; (b) Prisma migrations don't co-locate hand-authored triggers — they'd have to live as a separate `prisma/migrations/manual/*.sql` convention; (c) the generated Prisma client runs in a sidecar process via the binary query engine, which complicates bundling and cold-start on a single VPS. A Prisma migration plan can be written in the future if ergonomics change; this ADR is superseded when that happens.
- **Raw better-sqlite3 + hand-rolled query builders.** Rejected — loses type inference we share with Zod.
- **Kysely.** Reasonable alternative; Drizzle won because its schema DSL composes with Zod inference more directly.

## Revisited

(empty — first statement of this decision)
