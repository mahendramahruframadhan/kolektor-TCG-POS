# Playwright E2E Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 E2E tests covering login, online POS sale, offline sale → server flush, and admin void via the Oversold Queue.

**Architecture:** Playwright with `globalSetup` that spawns the Fastify API as a child process against a dedicated test SQLite DB, seeds deterministic fixtures, and lets `playwright.config.ts webServer` boot the Vite dev server. Tests run serially (shared DB). Each test does a full login to get a fresh IDB state.

**Tech Stack:** `@playwright/test`, `@kolektapos/db` (Drizzle migrations + seed), `bcryptjs`, `child_process.spawn`, Chromium only.

---

## File Map

**New files (create):**
- `apps/web/playwright.config.ts` — Playwright root config
- `apps/web/e2e/.gitignore` — ignores test.db, test-results/, .auth/
- `apps/web/e2e/fixtures/constants.ts` — all deterministic UUIDs and credentials
- `apps/web/e2e/globalSetup.ts` — spawn API, migrate, seed test fixtures
- `apps/web/e2e/globalTeardown.ts` — kill API process, delete test.db
- `apps/web/e2e/fixtures.ts` — `loggedInPage` Playwright fixture
- `apps/web/e2e/helpers/login.ts` — `login(page, email, password)`
- `apps/web/e2e/helpers/pos.ts` — `scanCard`, `addToCart`, `payWithCash`
- `apps/web/e2e/helpers/sync.ts` — `waitForSync`, `forceOffline`, `goOnline`
- `apps/web/e2e/auth.spec.ts` — 2 login tests
- `apps/web/e2e/pos-online.spec.ts` — 1 online sale test
- `apps/web/e2e/pos-offline.spec.ts` — 1 offline sale → flush test
- `apps/web/e2e/void.spec.ts` — 1 oversold-queue void test

**Modified files:**
- `apps/web/src/pages/POSPage.tsx` — add `data-testid="scan-input"` and `data-testid="receipt-tx-id"`
- `apps/web/src/components/SyncDot.tsx` — add `data-testid="sync-dot"` and richer `aria-label`
- `apps/web/src/components/NetworkModeToggle.tsx` — add `data-testid="network-mode-toggle"`
- `apps/web/package.json` — add `e2e`, `e2e:ui`, `e2e:headed` scripts
- `package.json` (root) — add `e2e` script

---

## Task 1: Install Playwright and wire scripts

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json` (root)
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/.gitignore`

- [ ] **Step 1: Install `@playwright/test` in the web workspace**

```bash
pnpm --filter @kolektapos/web add -D @playwright/test
```

Expected: `@playwright/test` appears in `apps/web/package.json` devDependencies.

- [ ] **Step 2: Install Chromium browser**

```bash
pnpm --filter @kolektapos/web exec playwright install chromium
```

Expected: Chromium downloaded, no errors.

- [ ] **Step 3: Add e2e scripts to `apps/web/package.json`**

In the `"scripts"` section, add:
```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:headed": "playwright test --headed"
```

- [ ] **Step 4: Add root e2e script to root `package.json`**

In the `"scripts"` section, add:
```json
"e2e": "pnpm --filter @kolektapos/web e2e"
```

- [ ] **Step 5: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 1,
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter @kolektapos/web dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  globalSetup: "./e2e/globalSetup.ts",
  globalTeardown: "./e2e/globalTeardown.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "./e2e/test-results",
});
```

- [ ] **Step 6: Create `apps/web/e2e/.gitignore`**

```
test.db
test.db-wal
test.db-shm
test-results/
.auth/
playwright-report/
```

- [ ] **Step 7: Verify config is valid**

```bash
pnpm --filter @kolektapos/web exec playwright --version
```

Expected: prints Playwright version (e.g. `Version 1.x.x`). No errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json package.json apps/web/playwright.config.ts apps/web/e2e/.gitignore pnpm-lock.yaml
git commit -m "🎭 chore(e2e): install Playwright, configure Chromium project and webServer"
```

---

## Task 2: Add `data-testid` attributes to production code

**Files:**
- Modify: `apps/web/src/pages/POSPage.tsx`
- Modify: `apps/web/src/components/SyncDot.tsx`
- Modify: `apps/web/src/components/NetworkModeToggle.tsx`

### 2a: `POSPage.tsx` — scan input

- [ ] **Step 1: Find the scan `<input>` element**

In `apps/web/src/pages/POSPage.tsx`, the scan input has `ref={scanRef}` and `placeholder="O-XXXXX  atau  scan USB"`. It is around line 990. Add `data-testid="scan-input"` to it:

```tsx
<input
  ref={scanRef}
  data-testid="scan-input"
  type="text"
  value={scanInput}
  onChange={(e) => setScanInput(e.target.value.toUpperCase())}
  onKeyDown={handleScanKeyDown}
  placeholder="O-XXXXX  atau  scan USB"
  autoFocus
  autoComplete="off"
  autoCorrect="off"
  spellCheck={false}
  disabled={!activeEvent}
  className="w-full h-14 border-2 border-accent rounded-2xl px-4 text-2xl font-mono font-bold text-center tracking-widest text-fg focus:outline-none focus:ring-2 focus:ring-accent placeholder:text-border placeholder:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
/>
```

### 2b: `POSPage.tsx` — receipt transaction ID

- [ ] **Step 2: Find the transaction ID display in `ReceiptModal`**

In the `ReceiptModal` component (around line 428), find the line that shows the short transaction ID. It renders something like `#${transactionId.slice(0, 8).toUpperCase()}`. Add `data-testid="receipt-tx-id"` to the wrapping element:

```tsx
<p
  data-testid="receipt-tx-id"
  className="text-2xl font-extrabold text-fg tracking-widest font-mono"
>
  #{transactionId.slice(0, 8).toUpperCase()}
</p>
```

Find the exact className by reading the ReceiptModal component (around line 420-435 in the file). The testid goes on the element that shows `#${transactionId.slice(0, 8).toUpperCase()}`.

### 2c: `SyncDot.tsx` — testid and richer aria-label

- [ ] **Step 3: Add `data-testid` and pending-count to the aria-label on the root `<div>`**

In `apps/web/src/components/SyncDot.tsx`, the root `<div>` already has `aria-label`. Extend it to include pending count and add `data-testid`:

Replace:
```tsx
<div
  role="status"
  aria-live="polite"
  aria-label={`Status sinkronisasi: ${titleText}`}
  title={titleText}
  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
  style={{ background: `${color}18`, border: `1px solid ${color}40` }}
>
```

With:
```tsx
<div
  role="status"
  aria-live="polite"
  data-testid="sync-dot"
  data-sync-state={effective}
  data-pending-count={pendingCount}
  aria-label={
    pendingCount > 0
      ? `Sync: ${pendingCount} pending`
      : effective === "error"
      ? `Sync: error`
      : effective === "syncing"
      ? `Sync: syncing`
      : `Sync: online`
  }
  title={titleText}
  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
  style={{ background: `${color}18`, border: `1px solid ${color}40` }}
>
```

The `data-sync-state` and `data-pending-count` attributes give Playwright precise hooks for assertions beyond the aria-label.

### 2d: `NetworkModeToggle.tsx` — testid on the toggle button

- [ ] **Step 4: Add `data-testid` to the toggle button**

In `apps/web/src/components/NetworkModeToggle.tsx`, the `<button>` that toggles the dropdown open/closed currently has `aria-haspopup="listbox"`. Add `data-testid="network-mode-toggle"` to it:

```tsx
<button
  onClick={() => setOpen((o) => !o)}
  data-testid="network-mode-toggle"
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-label={isForceOffline ? "Mode jaringan: Offline" : "Mode jaringan: Auto"}
  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-widest uppercase border transition ${
    isForceOffline
      ? "bg-warning/10 border-warning/40 text-warning"
      : "bg-muted border-border text-muted-fg"
  }`}
>
```

- [ ] **Step 5: Verify typecheck still passes**

```bash
pnpm typecheck
```

Expected: `Tasks: 3 successful`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/POSPage.tsx apps/web/src/components/SyncDot.tsx apps/web/src/components/NetworkModeToggle.tsx
git commit -m "🏷️ test(e2e): add data-testid attributes for Playwright selectors"
```

---

## Task 3: Fixture constants

**Files:**
- Create: `apps/web/e2e/fixtures/constants.ts`

- [ ] **Step 1: Create the constants file**

