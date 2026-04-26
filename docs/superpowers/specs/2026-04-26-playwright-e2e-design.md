# Playwright E2E Test Suite — Design Spec

**Date:** 2026-04-26
**Scope:** Option B — core happy paths + offline resilience
**Status:** Approved, ready for implementation

---

## 1. Goals

Add E2E coverage for the scenarios that matter most at a live TCG convention event:

1. Login gate works (valid + invalid credentials)
2. Online POS sale completes end-to-end and produces a receipt
3. Offline sale is queued in IDB, flushes to the server on reconnect, and is verifiable via API — the highest-risk scenario with zero prior test coverage
4. Admin void restores card availability

Unit tests (Vitest) cover component behaviour and API route logic. Playwright covers the integrated browser ↔ IDB ↔ API path that unit tests cannot reach.

---

## 2. Architecture

### 2.1 Directory layout

```
apps/web/
  playwright.config.ts         # Playwright root config
  e2e/
    globalSetup.ts             # Boot API + migrate + seed test DB
    globalTeardown.ts          # Close API server, delete test.db
    fixtures.ts                # Extended test object with loggedInPage fixture
    helpers/
      login.ts                 # login(page, email, password)
      pos.ts                   # scanCard, addToCart, payWithCash
      sync.ts                  # waitForSync, forceOffline, goOnline
    auth.spec.ts
    pos-online.spec.ts
    pos-offline.spec.ts
    void.spec.ts
```

### 2.2 Server lifecycle

| Server | How started | Config |
|---|---|---|
| Fastify API | `globalSetup.ts` — imports `build()` from `apps/api/src/server.ts` | `TEST_DATABASE_PATH=apps/web/e2e/test.db`, `PORT=3001`, `NODE_ENV=test`, `ADMIN_EMAIL`/`ADMIN_PASSWORD` set to fixture values, `SESSION_SECRET` set to a fixed 64-char test secret |
| Vite dev server | `playwright.config.ts` `webServer` block — `pnpm --filter @kolektapos/web dev` | Port 5173, reuse if already running |

The Vite proxy already rewrites `/api/*` → `http://localhost:3001/*`, so no Playwright route interception is needed.

### 2.3 Playwright config highlights

```ts
// apps/web/playwright.config.ts
{
  testDir: './e2e',
  fullyParallel: false,      // tests share one DB — must run serially
  retries: 1,                // one retry on flake
  timeout: 30_000,           // 30 s per test (sync can be slow)
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: 'pnpm --filter @kolektapos/web dev',
    port: 5173,
    reuseExistingServer: true,
  },
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
}
```

---

## 3. Test Fixtures

`globalSetup.ts` seeds the following records directly via Drizzle (no HTTP). All IDs are deterministic so re-runs are idempotent.

| Fixture | Detail |
|---|---|
| **Admin user** | email: `e2e@kolekta.id`, password: `E2ePass123!` (bcrypt cost 10 for speed), role: `admin`, displayName: `"E2E Tester"` |
| **Active event** | name: `"E2E Event"`, status: `"active"` |
| **Fixed-price card** | shortId: `0-TEST1`, title: `"Pikachu Base Set"`, category: `"Pokemon TCG"`, pricingMode: `"fixed"`, priceIdr: `100000`, owner: admin user. Used in `pos-online.spec.ts`. |
| **Negotiable card** | shortId: `0-TEST2`, title: `"Charizard Holo"`, category: `"Pokemon TCG"`, pricingMode: `"negotiable"`, listedPriceIdr: `500000`, bottomPriceIdr: `300000`, owner: admin user. Used in `pos-offline.spec.ts`. |
| **Void test card** | shortId: `0-TEST3`, title: `"Snorlax Holo"`, category: `"Pokemon TCG"`, pricingMode: `"fixed"`, priceIdr: `75000`, owner: admin user. Reserved for `void.spec.ts` — `0-TEST1` is already sold after the online test. |
| **Payment channels** | Seeded by `packages/db/src/seed.ts` (Cash IDR, GoPay, QRIS, etc.) |
| **Settings** | Seeded by `packages/db/src/seed.ts` (max discounts, cart TTL, landing page) |

Deterministic UUIDs are hardcoded constants in `e2e/fixtures/constants.ts`, exported so test files can reference them directly:

