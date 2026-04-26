import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login } from "./helpers/login.js";
import { waitForSync } from "./helpers/sync.js";
import { E2E } from "./fixtures/constants.js";

export type Fixtures = {
  loggedInPage: Page;
};

export const test = base.extend<Fixtures>({
  loggedInPage: async ({ page }, use) => {
    await login(page, E2E.ADMIN_EMAIL, E2E.ADMIN_PASS);
    await waitForSync(page);
    await use(page);
  },
});

export { expect };
