import { test, expect } from "./fixtures.js";
import { scanCard, addToCart, payWithCash } from "./helpers/pos.js";
import { E2E } from "./fixtures/constants.js";

test("POS › fixed-price online sale completes and shows receipt", async ({ loggedInPage: page }) => {
  await page.goto("/pos");

  await scanCard(page, E2E.SHORT1);
  await expect(page.getByText("Pikachu Base Set")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(/tersedia/i)).toBeVisible();

  await addToCart(page);
  await expect(page.getByText(/100\.000/)).toBeVisible({ timeout: 5_000 });

  const txShortId = await payWithCash(page);
  expect(txShortId).toMatch(/^[0-9A-F]{8}$/);

  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as unknown;
  const txList = Array.isArray(body) ? body : ((body as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  const found = txList.some((tx) => (tx as { totalIdr?: number }).totalIdr === E2E.PRICE1);
  expect(found, "Expected a transaction with totalIdr: 100000 in the server response").toBe(true);
});