```ts
export const E2E_ADMIN_ID    = "e2e00000-0000-0000-0000-000000000001";
export const E2E_EVENT_ID    = "e2e00000-0000-0000-0000-000000000002";
export const E2E_CARD1_ID    = "e2e00000-0000-0000-0000-000000000003"; // 0-TEST1 fixed-price
export const E2E_CARD2_ID    = "e2e00000-0000-0000-0000-000000000004"; // 0-TEST2 negotiable
export const E2E_CARD3_ID    = "e2e00000-0000-0000-0000-000000000005"; // 0-TEST3 for void test
export const E2E_ADMIN_EMAIL = "e2e@kolekta.id";
export const E2E_ADMIN_PASS  = "E2ePass123!";
```

A third card `0-TEST3` (`"Snorlax Holo"`, fixed, `priceIdr: 75000`) is reserved for `void.spec.ts` so it starts as `available` after `pos-online.spec.ts` sells `0-TEST1`.

**globalSetup strategy:** `apps/api/src/server.ts` does not export `build()` separately (it calls `app.listen()` inline). Rather than refactoring the production entrypoint, `globalSetup.ts` starts the API as a **child process** using `spawn`:

```ts
const apiProcess = spawn("node", ["--import", "tsx/esm", "src/server.ts"], {
  cwd: resolve(__dirname, "../../../apps/api"),
  env: { ...process.env, DATABASE_PATH: testDbPath, PORT: "3001", NODE_ENV: "test", ... },
  stdio: "pipe",
});
// Wait for "Server listening" in stdout before proceeding
```

`globalTeardown.ts` sends `SIGTERM` to `apiProcess` and deletes `e2e/test.db`.

### storageState / loggedInPage fixture

`fixtures.ts` extends Playwright's `test` with a `loggedInPage` fixture that:
1. Logs in via the UI once (first use per worker)
2. Saves `storageState` (cookies + localStorage) to `e2e/.auth/admin.json`
3. Subsequent tests load that state — no re-login overhead

---

## 4. Test Scenarios

### 4.1 `auth.spec.ts`

**Test 1 — valid credentials**
- Navigate to `/login`
- Fill email (`e2e@kolekta.id`) and password (`E2ePass123!`)
- Click "Masuk dengan Email"
- Assert URL becomes `/pos`

**Test 2 — invalid credentials**
- Navigate to `/login`
- Fill correct email, wrong password (`wrong`)
- Click "Masuk dengan Email"
- Assert error message is visible (red box, Bahasa Indonesia text)
- Assert URL remains `/login`

### 4.2 `pos-online.spec.ts`

**Test 3 — fixed-price online sale**

Pre-condition: logged in, `0-TEST1` card available in IDB (synced via `resetAndSync` on login).

Steps:
1. Navigate to `/pos`
2. Wait for SyncDot to reach idle state (green / no error)
3. Focus scan input, type `0-TEST1`, press Enter
4. Assert card panel shows `"Pikachu Base Set"` and status badge `"Tersedia"`
5. Click "Tambah ke Keranjang"
6. Assert cart panel shows `"Rp 100.000"` line total
7. Click "Bayar"
8. Assert payment modal opens (title "Pembayaran")
9. Select "Cash IDR" payment channel
10. Click "Total" quick-amount button
11. Click "Bayar" confirm button
12. Assert receipt modal visible — contains transaction ID (8-char uppercase hex)
13. `page.request.get('/api/transactions?eventId=' + E2E_EVENT_ID)` — assert response contains a transaction with `totalIdr: 100000`

### 4.3 `pos-offline.spec.ts` ⭐ (core Option B scenario)

**Test 4 — offline sale flushes on reconnect**

Pre-condition: logged in, `0-TEST2` card synced to IDB.

Steps:
1. Navigate to `/pos`
2. `waitForSync(page)` — wait for SyncDot green (confirms initial IDB pull complete)
3. `forceOffline(page)` — click NetworkModeToggle → select "Offline (paksa)"
4. Assert offline banner visible
5. Focus scan input, type `0-TEST2`, press Enter
6. Assert card panel shows `"Charizard Holo"` and price `"Rp 500.000"`
7. Clear the final-price input and type `400000` (above bottomPriceIdr)
8. Click "Tambah ke Keranjang"
9. Assert cart shows `"Rp 400.000"`
10. Click "Bayar"
11. Select "Cash IDR"
12. Click "Total"
13. Click "Bayar"
14. Assert receipt modal shows offline warning: `"Tersimpan lokal"`
15. Assert SyncDot shows pending badge ≥ 1
16. `goOnline(page)` — click NetworkModeToggle → select "Auto"
17. `waitForSync(page)` — wait for SyncDot to clear pending badge (poll up to 15 s)
18. `page.request.get('/api/transactions?eventId=' + E2E_EVENT_ID)` — assert transaction row with `totalIdr: 400000` exists
19. `page.request.get('/api/cards/' + E2E_CARD2_ID)` — assert `status: "sold"`

