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
import { cartRoutes } from "./carts.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cashierCookie: string;
let eventId: string;
let fixedCardId: string;

const __dirname = dirname(fileURLToPath(import.meta.url));

function applyMigrations(s: Database.Database) {
  const migrationsDir = resolve(__dirname, "../../../../packages/db/drizzle");
  const files = ["0000_faulty_cerebro.sql", "0001_good_talos.sql"];
  for (const f of files) {
    const sql = readFileSync(resolve(migrationsDir, f), "utf-8");
    s.exec(sql.replace(/--> statement-breakpoint/g, ""));
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

async function createCart(cookie: string, eventIdArg: string) {
  const res = await app.inject({
    method: "POST",
    url: "/carts",
    headers: { cookie },
    payload: { clientId: crypto.randomUUID(), eventId: eventIdArg },
  });
  return JSON.parse(res.payload).id as string;
}

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyMigrations(sqlite);
  const db = drizzle(sqlite, { schema });

  const ch = await bcrypt.hash("pw-cashier-12345", 10);
  sqlite
    .prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
    )
    .run("u-cashier", "c@t.com", ch, "Cashier", "cashier");
  sqlite
    .prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
    )
    .run(
      "u-admin",
      "a@t.com",
      await bcrypt.hash("pw-admin-12345", 10),
      "Admin",
      "admin"
    );

  eventId = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO events (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(eventId, "FixedPriceFloor Event", "2026-04-24", "2026-04-30", "active");

  fixedCardId = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, title, pricing_mode, price_idr, status, owner_user_id, intaken_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      fixedCardId,
      crypto.randomUUID(),
      "R-FIX01",
      "Fixed Card",
      "fixed",
      50000,
      "available",
      "u-admin",
      "u-admin"
    );

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await cartRoutes(app, { db });

  cashierCookie = await login("c@t.com", "pw-cashier-12345");
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("POST /carts/:id/items — fixed-price floor", () => {
  it("enforces fixed-price floor on POST /carts/:id/items", async () => {
    const cartId = await createCart(cashierCookie, eventId);

    // Reject below-floor
    const reject = await app.inject({
      method: "POST",
      url: `/carts/${cartId}/items`,
      headers: { cookie: cashierCookie },
      payload: {
        cardId: fixedCardId,
        intendedPriceIdr: 1,
        lineDiscountIdr: 0,
      },
    });
    expect(reject.statusCode).toBe(422);
    const rejectBody = JSON.parse(reject.payload) as { error: string };
    expect(rejectBody.error).toMatch(/fixed/i);

    // Accept at-floor
    const accept = await app.inject({
      method: "POST",
      url: `/carts/${cartId}/items`,
      headers: { cookie: cashierCookie },
      payload: {
        cardId: fixedCardId,
        intendedPriceIdr: 50000,
        lineDiscountIdr: 0,
      },
    });
    expect(accept.statusCode).toBe(201);
  });
});
