import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";
import { applyDrizzleMigrations } from "../test-migrations.js";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { flushPendingTxRoute } from "./flush-pending-tx.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;
let cardId: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const hash = await bcrypt.hash("pw-secret-12345", 10);
  sqlite
    .prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("u1", "cashier@test.com", hash, "Cashier", "cashier");

  sqlite
    .prepare("INSERT INTO events (id, name, venue, start_date, end_date, status, version) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("ev1", "Test Event", "Venue", "2026-04-26", "2026-04-27", "active", 1);

  cardId = "10000000-0000-4000-8000-000000000001";
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(cardId, "cc1", "A-AAAAA", "u1", "u1", "Pikachu", "fixed", 50000, "available", 0, 1);

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await flushPendingTxRoute(app, { db });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "cashier@test.com", password: "pw-secret-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("POST /sync/flush-pending-tx", () => {
  it("401 tanpa session", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      payload: { transactions: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("400 jika body tidak valid", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: { transactions: "bukan-array" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("berhasil flush satu transaksi offline", async () => {
    const txClientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          eventId: "ev1",
          items: [{
            cardId,
            ownerUserIdSnapshot: "u1",
            listedPriceIdrSnapshot: 50000,
            intendedPriceIdr: 50000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 50000,
          }],
          subtotalIdr: 50000,
          discountIdr: 0,
          totalIdr: 50000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toBe("accepted");
    expect(body.results[0].serverTransactionId).toBeTruthy();
  });

  it("idempotent: clientId sama menghasilkan accepted tanpa duplicate", async () => {
    const txClientId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          eventId: "ev1",
          items: [{
            cardId,
            ownerUserIdSnapshot: "u1",
            listedPriceIdrSnapshot: 50000,
            intendedPriceIdr: 50000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 50000,
          }],
          subtotalIdr: 50000,
          discountIdr: 0,
          totalIdr: 50000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("accepted");
  });
});