```ts
// apps/web/e2e/fixtures/constants.ts

/** Deterministic UUIDs for E2E test fixtures. Re-seeded on every globalSetup run. */
export const E2E = {
  // Users
  ADMIN_ID:    "e2e00000-0000-0000-0000-000000000001",
  ADMIN_EMAIL: "e2e@kolekta.id",
  ADMIN_PASS:  "E2ePass123!",

  // Event
  EVENT_ID:    "e2e00000-0000-0000-0000-000000000002",
  EVENT_CID:   "e2e00000-0000-0000-0001-000000000002",

  // Cards
  CARD1_ID:    "e2e00000-0000-0000-0000-000000000003", // 0-TEST1  fixed  Rp 100.000  online test
  CARD1_CID:   "e2e00000-0000-0000-0001-000000000003",
  CARD2_ID:    "e2e00000-0000-0000-0000-000000000004", // 0-TEST2  negotiable  offline test
  CARD2_CID:   "e2e00000-0000-0000-0001-000000000004",
  CARD3_ID:    "e2e00000-0000-0000-0000-000000000005", // 0-TEST3  fixed  pre-oversold  void test
  CARD3_CID:   "e2e00000-0000-0000-0001-000000000005",

  // Pre-seeded sale transactions for TEST3 (creates oversold state)
  TX_A_ID:     "e2e00000-0000-0000-0000-000000000010",
  TX_A_CID:    "e2e00000-0000-0000-0001-000000000010",
  TX_B_ID:     "e2e00000-0000-0000-0000-000000000011",
  TX_B_CID:    "e2e00000-0000-0000-0001-000000000011",

  // Short IDs
  SHORT1:      "0-TEST1",
  SHORT2:      "0-TEST2",
  SHORT3:      "0-TEST3",

  // Prices (integer IDR)
  PRICE1:      100_000,   // TEST1 fixed price
  LISTED2:     500_000,   // TEST2 listed price
  BOTTOM2:     300_000,   // TEST2 bottom price
  PRICE3:       75_000,   // TEST3 fixed price

  // Misc
  SESSION_SECRET: "e2e-test-secret-must-be-at-least-32-characters-long-xxxxxxxxxx",
  API_PORT: 3001,
} as const;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/fixtures/constants.ts
git commit -m "🔑 test(e2e): add deterministic fixture constants"
```

---

## Task 4: globalSetup — migrate, seed, spawn API

**Files:**
- Create: `apps/web/e2e/globalSetup.ts`

- [ ] **Step 1: Create `apps/web/e2e/globalSetup.ts`**

