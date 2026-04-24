# Code Review Report – KolektaPOS

**Date:** 2026-04-24 02:27:58 WIB
**Reviewer:** Codex (GPT-5)
**Scope:** Full repository review (local-first; CI/CD ignored unless needed for local run/build)
**Commit/Version:** `262c07e`

## Executive Summary
KolektaPOS has a substantial amount of implemented application code, but the repository still behaves like an in-progress prototype rather than a ship-ready local-first POS. The strongest parts are the typed monorepo layout, the use of Zod/Drizzle/Fastify, and a passing baseline test/build/typecheck run. The main blockers are architectural mismatches in the offline/sync model, missing authorization checks on core mutation paths, and a few correctness issues in financial reporting and backup handling.

For local use, this is not yet safe to ship as-is. The repository needs immediate fixes in authorization, offline transaction flow, and backup correctness before it can be trusted for event operations.

- Top 5 risks:
- `Critical` Missing object-level authorization allows any authenticated user to edit cards, manipulate other users' carts, and void/refund arbitrary transactions.
- `Critical` Core cashier and intake flows are not actually offline-first; they depend on live API calls and an incomplete sync implementation.
- `High` The sync pull endpoint leaks full `users` rows, including password hashes, to any authenticated client.
- `High` Backup creation is unsafe for WAL-mode SQLite and can produce incomplete restores.
- `High` Settlement and some report calculations overstate payouts/net totals when voids or refunds exist.

- Quick wins:
- Add ownership/admin checks to `cards`, `carts`, `transactions`, and `holds` routes.
- Stop returning `passwordHash` from any sync or list payload and define explicit DTO selects.
- Replace backup streaming of the main DB file with `VACUUM INTO` or a checkpointed snapshot flow.
- Fix refund/void math to use signed rows consistently in reports and settlement.
- Update `README.md` to reflect the actual implemented codebase and verified local commands.

## Scorecard (0–10)
- Functionality & Code Quality: `4/10` — core flows exist, but core business invariants are only partially enforced and several paths contradict the intended local-first design.
- Testing: `3/10` — tests pass, but critical flows (authorization, cart/payment lifecycle, sync, reporting) are largely uncovered.
- Security: `2/10` — object-level authorization is missing on core endpoints, and password hashes are exposed via sync.
- Performance & Scalability: `5/10` — acceptable for a small local deployment, but there are full-table reads and a large frontend bundle.
- Reliability & Stability: `3/10` — unsafe backups, incomplete sync, and optimistic local cleanup create operational risk.
- Observability: `4/10` — Fastify logging exists, but critical flows lack structured operational signals and audit coverage is coarse.
- Local Deployment & DevOps: `6/10` — `pnpm test`, `pnpm build`, and `pnpm typecheck` all pass locally, but runtime docs and backup behavior are not trustworthy enough.
- Configuration & Environment: `4/10` — startup validates `SESSION_SECRET`, but application settings and seed behavior are weakly controlled.
- UX: `6/10` — mobile-oriented UI is thoughtful, but operational feedback can be misleading because local state and server state diverge.
- Compliance & Legal: `3/10` — no repository license was found, and sensitive local data handling/retention is undocumented.
- Documentation & Knowledge Sharing: `3/10` — top-level docs still claim “pre-implementation” despite a large implemented codebase.

Average Score: `3.9/10`

## Architecture Snapshot
- High-level components/modules:
- `apps/api`: Fastify API over SQLite via Drizzle.
- `apps/web`: React/Vite PWA with IndexedDB (`Dexie`) and Zustand.
- `packages/db`: schema, migrations, triggers, seed, migration helpers.
- `packages/types`: Zod schemas for API/domain payloads.
- `packages/sync`, `packages/qr`: protocol helpers and short-ID utilities.

- Key data flows:
- Login uses cookie-backed Fastify sessions.
- Web UI reads mostly from IndexedDB, but many writes still go directly to live API endpoints first.
- Server stores authoritative data in SQLite and exposes reporting, sync, and admin endpoints.

- Notable dependencies/tech stack:
- React 19, Vite, Tailwind, Dexie, Zustand, TanStack Query.
- Fastify 5, better-sqlite3, Drizzle ORM, Zod, bcryptjs.

