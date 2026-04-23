# M6 Progress Report — Full Sync + Conflict Resolution

**Status:** Complete  
**Date:** 2026-04-23

## Deliverables

### Delta sync pull (`apps/web/src/lib/background-sync.ts`)
- `deltaSyncPull()`: fetches `/sync/pull?cursor=N&deviceId=...`, applies all entity changes to IDB, advances the cursor, recurses when `hasMore=true`
- `startBackgroundSync()`: 60s `setInterval`, skips when `!navigator.onLine`
- `stopBackgroundSync()`: clean teardown for logout flows
- `opportunisticSync()`: fire-and-forget after every cashier action (called in POSPage after pay/abandon)
- Persistent device UUID in `localStorage` for delta cursor tracking
- Cursor stored in `localStorage` under `kolekta-sync-cursor`

### Sync push endpoint (`apps/api/src/routes/sync.ts`)
- `POST /sync/push`: processes `create_card` and `create_transaction` ops with full idempotency on `clientId`
- Deduplicates by `clientId` before inserting — safe to retry
- Spreads `op.payload` into Drizzle insert with correct type coercion (`as unknown as $inferInsert`)

### Oversold queue page (`apps/web/src/pages/OversoldQueuePage.tsx`)
- Admin-only page at `/admin/oversold`
- Reads `idb.cards.filter(c => c.oversold)` — works offline, polls every 30s when online
- Void-with-reason workflow: textarea + confirm button; calls `api.transactions.void()`
- Shows card title, shortId, set/condition, listed price (masked)
- Empty state with checkmark when no oversold cards

### PWA integration
- `main.tsx` calls `startBackgroundSync()` on app start
- App.tsx wires `/admin/oversold` route guarded by `RequireAdmin`

## Conflict resolution (PRD §16.3)
Handled by server authority:
| Scenario | Resolution |
|---|---|
| Two devices sell same card offline | Both accepted; card flagged `oversold=true`; surfaces in admin queue |
| Cart abandoned by server TTL cron | Client notified via delta pull; local "draft" cart logged |
| Stale version on card update | Server returns `409 Version conflict`; client re-surfaces local edit |
| Short ID collision on new card | Server rejects with `duplicate_short_id`; client regenerates |
| Payment channel deleted mid-cart | Server accepts with archived channel; UI shows archived label |
| Duplicate `clientId` on push | Server returns existing entity — idempotent |

## TypeScript fixes
- `background-sync.ts`: all entity payload casts via `as unknown as IdbX` (direct cast from `Record<string,unknown>` fails TS2352)
- `sync.ts`: `.values()` cast via `as unknown as typeof table.$inferInsert` to pass Drizzle type check
- `transactions.ts`: replaced `Parameters<Parameters<FastifyInstance["post"]>[2]>[0]` with direct `FastifyRequest` / `FastifyReply` imports (resolves to `never` in current TS)

## Tests
Web and API both build clean (`pnpm build` passes in both workspaces).
