import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { cardRoutes } from "./cards.js";
import { cartRoutes } from "./carts.js";
import { transactionRoutes } from "./transactions.js";
import { holdRoutes } from "./holds.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cashierCookie: string;
let adminCookie: string;

const __dirname = dirname(fileURLToPath(import.meta.url));

function applyMigrations(s: Database.Database) {
  // Apply the same migrations the production DB uses so Drizzle's full
  // column projections succeed.
  const migrationsDir = resolve(__dirname, "../../../../packages/db/drizzle");
  const files = ["0000_faulty_cerebro.sql", "0001_good_talos.sql"];
  for (const f of files) {
    const sql = readFileSync(resolve(migrationsDir, f), "utf-8");
    // Drizzle emits --> statement-breakpoint separators; strip them.
    const cleaned = sql.replace(/--> statement-breakpoint/g, "");
    s.exec(cleaned);
  }
}

async function login(email: string, password: string) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return res.headers["set-cookie"] as string;
}

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const cashierHash = await bcrypt.hash("pw-cashier-12345", 10);
  const adminHash = await bcrypt.hash("pw-admin-12345", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("u-cashier", "c@t.com", cashierHash, "Cashier", "cashier");
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("u-admin", "a@t.com", adminHash, "Admin", "admin");

  // Seed a card for PATCH target.
  sqlite.prepare(
    "INSERT INTO cards (id, client_id, short_id, title, pricing_mode, price_idr, status, owner_user_id, intaken_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("card-1", "ccli-1", "R-00001", "Charizard", "fixed", 50000, "available", "u-admin", "u-admin");

  // Seed an event (transactions.event_id is NOT NULL).
  sqlite.prepare(
    "INSERT INTO events (id, name, start_date, end_date) VALUES (?, ?, ?, ?)"
  ).run("ev-1", "Test Event", "2026-04-24", "2026-04-25");

  // Seed a sale transaction + its items for void.
  sqlite.prepare(
    "INSERT INTO transactions (id, client_id, kind, subtotal_idr, discount_idr, total_idr, cashier_user_id, event_id, paid_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run("tx-1", "txcli-1", "sale", 1000, 0, 1000, "u-admin", "ev-1", Math.floor(Date.now() / 1000));
  sqlite.prepare(
    "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)"
  ).run("ti-1", "tx-1", "card-1", "u-admin", 1000, 1000);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await cardRoutes(app, { db });
  await cartRoutes(app, { db });
  await transactionRoutes(app, { db });
  await holdRoutes(app, { db });

  cashierCookie = await login("c@t.com", "pw-cashier-12345");
  adminCookie = await login("a@t.com", "pw-admin-12345");
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("authz boundaries", () => {
  it("cashier cannot PATCH a card", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/cards/card-1",
      headers: { cookie: cashierCookie },
      payload: { title: "Hacked", version: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin can PATCH a card", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/cards/card-1",
      headers: { cookie: adminCookie },
      payload: { title: "Legit", version: 1 },
    });
    expect(res.statusCode).toBe(200);
  });

  it("cashier cannot void a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/transactions/tx-1/void",
      headers: { cookie: cashierCookie },
      payload: { reason: "oops", clientId: crypto.randomUUID() },
    });
    expect(res.statusCode).toBe(403);
  });

  it("admin can void a transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/transactions/tx-1/void",
      headers: { cookie: adminCookie },
      payload: { reason: "oops", clientId: crypto.randomUUID() },
    });
    expect([200, 201]).toContain(res.statusCode);
  });
});