```ts
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { rmSync } from "fs";
import { spawn } from "child_process";
import bcrypt from "bcryptjs";
import { runMigrations, seed } from "@kolektapos/db";
import { users, events, cards, transactions, transactionItems } from "@kolektapos/db/schema";
import { E2E } from "./fixtures/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB  = resolve(__dirname, "test.db");
const REPO_ROOT = resolve(__dirname, "../../../../");
const API_DIR   = resolve(__dirname, "../../api");

export default async function globalSetup() {
  // Clean slate — delete any leftover test DB from a previous crashed run.
  rmSync(TEST_DB, { force: true });
  rmSync(TEST_DB + "-wal", { force: true });
  rmSync(TEST_DB + "-shm", { force: true });

  // 1. Run Drizzle migrations + base seed (payment channels, settings).
  //    Do NOT pass ADMIN_EMAIL/ADMIN_PASSWORD — we insert the admin directly below.
  const { db } = await runMigrations(TEST_DB);
  await seed(db);

  const nowSec = Math.floor(Date.now() / 1000);

  // 2. Admin user with deterministic UUID.
  const passwordHash = await bcrypt.hash(E2E.ADMIN_PASS, 10); // cost 10 for speed
  db.insert(users)
    .values({
      id: E2E.ADMIN_ID,
      email: E2E.ADMIN_EMAIL,
      displayName: "E2E Tester",
      role: "admin",
      passwordHash,
      createdAt: nowSec,
      updatedAt: nowSec,
      version: 1,
    })
    .onConflictDoNothing()
    .run();

  // 3. Active event.
  db.insert(events)
    .values({
      id: E2E.EVENT_ID,
      clientId: E2E.EVENT_CID,
      name: "E2E Event",
      status: "active",
      createdByUserId: E2E.ADMIN_ID,
      createdAt: nowSec,
      updatedAt: nowSec,
      version: 1,
    })
    .onConflictDoNothing()
    .run();

  // 4. Test cards.
  const baseCard = {
    ownerUserId: E2E.ADMIN_ID,
    stockReceivedByUserId: E2E.ADMIN_ID,
    eventId: E2E.EVENT_ID,
    category: "Pokemon TCG",
    setName: "Base Set",
    setNumber: "",
    rarity: "",
    language: "EN" as const,
    edition: "",
    condition: "Near Mint" as const,
    isGraded: false,
    oversold: false,
    lockedByCartId: null,
    lockedByUserId: null,
    lockedAt: null,
    createdAt: nowSec,
    updatedAt: nowSec,
    version: 1,
  };

  db.insert(cards)
    .values([
      {
        ...baseCard,
        id: E2E.CARD1_ID,
        clientId: E2E.CARD1_CID,
        shortId: E2E.SHORT1,
        title: "Pikachu Base Set",
        pricingMode: "fixed" as const,
        priceIdr: E2E.PRICE1,
        status: "available" as const,
      },
      {
        ...baseCard,
        id: E2E.CARD2_ID,
        clientId: E2E.CARD2_CID,
        shortId: E2E.SHORT2,
        title: "Charizard Holo",
        pricingMode: "negotiable" as const,
        listedPriceIdr: E2E.LISTED2,
        bottomPriceIdr: E2E.BOTTOM2,
        status: "available" as const,
      },
      {
        ...baseCard,
        id: E2E.CARD3_ID,
        clientId: E2E.CARD3_CID,
        shortId: E2E.SHORT3,
        title: "Snorlax Holo",
        pricingMode: "fixed" as const,
        priceIdr: E2E.PRICE3,
        // Pre-marked oversold — two sales already in the DB below.
        status: "sold" as const,
        oversold: true,
      },
    ])
    .onConflictDoNothing()
    .run();

  // 5. Two pre-seeded sale transactions for TEST3 — creates the oversold state
  //    that the OversoldQueuePage displays.
  db.insert(transactions)
    .values([
      {
        id: E2E.TX_A_ID,
        clientId: E2E.TX_A_CID,
        cartId: null,
        eventId: E2E.EVENT_ID,
        cashierUserId: E2E.ADMIN_ID,
        kind: "sale" as const,
        subtotalIdr: E2E.PRICE3,
        discountIdr: 0,
        totalIdr: E2E.PRICE3,
        paymentChannelId: null,
        paidAt: nowSec - 120,
        createdAt: nowSec - 120,
        version: 1,
      },
      {
        id: E2E.TX_B_ID,
        clientId: E2E.TX_B_CID,
        cartId: null,
        eventId: E2E.EVENT_ID,
        cashierUserId: E2E.ADMIN_ID,
        kind: "sale" as const,
        subtotalIdr: E2E.PRICE3,
        discountIdr: 0,
        totalIdr: E2E.PRICE3,
        paymentChannelId: null,
        paidAt: nowSec - 60,
        createdAt: nowSec - 60,
        version: 1,
      },
    ])
    .onConflictDoNothing()
    .run();

  db.insert(transactionItems)
    .values([
      {
        id: "e2e00000-0000-0000-0002-000000000010",
        transactionId: E2E.TX_A_ID,
        cardId: E2E.CARD3_ID,
        ownerUserIdSnapshot: E2E.ADMIN_ID,
        listedPriceIdrSnapshot: E2E.PRICE3,
        soldPriceIdr: E2E.PRICE3,
        lineDiscountIdr: 0,
        overrideBelowBottom: false,
        createdAt: nowSec - 120,
      },
      {
        id: "e2e00000-0000-0000-0002-000000000011",
        transactionId: E2E.TX_B_ID,
        cardId: E2E.CARD3_ID,
        ownerUserIdSnapshot: E2E.ADMIN_ID,
        listedPriceIdrSnapshot: E2E.PRICE3,
        soldPriceIdr: E2E.PRICE3,
        lineDiscountIdr: 0,
        overrideBelowBottom: false,
        createdAt: nowSec - 60,
      },
    ])
    .onConflictDoNothing()
    .run();

  // 6. Spawn the API against the test DB.
  const testEnv = {
    ...process.env,
    DATABASE_PATH: TEST_DB,
    PORT: String(E2E.API_PORT),
    HOST: "127.0.0.1",
    SESSION_SECRET: E2E.SESSION_SECRET,
    NODE_ENV: "development",
    // No ADMIN_EMAIL / ADMIN_PASSWORD — we already inserted the admin above.
  };

  const tsxBin = resolve(REPO_ROOT, "node_modules/.bin/tsx");
  const apiProcess = spawn(tsxBin, ["src/server.ts"], {
    cwd: API_DIR,
    env: testEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Store PID so globalTeardown can kill it.
  process.env.__E2E_API_PID = String(apiProcess.pid);

  // 7. Wait for the API to be ready (poll /health).
  await waitForApi(`http://127.0.0.1:${E2E.API_PORT}/health`, 20_000);
}

async function waitForApi(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`API at ${url} did not become ready within ${timeoutMs}ms`);
}
```

> **Note:** If `node_modules/.bin/tsx` doesn't exist at the repo root (pnpm hoisting may vary), fall back to:
> ```ts
> const tsxBin = resolve(API_DIR, "node_modules/.bin/tsx");
> ```
> Check with `ls node_modules/.bin/tsx` at repo root during implementation.

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/globalSetup.ts
git commit -m "🛠️ test(e2e): globalSetup — migrate, seed fixtures, spawn API"
```

---

