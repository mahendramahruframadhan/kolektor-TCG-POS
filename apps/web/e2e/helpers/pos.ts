import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function scanCard(page: Page, shortId: string): Promise<void> {
  const scanInput = page.getByTestId("scan-input");
  await expect(scanInput).toBeVisible({ timeout: 10_000 });
  await scanInput.click();
  await scanInput.fill(shortId);
  await scanInput.press("Enter");
}

export async function addToCart(page: Page, finalPriceIdr?: number): Promise<void> {
  if (finalPriceIdr !== undefined) {
    const priceInput = page.getByRole("spinbutton").first();
    await priceInput.clear();
    await priceInput.fill(String(finalPriceIdr));
  }
  await page.getByRole("button", { name: /tambah ke keranjang/i }).click();
  // Wait for an item to appear in the cart — "Bayar" button only shows when cart is non-empty
  await expect(page.getByRole("button", { name: /^bayar$/i })).toBeVisible({ timeout: 5_000 });
}

export async function payWithCash(page: Page): Promise<string> {
  await page.getByRole("button", { name: /^bayar$/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /cash idr/i }).click();
  await page.getByRole("button", { name: /^total$/i }).click();
  await page.getByRole("button", { name: /^bayar$/i }).last().click();
  const txIdEl = page.getByTestId("receipt-tx-id");
  await expect(txIdEl).toBeVisible({ timeout: 15_000 });
  return (await txIdEl.textContent() ?? "").replace("#", "");
}
