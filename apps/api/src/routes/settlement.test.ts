import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { settlementRoutes } from "./settlement.js";
import { sessionPlugin } from "../plugins/session.js";
import { applyDrizzleMigrations } from "../test-migrations.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const pwHash = await bcrypt.hash("pw-12345", 10);
  sqlite.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
  ).run("owner-A", "a@t.com", pwHash, "Owner A", "admin");
  sqlite.prepare(
    "INSERT INTO events (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)"
  ).run("ev-1", "Event 1", "2026-04-24", "2026-04-30", "active");

  // Seed card referenced by transaction_items (FK).
  sqlite.prepare(
    "INSERT INTO cards (id, client_id, short_id, title, pricing_mode, price_idr, status, owner_user_id, stock_received_by_user_id, event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("card-1", "cli-card-1", "A-00001", "Test Card", "fixed", 1000, "sold", "owner-A", "owner-A", "ev-1");

  // One sale for owner-A @ 1000
  sqlite.prepare(
    "INSERT INTO transactions (id, client_id, event_id, kind, subtotal_idr, discount_idr, total_idr, cashier_user_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("tx-sale-1", "cli-sale-1", "ev-1", "sale", 1000, 0, 1000, "owner-A", Math.floor(Date.now() / 1000));
  sqlite.prepare(
    "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("ti-sale-1", "tx-sale-1", "card-1", "owner-A", 1000, 1000);

  // Void of that sale — negative amounts (matches handleVoidRefund)
  sqlite.prepare(
    "INSERT INTO transactions (id, client_id, event_id, kind, parent_transaction_id, subtotal_idr, discount_idr, total_idr, cashier_user_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("tx-void-1", "cli-void-1", "ev-1", "void", "tx-sale-1", -1000, 0, -1000, "owner-A", Math.floor(Date.now() / 1000));
  sqlite.prepare(
    "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("ti-void-1", "tx-void-1", "card-1", "owner-A", 1000, -1000);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await settlementRoutes(app, { db });

  const login = await app.inject({
    method: "POST", url: "/auth/login",
    payload: { email: "a@t.com", password: "pw-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("/reports/event/:eventId/settlement", () => {
  it("per-owner payout is 0 after a sale is fully voided (no double-negation)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/reports/event/ev-1/settlement",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      breakdown: Array<{ ownerId: string; totalPayoutIdr: number }>;
    };
    const ownerA = body.breakdown.find((b) => b.ownerId === "owner-A");
    expect(ownerA).toBeTruthy();
    expect(ownerA!.totalPayoutIdr).toBe(0);
  });
});
