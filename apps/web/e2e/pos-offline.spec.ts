import { test, expect } from "./fixtures.js";
import { scanCard, addToCart } from "./helpers/pos.js";
import { forceOffline, goOnline, waitForSync } from "./helpers/sync.js";
import { E2E } from "./fixtures/constants.js";

test("POS › offline sale queues in IDB and flushes to server on reconnect", async ({ loggedInPage: page }) => {
  test.setTimeout(120_000);
  await page.goto("/pos");

  await forceOffline(page);

  await scanCard(page, E2E.SHORT2);
  await expect(page.getByText("Charizard Holo")).toBeVisible({ timeout: 5_000 });

  const finalPrice = 400_000;
  await addToCart(page, finalPrice);
  await expect(page.getByText(/400\.000/).first()).toBeVisible({ timeout: 5_000 });

  // Pay offline
  await page.getByRole("button", { name: /^bayar$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /cash idr/i }).click();
  await page.getByRole("button", { name: /^total$/i }).click();
  await page.getByRole("button", { name: /^bayar$/i }).last().click();

  // Offline receipt
  await expect(page.getByText(/tersimpan lokal|offline/i)).toBeVisible({ timeout: 10_000 });

  // Pending count shows
  const syncDot = page.locator('[data-testid="sync-dot"]');
  await expect(syncDot).toHaveAttribute("data-pending-count", /^[1-9]/, { timeout: 5_000 });

  // Dismiss the receipt modal before interacting with the app bar
  await page.getByRole("button", { name: /transaksi baru/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5_000 });

  // Go online — opportunistic sync fires
  await goOnline(page);
  await waitForSync(page, 90_000);

  // Pending cleared
  await expect(syncDot).toHaveAttribute("data-pending-count", "0", { timeout: 5_000 });

  // Verify server has the transaction
  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as unknown;
  const txList = Array.isArray(body) ? body : ((body as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  const found = txList.some((tx) => (tx as { totalIdr?: number }).totalIdr === finalPrice);
  expect(found, `Expected a transaction with totalIdr: ${finalPrice} on the server`).toBe(true);

  // Verify card is sold
  const cardRes = await page.request.get(`/api/cards/${E2E.CARD2_ID}`);
  expect(cardRes.ok()).toBeTruthy();
  const card = await cardRes.json() as { status?: string };
  expect(card.status).toBe("sold");
});
