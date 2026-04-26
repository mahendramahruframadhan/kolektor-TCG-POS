import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@kolektapos/db/schema";
import { createTestDb, seedUser, seedEvent } from "../test-helpers.js";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { flushPendingTxRoute } from "./flush-pending-tx.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
let cookie: string;
let cardId: string;
let negotiableCardId: string;

beforeAll(async () => {
  ({ sqlite, db } = createTestDb());

  await seedUser(sqlite, { id: "u1", email: "cashier@test.com", role: "cashier", password: "pw-secret-12345" });

  seedEvent(sqlite, { id: "ev1" });

  cardId = "10000000-0000-4000-8000-000000000001";
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(cardId, "cc1", "A-AAAAA", "u1", "u1", "Pikachu", "fixed", 50000, "available", 0, 1);

  // Negotiable card for price floor tests
  negotiableCardId = "20000000-0000-4000-8000-000000000002";
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, listed_price_idr, bottom_price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(negotiableCardId, "cc2", "A-BBBBB", "u1", "u1", "Mewtwo", "negotiable", 100000, 60000, "available", 0, 1);

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

  it("rejects if totalIdr !== subtotalIdr - discountIdr", async () => {
    const txClientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: crypto.randomUUID(),
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
          totalIdr: 99999,  // mismatch: should be 50000
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
  });

  it("rejects if soldPriceIdr below bottomPriceIdr for negotiable card", async () => {
    const txClientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: crypto.randomUUID(),
          eventId: "ev1",
          items: [{
            cardId: negotiableCardId,
            ownerUserIdSnapshot: "u1",
            listedPriceIdrSnapshot: 100000,
            intendedPriceIdr: 40000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 40000,  // below bottom of 60000
          }],
          subtotalIdr: 40000,
          discountIdr: 0,
          totalIdr: 40000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("rejected");
  });

  it("server overwrites ownerUserIdSnapshot with card's actual ownerUserId", async () => {
    const txClientId = crypto.randomUUID();
    const res = await app.inject({
      method: "POST",
      url: "/sync/flush-pending-tx",
      headers: { cookie },
      payload: {
        transactions: [{
          clientId: txClientId,
          cartClientId: crypto.randomUUID(),
          eventId: "ev1",
          items: [{
            cardId: negotiableCardId,
            ownerUserIdSnapshot: "fake-owner-id",  // wrong owner, server should correct
            listedPriceIdrSnapshot: 100000,
            intendedPriceIdr: 80000,
            lineDiscountIdr: 0,
            overrideBelowBottom: false,
            soldPriceIdr: 80000,  // above bottom of 60000, valid
          }],
          subtotalIdr: 80000,
          discountIdr: 0,
          totalIdr: 80000,
          paidAt: Math.floor(Date.now() / 1000),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.results[0].status).toBe("accepted");

    const serverTxId = body.results[0].serverTransactionId as string;
    const item = sqlite
      .prepare("SELECT owner_user_id_snapshot FROM transaction_items WHERE transaction_id = ?")
      .get(serverTxId) as { owner_user_id_snapshot: string };
    expect(item.owner_user_id_snapshot).toBe("u1");  // server corrected to actual owner
  });
});
