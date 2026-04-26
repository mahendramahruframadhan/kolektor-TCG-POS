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
    await expect(page.getByRole("alert").or(page.locator(".text-destructive"))).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL("/login");
  });
});
