import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const SYNC_DOT = '[data-testid="sync-dot"]';
const NETWORK_TOGGLE = '[data-testid="network-mode-toggle"]';

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
  // Wait for the toggle button itself to reflect the new mode
  await expect(page.locator(NETWORK_TOGGLE)).toHaveAttribute(
    "aria-label",
    "Mode jaringan: Offline",
    { timeout: 5_000 }
  );
}

export async function goOnline(page: Page): Promise<void> {
  await page.locator(NETWORK_TOGGLE).click();
  await page.getByRole("option", { name: /^auto$/i }).click();
  // Wait for the toggle button to reflect auto mode
  await expect(page.locator(NETWORK_TOGGLE)).toHaveAttribute(
    "aria-label",
    "Mode jaringan: Auto",
    { timeout: 5_000 }
  );
}
