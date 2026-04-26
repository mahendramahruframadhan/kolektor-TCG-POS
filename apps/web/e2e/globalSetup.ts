import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { rmSync } from "fs";
import { spawn } from "child_process";
import bcrypt from "bcryptjs";
import { runMigrations, seed } from "@kolektapos/db";
import { users, events, cards, transactions, transactionItems } from "@kolektapos/db/schema";
import { E2E } from "./fixtures/constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DB   = resolve(__dirname, "test.db");
const REPO_ROOT = resolve(__dirname, "../../../../");
const API_DIR   = resolve(__dirname, "../../api");

export default async function globalSetup() {
  rmSync(TEST_DB, { force: true });
  rmSync(TEST_DB + "-wal", { force: true });
  rmSync(TEST_DB + "-shm", { force: true });

  const { db } = await runMigrations(TEST_DB);
  await seed(db);

  const nowSec = Math.floor(Date.now() / 1000);
  const passwordHash = await bcrypt.hash(E2E.ADMIN_PASS, 10);

  // Insert admin user
  db.insert(users).values({
    id: E2E.ADMIN_ID,
    email: E2E.ADMIN_EMAIL,
    displayName: "E2E Tester",
    role: "admin",
    passwordHash,
    createdAt: nowSec,
    updatedAt: nowSec,
    version: 1,
  }).onConflictDoNothing().run();

  // Insert active event
  // Note: events table has no clientId column; startDate and endDate are required (notNull, no default)
  db.insert(events).values({
    id: E2E.EVENT_ID,
    name: "E2E Event",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    status: "active",
    createdAt: nowSec,
    updatedAt: nowSec,
    version: 1,
  }).onConflictDoNothing().run();

  // Insert 3 test cards
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
    createdAt: nowSec,
    updatedAt: nowSec,
    version: 1,
  };

  db.insert(cards).values([
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
      status: "sold" as const,
      oversold: true,
    },
  ]).onConflictDoNothing().run();

  // Insert 2 pre-seeded sale transactions for TEST3 (creates oversold state)
  // Note: transactions table has no `version` column (append-only, insert-only)
  db.insert(transactions).values([
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
    },
  ]).onConflictDoNothing().run();

  // Note: transactionItems table has no `version` column (append-only)
  db.insert(transactionItems).values([
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
  ]).onConflictDoNothing().run();

  // Spawn the API — tsx found at repo root node_modules/.bin/tsx
  const tsxBin = resolve(REPO_ROOT, "node_modules/.bin/tsx");
  const testEnv: Record<string, string | undefined> = {
    ...process.env,
    DATABASE_PATH: TEST_DB,
    PORT: String(E2E.API_PORT),
    HOST: "127.0.0.1",
    SESSION_SECRET: E2E.SESSION_SECRET,
    NODE_ENV: "development",
  };
  delete testEnv.ADMIN_EMAIL;
  delete testEnv.ADMIN_PASSWORD;

  const apiProcess = spawn(tsxBin, ["src/server.ts"], {
    cwd: API_DIR,
    env: testEnv as NodeJS.ProcessEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  process.env.__E2E_API_PID = String(apiProcess.pid);

  await waitForApi(`http://127.0.0.1:${E2E.API_PORT}/health`, 20_000);
}

async function waitForApi(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`API at ${url} did not become ready within ${timeoutMs}ms`);
}
