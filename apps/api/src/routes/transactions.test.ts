import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";
import { applyDrizzleMigrations } from "../test-migrations.js";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { transactionRoutes } from "./transactions.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let adminCookie: string;
let eventId: string;
let card1Id: string;
let card2Id: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const hash = await bcrypt.hash("pw-admin-12345", 10);
  sqlite
    .prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("admin1", "admin@test.com", hash, "Admin", "admin");

  eventId = crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO events (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)")
    .run(eventId, "Test Event", "2026-04-26", "2026-04-27", "active");

  card1Id = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(card1Id, crypto.randomUUID(), "A-AAAAA", "admin1", "admin1", "Charizard", "fixed", 100000, "available", 0, 1);

  // Second card for the "stays sold" test — already sold and oversold
  card2Id = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(card2Id, crypto.randomUUID(), "B-BBBBB", "admin1", "admin1", "Blastoise", "fixed", 80000, "sold", 1, 1);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await transactionRoutes(app, { db });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "admin@test.com", password: "pw-admin-12345" },
  });
  adminCookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("POST /transactions/:id/void", () => {
  it("void a sale transaction restores card to available", async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const txId = crypto.randomUUID();
    const txClientId = crypto.randomUUID();

    // Create a sale transaction directly in DB
    sqlite
      .prepare(
        "INSERT INTO transactions (id, client_id, event_id, cashier_user_id, kind, subtotal_idr, discount_idr, total_idr, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(txId, txClientId, eventId, "admin1", "sale", 100000, 0, 100000, nowSec, nowSec);

    // Create transaction_item for card1
    sqlite
      .prepare(
        "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr, line_discount_idr, override_below_bottom, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(crypto.randomUUID(), txId, card1Id, "admin1", 100000, 100000, 0, 0, nowSec);

    // Mark card as sold (as the system would after a real sale)
    sqlite
      .prepare("UPDATE cards SET status = 'sold' WHERE id = ?")
      .run(card1Id);

    const voidClientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/transactions/${txId}/void`,
      headers: { cookie: adminCookie },
      payload: { reason: "test void", clientId: voidClientId },
    });

    expect(res.statusCode).toBe(201);

    // Card 1 should be back to available
    const card = sqlite.prepare("SELECT status FROM cards WHERE id = ?").get(card1Id) as { status: string };
    expect(card.status).toBe("available");

    // The void transaction should reference the parent
    const voidTx = sqlite
      .prepare("SELECT kind, parent_transaction_id FROM transactions WHERE client_id = ?")
      .get(voidClientId) as { kind: string; parent_transaction_id: string };
    expect(voidTx.kind).toBe("void");
    expect(voidTx.parent_transaction_id).toBe(txId);
  });

  it("void on an oversold card with two sales does NOT restore to available", async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // First sale transaction for card2
    const tx1Id = crypto.randomUUID();
    const tx1ClientId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO transactions (id, client_id, event_id, cashier_user_id, kind, subtotal_idr, discount_idr, total_idr, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(tx1Id, tx1ClientId, eventId, "admin1", "sale", 80000, 0, 80000, nowSec, nowSec);

    sqlite
      .prepare(
        "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr, line_discount_idr, override_below_bottom, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(crypto.randomUUID(), tx1Id, card2Id, "admin1", 80000, 80000, 0, 0, nowSec);

    // Second sale transaction for card2 (the oversold scenario)
    const tx2Id = crypto.randomUUID();
    const tx2ClientId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO transactions (id, client_id, event_id, cashier_user_id, kind, subtotal_idr, discount_idr, total_idr, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(tx2Id, tx2ClientId, eventId, "admin1", "sale", 80000, 0, 80000, nowSec, nowSec);

    sqlite
      .prepare(
        "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr, line_discount_idr, override_below_bottom, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(crypto.randomUUID(), tx2Id, card2Id, "admin1", 80000, 80000, 0, 0, nowSec);

    // Void only the first sale
    const voidClientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/transactions/${tx1Id}/void`,
      headers: { cookie: adminCookie },
      payload: { reason: "oversold void test", clientId: voidClientId },
    });

    expect(res.statusCode).toBe(201);

    // Card 2 should still be "sold" because tx2 is still active
    const card = sqlite.prepare("SELECT status FROM cards WHERE id = ?").get(card2Id) as { status: string };
    expect(card.status).toBe("sold");
  });

  it("400 if reason is missing", async () => {
    const fakeTxId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: `/transactions/${fakeTxId}/void`,
      headers: { cookie: adminCookie },
      payload: { clientId: crypto.randomUUID() },
    });
    expect(res.statusCode).toBe(400);
  });
});