## Task 5: globalTeardown

**Files:**
- Create: `apps/web/e2e/globalTeardown.ts`

- [ ] **Step 1: Create `apps/web/e2e/globalTeardown.ts`**

```ts
import { rmSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB = resolve(__dirname, "test.db");

export default async function globalTeardown() {
  const pid = process.env.__E2E_API_PID;
  if (pid) {
    try {
      process.kill(Number(pid), "SIGTERM");
      // Give the process 2 s to close gracefully before force-killing.
      await new Promise((r) => setTimeout(r, 2_000));
    } catch {
      // Process may already be gone.
    }
  }

  // Delete test DB and WAL files.
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(TEST_DB + suffix, { force: true });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/globalTeardown.ts
git commit -m "🧹 test(e2e): globalTeardown — kill API process and delete test.db"
```

---

## Task 6: Page-object helpers

**Files:**
- Create: `apps/web/e2e/helpers/login.ts`
- Create: `apps/web/e2e/helpers/pos.ts`
- Create: `apps/web/e2e/helpers/sync.ts`

### 6a: `login.ts`

- [ ] **Step 1: Create `apps/web/e2e/helpers/login.ts`**

```ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Fill the login form and submit. Waits for navigation to /pos.
 * Uses label-based selectors (robust to generated input IDs).
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  // LoginPage uses <label htmlFor={emailId}> — getByLabel is most robust.
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|kata sandi/i).fill(password);
  await page.getByRole("button", { name: /masuk/i }).click();
  await expect(page).toHaveURL("/pos", { timeout: 15_000 });
}
```

### 6b: `pos.ts`

- [ ] **Step 2: Create `apps/web/e2e/helpers/pos.ts`**

```ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Type a shortId into the scan input and press Enter.
 * Waits for the card review panel to appear (card title becomes visible).
 */
export async function scanCard(page: Page, shortId: string): Promise<void> {
  const scanInput = page.getByTestId("scan-input");
  await expect(scanInput).toBeVisible({ timeout: 10_000 });
  await scanInput.click();
  await scanInput.fill(shortId);
  await scanInput.press("Enter");
}

/**
 * Click "Tambah ke Keranjang". If finalPriceIdr is provided, fills the
 * negotiable-price input first. Waits for the cart count to update.
 */
export async function addToCart(page: Page, finalPriceIdr?: number): Promise<void> {
  if (finalPriceIdr !== undefined) {
    // Negotiable card: fill the intended-price input.
    // The input appears after scan inside the card review panel.
    const priceInput = page.getByRole("spinbutton").first();
    await priceInput.clear();
    await priceInput.fill(String(finalPriceIdr));
  }
  await page.getByRole("button", { name: /tambah ke keranjang/i }).click();
  // Wait for the cart panel to reflect the addition (cart section title updates).
  await expect(page.getByText(/keranjang/i)).toBeVisible();
}

/**
 * Open the payment modal, select Cash IDR, click the "Total" quick-amount
 * button, and confirm payment. Returns the 8-char transaction ID shown in
 * the receipt modal.
 */
export async function payWithCash(page: Page): Promise<string> {
  // Open payment modal.
  await page.getByRole("button", { name: /^bayar$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });

  // Select Cash IDR channel (first option in the grid).
  await page.getByRole("button", { name: /cash idr/i }).click();

  // Click the "Total" quick-amount button to auto-fill the tender.
  await page.getByRole("button", { name: /^total$/i }).click();

  // Confirm payment.
  await page.getByRole("button", { name: /^bayar$/i }).last().click();

  // Wait for receipt modal.
  const txIdEl = page.getByTestId("receipt-tx-id");
  await expect(txIdEl).toBeVisible({ timeout: 15_000 });
  return (await txIdEl.textContent() ?? "").replace("#", "");
}
```

### 6c: `sync.ts`

- [ ] **Step 3: Create `apps/web/e2e/helpers/sync.ts`**

