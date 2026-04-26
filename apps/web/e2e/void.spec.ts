import { test, expect } from "./fixtures.js";
import { E2E } from "./fixtures/constants.js";

test("Admin › void a transaction in the oversold queue records a void row", async ({ loggedInPage: page }) => {
  await page.goto("/settings/oversold");

  await expect(page.getByText("Snorlax Holo")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /void transaksi/i }).click();

  const reasonInput = page.getByPlaceholder(/alasan void/i);
  await expect(reasonInput).toBeVisible({ timeout: 3_000 });
  await reasonInput.fill("E2E test void");

  const confirmBtn = page.getByRole("button", { name: /konfirmasi void/i });
  await expect(confirmBtn).toBeEnabled({ timeout: 3_000 });
  await confirmBtn.click();

  // Card row disappears after successful void (queryClient invalidates)
  await expect(page.getByText("Snorlax Holo")).toBeHidden({ timeout: 10_000 });

  // Verify void transaction exists on server
  const res = await page.request.get(`/api/transactions?eventId=${E2E.EVENT_ID}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as unknown;
  const txList = Array.isArray(body) ? body : ((body as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
  const hasVoid = txList.some((tx) => (tx as { kind?: string }).kind === "void");
  expect(hasVoid, "Expected a void transaction in the server response").toBe(true);
});