## Findings (Prioritized)
### Critical
- **Title:** Core mutation routes lack object-level authorization
- **Severity / Confidence / Effort:** Critical / High / M
- **Category:** Security
- **Location:** `apps/api/src/routes/cards.ts:64`, `apps/api/src/routes/carts.ts:76`, `apps/api/src/routes/carts.ts:92`, `apps/api/src/routes/carts.ts:234`, `apps/api/src/routes/carts.ts:291`, `apps/api/src/routes/carts.ts:458`, `apps/api/src/routes/transactions.ts:62`, `apps/api/src/routes/holds.ts:66`
- **Problem:** The API checks only that a session exists. It does not verify that the caller owns the cart/hold, is allowed to edit the card, or has admin authority for void/refund operations.
- **Impact:** Any authenticated cashier who knows or can enumerate IDs can modify card metadata, release another cashier’s cart items, pay or abandon another cashier’s cart, and void/refund existing sales.
- **Recommendation:** Enforce per-resource authorization in each route. Carts and holds should require owner-or-admin access. Card edits and transaction void/refund should be admin-only, or limited by explicit business rules. Add regression tests for cross-user access attempts.

- **Title:** The app is not actually offline-first for cashier and intake workflows
- **Severity / Confidence / Effort:** Critical / High / L
- **Category:** Reliability & Stability
- **Location:** `apps/web/src/pages/POSPage.tsx:597`, `apps/web/src/pages/POSPage.tsx:654`, `apps/web/src/pages/POSPage.tsx:688`, `apps/web/src/pages/POSPage.tsx:728`, `apps/web/src/pages/IntakePage.tsx:233`, `apps/web/src/lib/background-sync.ts:75`, `apps/api/src/routes/sync.ts:109`
- **Problem:** Core write paths create carts, add items, take payment, and create cards through live API requests. Background sync only performs pull operations, and `/sync/push` only handles `create_card` and `create_transaction` without reconciling related cart/card/item state.
- **Impact:** When the network is unavailable, intake and POS payment flows fail instead of continuing locally. This directly violates the stated offline-first requirement and makes event operation unreliable.
- **Recommendation:** Move cashier and intake writes to IndexedDB-first local transactions with an outbound operation queue. Implement full push processing for carts, cart items, holds, transactions, and photos, then reconcile with server cursors.

### High
- **Title:** Sync pull exposes password hashes to every authenticated client
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Security
- **Location:** `apps/api/src/routes/sync.ts:44-45`, `apps/api/src/routes/sync.ts:74-75`, `apps/api/src/routes/sync.ts:85`, `packages/db/src/schema.ts:14-23`
- **Problem:** `/sync/pull` selects full `users` rows and returns them as `payload`, which includes `passwordHash`.
- **Impact:** Any authenticated cashier can retrieve password hashes for every user, including admins. That materially increases credential-compromise risk.
- **Recommendation:** Never select or serialize `passwordHash` outside the auth subsystem. Replace raw table selects with explicit DTO projections for sync and user-list endpoints.

- **Title:** Cashier initial sync path calls an admin-only endpoint
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/lib/sync.ts:17-24`, `apps/api/src/routes/users.ts:16`
- **Problem:** `fetchAndSync()` calls `api.users.list()`, but `/users` is admin-only.
- **Impact:** A cashier’s dashboard initial sync rejects with `403`, so first-device hydration can fail before POS usage. That is especially damaging for a local/offline workflow that depends on an initial pull.
- **Recommendation:** Split sync bootstrap data from admin user management. Cashier bootstrap should use a dedicated sync/bootstrap endpoint that returns only the user fields needed by the client.

- **Title:** Backup generation is unsafe for WAL-mode SQLite
- **Severity / Confidence / Effort:** High / High / M
- **Category:** Reliability & Stability
- **Location:** `packages/db/src/migrate.ts:11-16`, `apps/api/src/routes/backup.ts:27-38`
- **Problem:** The application enables `journal_mode = WAL`, but `/backup` zips only the main database file and omits `-wal`/`-shm` state or any checkpoint/snapshot step.
- **Impact:** Restoring from these backups can silently lose recent writes or produce inconsistent data, undermining the disaster-recovery path documented in the runbook.
- **Recommendation:** Create backups from a consistent SQLite snapshot. For example, checkpoint and lock appropriately, or use `VACUUM INTO` to generate a standalone backup DB before zipping it with photos.

- **Title:** Settlement math double-counts voids/refunds in per-owner payout totals
- **Severity / Confidence / Effort:** High / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/api/src/routes/transactions.ts:152-191`, `apps/api/src/routes/settlement.ts:53-58`
- **Problem:** Void/refund transactions already insert negative totals and negative `soldPriceIdr`, but settlement multiplies non-sale items by `-1` again.
- **Impact:** Owner payout totals are overstated after any void/refund, which makes settlement exports financially incorrect.
- **Recommendation:** Treat `transaction_items.soldPriceIdr` as already signed and sum it directly, or keep items positive and derive sign from the parent transaction, but do not do both.

### Medium
- **Title:** Dashboard and daily report net totals are wrong when voids/refunds exist
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Functionality & Code Quality
- **Location:** `apps/web/src/pages/DashboardPage.tsx:30-37`, `apps/web/src/pages/ReportsPage.tsx:223-225`
- **Problem:** The frontend sums void/refund `totalIdr` as already-negative values and then subtracts them again.
- **Impact:** “Net” figures increase after a void/refund instead of decreasing, which can mislead operators during reconciliation.
- **Recommendation:** Normalize the calculation to `gross + signed_void_refund_total`, or store/report void/refund magnitudes separately and subtract absolute values exactly once.