```ts
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const SYNC_DOT = '[data-testid="sync-dot"]';
const NETWORK_TOGGLE = '[data-testid="network-mode-toggle"]';

/**
 * Wait until the SyncDot shows aria-label "Sync: online" (no pending
 * transactions, no active sync, no error). Defaults to 20s timeout.
 */
export async function waitForSync(page: Page, timeoutMs = 20_000): Promise<void> {
  await expect(page.locator(SYNC_DOT)).toHaveAttribute(
    "aria-label",
    "Sync: online",
    { timeout: timeoutMs }
  );
}

/**
 * Click NetworkModeToggle and select "Mode Offline" to force offline mode.
 * Waits for the offline banner to appear.
 */
export async function forceOffline(page: Page): Promise<void> {
  await page.locator(NETWORK_TOGGLE).click();
  // Click the "Mode Offline" option in the listbox dropdown.
  await page.getByRole("option", { name: /mode offline/i }).click();
  // Confirm offline banner is visible.
  await expect(page.getByText(/sedang offline|mode offline/i)).toBeVisible({ timeout: 5_000 });
}

/**
 * Click NetworkModeToggle and select "Auto" to restore automatic mode.
 * Waits for the offline banner to disappear.
 */
export async function goOnline(page: Page): Promise<void> {
  await page.locator(NETWORK_TOGGLE).click();
  await page.getByRole("option", { name: /^auto$/i }).click();
  // Offline banner should disappear.
  await expect(page.getByText(/sedang offline|mode offline/i)).toBeHidden({ timeout: 5_000 });
}
```

> **Note on OfflineBanner text:** The exact text in the offline banner should be verified by inspecting `apps/web/src/components/OfflineBanner.tsx` during implementation. Adjust the regex `/sedang offline|mode offline/i` to match the actual string.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/helpers/
git commit -m "🔧 test(e2e): add login, pos, and sync helper functions"
```

---

## Task 7: `fixtures.ts` — loggedInPage

**Files:**
- Create: `apps/web/e2e/fixtures.ts`

- [ ] **Step 1: Create `apps/web/e2e/fixtures.ts`**

```ts
import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login } from "./helpers/login.js";
import { waitForSync } from "./helpers/sync.js";
import { E2E } from "./fixtures/constants.js";

export type Fixtures = {
  /** Page that has completed login and initial IDB sync. Ready for POS use. */
  loggedInPage: Page;
};

export const test = base.extend<Fixtures>({
  loggedInPage: async ({ page }, use) => {
    await login(page, E2E.ADMIN_EMAIL, E2E.ADMIN_PASS);
    // Wait for the initial resetAndSync to complete so IDB has test cards.
    await waitForSync(page);
    await use(page);
  },
});

export { expect };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/fixtures.ts
git commit -m "🔌 test(e2e): add loggedInPage fixture"
```

---

## Task 8: `auth.spec.ts`

**Files:**
- Create: `apps/web/e2e/auth.spec.ts`

- [ ] **Step 1: Create `apps/web/e2e/auth.spec.ts`**

```ts
import { test, expect } from "@playwright/test";
import { E2E } from "./fixtures/constants.js";

test.describe("auth", () => {
  test("valid credentials navigate to /pos", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(E2E.ADMIN_EMAIL);
    await page.getByLabel(/password|kata sandi/i).fill(E2E.ADMIN_PASS);
    await page.getByRole("button", { name: /masuk/i }).click();
    await expect(page).toHaveURL("/pos", { timeout: 15_000 });
  });

  test("invalid password shows error, stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(E2E.ADMIN_EMAIL);
    await page.getByLabel(/password|kata sandi/i).fill("wrongpassword");
    await page.getByRole("button", { name: /masuk/i }).click();
    // Error message appears (Bahasa Indonesia), URL unchanged.
    await expect(page.getByRole("alert").or(page.locator(".text-destructive"))).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL("/login");
  });
});
```

- [ ] **Step 2: Run just these tests to verify selectors**

```bash
pnpm --filter @kolektapos/web e2e --grep "auth" --headed
```

Expected: both tests pass (green). If a selector fails, adjust based on the failure message.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/auth.spec.ts
git commit -m "✅ test(e2e): auth — login happy path and invalid credentials"
```

---

## Task 9: `pos-online.spec.ts`

**Files:**
- Create: `apps/web/e2e/pos-online.spec.ts`

- [ ] **Step 1: Create `apps/web/e2e/pos-online.spec.ts`**

```ts
import { test, expect } from "./fixtures.js";
import { scanCard, addToCart, payWithCash } from "./helpers/pos.js";
import { E2E } from "./fixtures/constants.js";

test("POS › fixed-price online sale completes and shows receipt", async ({ loggedInPage: page }) => {
  await page.goto("/pos");

  // Scan the fixed-price test card.
  await scanCard(page, E2E.SHORT1);

  // Card review panel should appear with the correct title and "Tersedia" status.
  await expect(page.getByText("Pikachu Base Set")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/tersedia/i)).toBeVisible();

  // Add to cart.
  await addToCart(page);

  // Cart panel should show the line total formatted as Indonesian IDR.
  await expect(page.getByText(/100\.000/)).toBeVisible({ timeout: 5_000 });

  // Complete payment with cash.
  const txShortId = await payWithCash(page);

  // Receipt modal shows the transaction ID (8 uppercase hex chars).
  expect(txShortId).toMatch(/^[0-9A-F]{8}$/);

  // Verify the transaction exists on the server.
  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { rows?: unknown[]; [k: string]: unknown };
  // The response may be a bare array or { rows: [] } depending on pagination.
  const txList = Array.isArray(body) ? body : (body.rows ?? []) as Record<string, unknown>[];
  const found = txList.some((tx) => (tx as { totalIdr?: number }).totalIdr === E2E.PRICE1);
  expect(found, "Expected a transaction with totalIdr: 100000 in the server response").toBe(true);
});
```

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @kolektapos/web e2e --grep "fixed-price online sale" --headed
```

Expected: test passes. The receipt modal shows a valid transaction ID and the API confirms the row.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/pos-online.spec.ts
git commit -m "✅ test(e2e): pos-online — fixed-price sale end-to-end"
```

