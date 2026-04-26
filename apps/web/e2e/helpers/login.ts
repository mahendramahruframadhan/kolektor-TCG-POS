import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password|kata sandi/i).fill(password);
  await page.getByRole("button", { name: /masuk/i }).click();
  await expect(page).toHaveURL("/pos", { timeout: 15_000 });
}