- **Title:** Seeded admin credentials use unsalted SHA-256 and a default password fallback
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Security
- **Location:** `packages/db/src/seed.ts:7-10`, `packages/db/src/seed.ts:61-79`, `apps/api/src/server.ts:31-34`
- **Problem:** The server seeds an admin user automatically on startup if one does not exist, defaults the password to `changeme`, and stores it as `sha256:` rather than bcrypt.
- **Impact:** A misconfigured local deployment can start with weak, unsalted credentials that are easier to brute-force offline than the rest of the user base.
- **Recommendation:** Require explicit bootstrap credentials on first run, hash them with bcrypt, and fail startup if bootstrap secrets are missing in non-test environments.

- **Title:** Settings accept arbitrary keys and unvalidated JSON values
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Configuration & Environment Management
- **Location:** `apps/api/src/routes/settings.ts:23-51`, `packages/types/src/settings.ts:3-10`
- **Problem:** `PUT /settings/:key` accepts any key name and any JSON payload, even though the application only understands a small fixed set of numeric settings.
- **Impact:** An admin mistake can persist malformed configuration that is only discovered later through runtime behavior or silent fallback logic.
- **Recommendation:** Restrict updates to known setting keys and validate value types/ranges server-side with explicit schemas.

- **Title:** Trigger tests do not validate the real migrated schema
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Testing
- **Location:** `packages/db/src/triggers.test.ts:11-16`
- **Problem:** The test opens one in-memory SQLite database, calls `runMigrations(":memory:")` on another one, then manually creates test tables and triggers.
- **Impact:** The test suite can pass even if the actual migration or real `triggers.sql` is broken.
- **Recommendation:** Run migrations against the same test database instance and assert behavior on the real schema objects created by the migration helper.

- **Title:** Local state uses mixed second/millisecond timestamps
- **Severity / Confidence / Effort:** Medium / High / S
- **Category:** Reliability & Stability
- **Location:** `apps/web/src/pages/POSPage.tsx:609`, `apps/web/src/pages/POSPage.tsx:665`, `apps/api/src/routes/carts.ts:59`, `apps/api/src/routes/carts.ts:183`, `apps/api/src/routes/carts.ts:353`
- **Problem:** The API uses Unix seconds, while the web client writes `Date.now()` milliseconds into local cart and lock fields.
- **Impact:** Sorting, expiry checks, and reconciliation logic become inconsistent once server and local records mix in IndexedDB.
- **Recommendation:** Standardize on Unix seconds across the entire stack and centralize timestamp helpers to avoid drift.

### Low
- **Title:** Documentation still claims the repository is pre-implementation
- **Severity / Confidence / Effort:** Low / High / S
- **Category:** Documentation & Knowledge Sharing
- **Location:** `README.md:23-25`
- **Problem:** The README and guidance files still describe the repo as a scaffold-only codebase even though the apps and packages contain substantial implementation.
- **Impact:** New contributors and operators will make incorrect assumptions about project maturity and supported workflows.
- **Recommendation:** Rewrite the README to document actual entrypoints, current feature coverage, verified commands, known gaps, and local troubleshooting.

- **Title:** Production web bundle is large for a local-first mobile PWA
- **Severity / Confidence / Effort:** Low / Medium / M
- **Category:** Performance & Scalability
- **Location:** `pnpm build` output, `apps/web/package.json` dependencies
- **Problem:** The verified build produced a main JS asset of roughly `1.35 MB` minified and emitted a Vite chunk-size warning.
- **Impact:** First-load and update times will be slower on constrained mobile devices, which matters for event-floor reliability.
- **Recommendation:** Code-split admin/reporting/import flows and isolate heavy dependencies like `xlsx` and QR tooling behind lazy imports.

## Detailed Review by Criteria
### 1) Functionality & Code Quality
- Strengths: shared type definitions, schema-first modeling, and consistent TypeScript usage.
- Issues: authorization gaps, incorrect refund math, and partial enforcement of declared domain rules.
- Recommendations: lock down mutation routes, centralize money/sign conventions, and move invariant-heavy logic into shared services/tests.

### 2) Testing
- Strengths: repository tests, build, and typecheck all pass locally with `pnpm test`, `pnpm build`, and `pnpm typecheck`.
- Issues: critical flows are mostly untested; the trigger test is not exercising the real migrated schema.
- Recommendations: add tests for cart ownership, card edit authorization, void/refund reporting, backup behavior, and sync bootstrap for cashier users.