---

## Task 10: `pos-offline.spec.ts`

**Files:**
- Create: `apps/web/e2e/pos-offline.spec.ts`

- [ ] **Step 1: Create `apps/web/e2e/pos-offline.spec.ts`**

```ts
import { test, expect } from "./fixtures.js";
import { scanCard, addToCart, payWithCash } from "./helpers/pos.js";
import { forceOffline, goOnline, waitForSync } from "./helpers/sync.js";
import { E2E } from "./fixtures/constants.js";

test("POS › offline sale queues in IDB and flushes to server on reconnect", async ({ loggedInPage: page }) => {
  await page.goto("/pos");
  // loggedInPage fixture already called waitForSync — IDB has test cards.

  // Force offline mode.
  await forceOffline(page);

  // Scan the negotiable test card.
  await scanCard(page, E2E.SHORT2);
  await expect(page.getByText("Charizard Holo")).toBeVisible({ timeout: 5_000 });

  // Add to cart with a price above the bottom floor.
  const finalPrice = 400_000; // above bottomPriceIdr (300_000)
  await addToCart(page, finalPrice);
  await expect(page.getByText(/400\.000/)).toBeVisible({ timeout: 5_000 });

  // Pay (offline — all cash interaction stays local).
  await page.getByRole("button", { name: /^bayar$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /cash idr/i }).click();
  await page.getByRole("button", { name: /^total$/i }).click();
  await page.getByRole("button", { name: /^bayar$/i }).last().click();

  // Receipt should show the offline warning.
  await expect(page.getByText(/tersimpan lokal|offline/i)).toBeVisible({ timeout: 10_000 });

  // SyncDot should show pending ≥ 1.
  const syncDot = page.locator('[data-testid="sync-dot"]');
  await expect(syncDot).toHaveAttribute("data-pending-count", /^[1-9]/, { timeout: 5_000 });

  // Go back online.
  await goOnline(page);

  // Wait for sync to flush pending transactions and return to online state.
  // Background sync runs every 60s, but going online triggers an opportunistic sync.
  // Allow up to 90s for the flush to complete (includes sync interval).
  await waitForSync(page, 90_000);

  // SyncDot pending count should be 0.
  await expect(syncDot).toHaveAttribute("data-pending-count", "0", { timeout: 5_000 });

  // Verify the transaction exists on the server.
  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as unknown;
  const txList = Array.isArray(body) ? body : ((body as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  const found = txList.some((tx) => (tx as { totalIdr?: number }).totalIdr === finalPrice);
  expect(found, `Expected a transaction with totalIdr: ${finalPrice} on the server`).toBe(true);

  // Verify the card is now sold on the server.
  const cardRes = await page.request.get(`/api/cards/${E2E.CARD2_ID}`);
  expect(cardRes.ok()).toBeTruthy();
  const card = await cardRes.json() as { status?: string };
  expect(card.status).toBe("sold");
});
```

> **Timing note:** The background sync loop fires every 60 s. After `goOnline`, the `opportunisticSync` call is triggered by the network mode change and should flush immediately. If the 90 s timeout is still too tight in CI, increase to `120_000`.

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @kolektapos/web e2e --grep "offline sale" --headed
```

Expected: test passes. Watch the SyncDot transition from pending count to 0 after going online.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/pos-offline.spec.ts
git commit -m "✅ test(e2e): pos-offline — offline sale queues and flushes on reconnect ⭐"
```

---

## Task 11: `void.spec.ts`

**Files:**
- Create: `apps/web/e2e/void.spec.ts`

- [ ] **Step 1: Create `apps/web/e2e/void.spec.ts`**

The void flow lives in `OversoldQueuePage` (`/settings/oversold`). `0-TEST3` (`"Snorlax Holo"`) was pre-seeded as `oversold: true` with two existing sale transactions by `globalSetup`. After `loggedInPage` triggers `resetAndSync`, the card and its transactions are in IDB, so the oversold queue will list it.