### 4.4 `void.spec.ts`

**Test 5 — admin void restores card**

Pre-condition: logged in as admin. Uses `0-TEST3` (reserved — not sold by any other test).

Steps:
1. Complete a sale for `0-TEST3` using `scanCard` + `addToCart` + `payWithCash(page)` helpers
2. Extract transaction ID from receipt modal (via `data-testid="receipt-tx-id"`)
3. Close receipt, navigate to `/transactions/<id>`
4. Click "Void" button
5. Fill reason input: `"E2E test void"`
6. Confirm void
7. Assert success toast or page update
8. `page.request.get('/api/cards/' + E2E_CARD3_ID)` — assert `status: "available"`

---

## 5. Page-Object Helpers

All helpers live in `e2e/helpers/` and accept a `page: Page` argument.

### `login.ts`
```ts
export async function login(page: Page, email: string, password: string): Promise<void>
```
Fills form by label text (robust to generated IDs), submits, waits for `/pos`.

### `pos.ts`
```ts
export async function scanCard(page: Page, shortId: string): Promise<void>
// Types shortId into scan input, presses Enter, waits for card panel

export async function addToCart(page: Page, finalPriceIdr?: number): Promise<void>
// Optionally sets negotiable price, clicks "Tambah ke Keranjang", waits for cart update

export async function payWithCash(page: Page): Promise<string>
// Opens payment modal, selects Cash IDR, clicks Total, pays — returns transaction ID
```

### `sync.ts`
```ts
export async function waitForSync(page: Page, timeoutMs = 15_000): Promise<void>
// Polls SyncDot aria-label until it indicates idle (no pending, no error)

export async function forceOffline(page: Page): Promise<void>
// Clicks NetworkModeToggle, selects offline mode, waits for offline banner

export async function goOnline(page: Page): Promise<void>
// Clicks NetworkModeToggle, selects auto mode, waits for offline banner to disappear
```

---

## 6. Selector Strategy

Prefer semantic selectors in this order:
1. `getByRole` + accessible name (most robust)
2. `getByLabel` / `getByPlaceholder` (forms)
3. `getByText` (Bahasa Indonesia strings)
4. `data-testid` attribute (add sparingly, only where no semantic selector works)

Target strings that are stable: Bahasa Indonesia UI text (`"Masuk dengan Email"`, `"Tambah ke Keranjang"`, `"Bayar"`, `"Tersimpan lokal"`) rather than CSS classes that change during refactoring.

`data-testid` additions needed in production code (minimal list):
- `data-testid="scan-input"` on the scan field in `POSPage.tsx`
- `data-testid="sync-dot"` on `SyncDot` component (for polling its aria-label)
- `data-testid="network-mode-toggle"` on `NetworkModeToggle` button
- `data-testid="receipt-tx-id"` on the transaction ID span in the receipt modal

---

## 7. Dependencies to Add

```bash
# In apps/web (devDependencies)
pnpm --filter @kolektapos/web add -D @playwright/test

# Install browsers
pnpm --filter @kolektapos/web exec playwright install chromium
```

Add to `apps/web/package.json` scripts:
```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:headed": "playwright test --headed"
```

Add to root `package.json` scripts:
```json
"e2e": "pnpm --filter @kolektapos/web e2e"
```

---

## 8. CI / pnpm test integration

Playwright tests are intentionally **not** wired into `pnpm test` (which runs Vitest unit tests). They require live servers and are slower. Run separately with `pnpm e2e`. A future CI step can add `pnpm e2e` as a separate job after `pnpm build`.

---

## 9. Out of Scope

- Multiple browsers (Safari, Firefox) — booth uses Chrome/Chromium only
- Mobile viewport — booth uses tablet landscape; Playwright `Desktop Chrome` covers this
- Settlement report assertion — the offline flush verifies the transaction exists; full settlement math is covered by the `settlement.test.ts` API unit test
- Visual regression / screenshot diffing
- Performance / load testing