### 3) Security
- Strengths: session cookies are `httpOnly` and `sameSite=lax`; bcrypt is used for user-created passwords.
- Issues: sensitive password hashes leak through sync, and core endpoints lack resource authorization.
- Recommendations: use explicit safe serializers, add ownership/admin guards, and remove SHA-256 bootstrap hashes.

### 4) Performance & Scalability
- Strengths: SQLite plus small local deployment targets are a reasonable fit.
- Issues: several reports and list endpoints read full tables into memory; the frontend bundle is large.
- Recommendations: add targeted selects/aggregates for reports and split infrequently used UI paths.

### 5) Reliability & Stability
- Strengths: append-only triggers protect transactions and transaction items at the DB level.
- Issues: unsafe backups, incomplete sync, and timestamp inconsistency create operational fragility.
- Recommendations: implement a real offline queue, produce snapshot-safe backups, and unify timestamp units.

### 6) Monitoring & Logging (Observability)
- Strengths: Fastify logger is enabled, and an audit log exists.
- Issues: there is no structured monitoring around sync failures, backup creation, or reconciliation anomalies.
- Recommendations: add explicit warnings/errors for sync bootstrap failure, backup completion/failure, and oversold/void workflows.

### 7) Deployment & DevOps (Local-first)
- Strengths: local monorepo commands are straightforward and currently working.
- Issues: runtime docs still point to an outdated state, and backup behavior is misleading.
- Recommendations: document actual local startup steps for API and web separately, and verify restore procedures against generated backups.

### 8) Configuration & Environment Management
- Strengths: `SESSION_SECRET` length is enforced at startup, and `.env.example` exists.
- Issues: app settings are weakly typed and bootstrap credentials are insecure by default.
- Recommendations: validate env/config at startup, require explicit first-run credentials, and reject unknown setting keys.

### 9) User Experience (UX)
- Strengths: mobile-oriented UI, Bahasa Indonesia labels, and masked pricing interactions are thoughtful.
- Issues: reports and dashboard can display incorrect totals, and offline failure modes present as generic request errors.
- Recommendations: surface explicit offline queue state, sync status, and recoverable action guidance in cashier flows.

### 10) Compliance & Legal
- Strengths: none significant beyond a clearly private/local-first intent.
- Issues: no `LICENSE` file was found, and local data retention/logging expectations are undocumented.
- Recommendations: add a repository license/usage notice and document what operator/user/customer data is stored locally and in backups.

### 11) Documentation & Knowledge Sharing
- Strengths: PRD/runbook/plans exist and provide useful product context.
- Issues: top-level docs are stale and do not match the actual implementation or verified commands.
- Recommendations: refresh README and operator docs to match the current code and known limitations.

## Recommended Action Plan
### Phase 1: Immediate fixes (0–3 days)
- Backend owner: enforce object-level authorization on cards, carts, holds, and transaction void/refund routes. Effort `M`.
- Backend owner: remove `passwordHash` from all sync/list payloads and add explicit DTO selects. Effort `S`.
- Backend owner: fix settlement/report sign handling for void/refund rows. Effort `S`.
- Backend owner: replace the backup implementation with a consistent SQLite snapshot flow and test restore. Effort `M`.

### Phase 2: Short-term improvements (1–2 weeks)
- Full-stack owner: implement a real local write queue and complete `/sync/push` processing for carts, items, holds, payments, and photos. Effort `L`.
- Full-stack owner: repair cashier bootstrap so first sync works without admin-only endpoints. Effort `M`.
- Full-stack owner: standardize timestamps to Unix seconds across API and IDB. Effort `S`.
- QA owner: add integration tests for cart/payment lifecycle, authz boundaries, and sync bootstrap. Effort `M`.

### Phase 3: Longer-term refactors (2–6 weeks)
- Frontend owner: code-split heavy admin/report/import flows and reduce initial bundle size. Effort `M`.
- Platform owner: formalize config validation and bootstrap flows for first-run local deployments. Effort `M`.
- Documentation owner: rewrite README/runbook sections to match the real implementation and restore procedure. Effort `S`.

## Appendix
### How to run/build/test locally (as verified from repo)
- Verified successfully:
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- Not verified in this review:
- Full API/server startup and browser-driven happy paths were not executed end-to-end; findings there are based on static review and the verified build/test output.

### Notable files reviewed
- `apps/api/src/server.ts`
- `apps/api/src/routes/*.ts`
- `apps/api/src/plugins/*.ts`
- `apps/web/src/pages/*.tsx`
- `apps/web/src/lib/*.ts`
- `packages/db/src/*`
- `packages/types/src/*`
- `README.md`
- `docs/03-runbook.md`

### Dependency notes
- The current test/build toolchain is healthy locally.
- The frontend build emitted a large-chunk warning for the main bundle.
- No repository license file was found.