```ts
import { test, expect } from "./fixtures.js";
import { E2E } from "./fixtures/constants.js";

test("Admin › void a transaction in the oversold queue records a void row", async ({ loggedInPage: page }) => {
  await page.goto("/settings/oversold");

  // The oversold queue should show TEST3 ("Snorlax Holo").
  await expect(page.getByText("Snorlax Holo")).toBeVisible({ timeout: 10_000 });

  // Click the "Void Transaksi" button for the card.
  await page.getByRole("button", { name: /void transaksi/i }).click();

  // A reason textarea and a confirm button should appear.
  const reasonInput = page.getByPlaceholder(/alasan void/i);
  await expect(reasonInput).toBeVisible({ timeout: 3_000 });
  await reasonInput.fill("E2E test void");

  // The confirm button should now be enabled.
  const confirmBtn = page.getByRole("button", { name: /konfirmasi void/i });
  await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
  await confirmBtn.click();

  // After void, the card row disappears from the queue (or the queue shows empty state).
  // The OversoldQueuePage refetches on success — wait for "Snorlax Holo" to vanish.
  await expect(page.getByText("Snorlax Holo")).toBeHidden({ timeout: 10_000 });

  // Verify via API: a void transaction now exists for the event.
  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as unknown;
  const txList = Array.isArray(body) ? body : ((body as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  const hasVoid = txList.some((tx) => (tx as { kind?: string }).kind === "void");
  expect(hasVoid, "Expected a void transaction in the server response").toBe(true);
});
```

> **Why "Snorlax Holo" disappears:** `handleVoid` in `OversoldQueuePage` calls `queryClient.invalidateQueries({ queryKey: ["oversold-cards"] })` after success. Since both sale transactions reference the same card, voiding one does not change `oversold: true` on the server, BUT the OversoldQueuePage reads from IDB — and IDB is updated via delta sync. Until the next sync pull, the card may still appear with `oversold: true` in IDB. If the test is flaky here, replace the `.toBeHidden()` assertion with a check that the "Konfirmasi Void" success path completed: assert the textarea has gone away instead.

- [ ] **Step 2: Run the test**

```bash
pnpm --filter @kolektapos/web e2e --grep "void" --headed
```

Expected: test passes. The oversold queue shows "Snorlax Holo", the void form fills and submits, and the API has a void transaction.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/void.spec.ts
git commit -m "✅ test(e2e): void — admin voids oversold transaction via OversoldQueuePage"
```

---

## Task 12: Run full suite and verify

- [ ] **Step 1: Run all 5 tests**

```bash
pnpm e2e
```

Expected output (approximately):
```
  ✓  auth.spec.ts › valid credentials navigate to /pos
  ✓  auth.spec.ts › invalid password shows error, stays on /login
  ✓  pos-online.spec.ts › POS › fixed-price online sale completes and shows receipt
  ✓  pos-offline.spec.ts › POS › offline sale queues in IDB and flushes on reconnect
  ✓  void.spec.ts › Admin › void a transaction in the oversold queue records a void row

  5 passed (≈ 3m)
```

- [ ] **Step 2: Fix any selector mismatches**

If a test fails with `locator.click: Error: strict mode violation`, the selector matched multiple elements. Narrow it with `.first()`, `.last()`, or a more specific attribute.

If a test fails with `Timed out waiting for selector`, the element did not appear — check the testid additions from Task 2 are in the right JSX nodes.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-Review Notes

**Spec coverage:**
- ✅ Goals §1 (all 4 scenarios) — covered by 5 tests
- ✅ Architecture §2 (Playwright config, serial, Chromium only) — Task 1
- ✅ Server lifecycle §2.2 (child process spawn, health poll) — Task 4
- ✅ Fixtures §3 (admin, event, 3 cards, 2 sale txns) — Tasks 3 + 4
- ✅ storageState / loggedInPage — Task 7
- ✅ Selector strategy §6 (semantic first, testid sparingly) — all spec files
- ✅ 4 `data-testid` additions §6 — Task 2
- ✅ Dependencies §7 — Task 1
- ✅ CI separation §8 — Task 1 (separate `pnpm e2e` script)

**Void test caveat:** After voiding, the card may still appear as `oversold: true` in IDB until the next delta sync. The assertion `toBeHidden()` on "Snorlax Holo" relies on the `queryClient.invalidateQueries` re-fetching from IDB immediately. If this is flaky, the fallback assertion is: the void textarea disappears (the form closes on success). Document this in a comment.
