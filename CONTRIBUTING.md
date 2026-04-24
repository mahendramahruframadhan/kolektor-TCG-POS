# Contributing

This is a private codebase for Revota + 10 co-owners. These notes cover how to propose changes without stepping on invariants.

## Before you touch code

1. Read [`CLAUDE.md`](CLAUDE.md) — the non-negotiable architectural rules (append-only transactions, settlement snapshot rule, bottom-price masking, etc.). Violating one requires re-opening scope, not a local fix.
2. Check [`docs/01-prd.md`](docs/01-prd.md) §13 (feature phasing) before adding something. "Let's add X" is often a scope discussion, not a PR.
3. For any decision that affects architecture (ORM, session strategy, auth algorithm, business-rule policy), add an ADR to [`docs/adr/`](docs/adr/) — the existing entries show the format.

## Branch & commit

- Branch off `main` (or the current feature branch if coordinated).
- Keep commits small and atomic. One concern per commit. Prefer multiple focused commits over one "batch" commit.
- Commit messages: emoji + short subject + optional body. Examples in `git log --oneline`. Common prefixes: `⚖️` compliance, `📚` docs, `👁️` observability, `⚡` perf, `🔧` config, `♿` a11y, `🐛` bug fix, `✨` feature, `🧹` cleanup, `🏷️` refactor.
- **Never** commit `.env`, database files, or secrets. `.gitignore` covers the defaults.
- **Never** skip git hooks (`--no-verify`). If a hook fails, fix the root cause.

## Pre-commit checklist

- `pnpm typecheck` green across all 3 workspaces.
- `pnpm test` green — 60/14 as of 2026-04-24.
- `pnpm build` green (the PWA build exercises Workbox caching, which is load-bearing for offline).
- If you changed a route, update the matching test seed in `apps/api/src/routes/*.test.ts`.
- If you changed the Drizzle schema, run `pnpm --filter @kolektapos/db drizzle-kit generate` and commit the migration SQL alongside your change.
- If you changed user-facing UI text, check it's Bahasa Indonesia for cashier-facing screens (PRD invariant #11).

## Testing discipline

- Prefer real integration tests over mocks. We use an in-memory SQLite with the real Drizzle migrations applied (see `apps/api/src/test-migrations.ts`).
- Do not mock the database in tests.
- Tests live next to the code they exercise: `foo.ts` → `foo.test.ts`.

## Security

- Every new mutating route must use `requireAuth` + an explicit ownership-or-admin check. See `apps/api/src/plugins/auth-guard.ts`.
- Every new form input must have a label associated via `htmlFor` / `useId`. We hold AA WCAG compliance — see [`docs/reviews/a11y/2026-04-24-implementation-report.md`](docs/reviews/a11y/2026-04-24-implementation-report.md).
- Every new env var must be declared in `apps/api/src/config.ts` (Zod-validated at boot) and mirrored in `.env.example`.
- Every new payload from the client in `/sync/push` must be parsed by a `.strict()` Zod schema. No raw spreads into `db.insert(...).values(...)`.

## Dependencies

- Lockfile is `pnpm-lock.yaml`; always commit it when adding/bumping.
- `better-sqlite3` is native — stays in `pnpm.onlyBuiltDependencies`.
- Avoid adding heavy dependencies to `apps/web` without dynamic import (bundle size matters on convention-hall Wi-Fi).

## Reviews

- Code changes merged to `main` go through at least one reviewer.
- For larger features, write a plan under `docs/plans/YYYY-MM-DD-<slug>.md` first and request review on the plan before implementation.
- Frozen artefacts under `docs/progress/` and `docs/reviews/` are not edited after initial commit — create a new dated artefact instead.

## Questions

Open an issue or ping the group chat. Because this is a closed 11-user team, there's no public issue tracker.
