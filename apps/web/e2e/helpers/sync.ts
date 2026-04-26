import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const SYNC_DOT = '[data-testid="sync-dot"]';
const NETWORK_TOGGLE = '[data-testid="network-mode-toggle"]';

// Exact text from apps/web/src/components/OfflineBanner.tsx
const OFFLINE_TEXT = /Anda offline\. Perubahan tidak dapat disimpan\./i;

export async function waitForSync(page: Page, timeoutMs = 20_000): Promise<void> {
  await expect(page.locator(SYNC_DOT)).toHaveAttribute(
    "aria-label",
    "Sync: online",
    { timeout: timeoutMs }
  );
}

export async function forceOffline(page: Page): Promise<void> {
  await page.locator(NETWORK_TOGGLE).click();
  await page.getByRole("option", { name: /mode offline/i }).click();
  await expect(page.getByText(OFFLINE_TEXT)).toBeVisible({ timeout: 5_000 });
}

export async function goOnline(page: Page): Promise<void> {
  await page.locator(NETWORK_TOGGLE).click();
  await page.getByRole("option", { name: /^auto$/i }).click();
  await expect(page.getByText(OFFLINE_TEXT)).toBeHidden({ timeout: 5_000 });
}
