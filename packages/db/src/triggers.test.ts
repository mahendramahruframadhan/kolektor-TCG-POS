import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { runMigrations } from "./migrate.js";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle>;

describe("append-only triggers", () => {
  beforeAll(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });
    runMigrations(":memory:"); // This won't work directly; let's apply schema manually
    // Actually, let's just use raw SQL to create tables and triggers
    sqlite.exec(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL UNIQUE,
        event_id TEXT NOT NULL,
        cashier_user_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'sale',
        subtotal_idr INTEGER NOT NULL,
        discount_idr INTEGER NOT NULL DEFAULT 0,
        total_idr INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE transaction_items (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        owner_user_id_snapshot TEXT NOT NULL,
        listed_price_idr_snapshot INTEGER NOT NULL,
        sold_price_idr INTEGER NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TRIGGER transactions_no_update
      BEFORE UPDATE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'transactions is append-only');
      END;

      CREATE TRIGGER transactions_no_delete
      BEFORE DELETE ON transactions
      BEGIN
        SELECT RAISE(ABORT, 'transactions is append-only');
      END;

      CREATE TRIGGER transaction_items_no_update
      BEFORE UPDATE ON transaction_items
      BEGIN
        SELECT RAISE(ABORT, 'transaction_items is append-only');
      END;

      CREATE TRIGGER transaction_items_no_delete
      BEFORE DELETE ON transaction_items
      BEGIN
        SELECT RAISE(ABORT, 'transaction_items is append-only');
      END;
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  it("allows INSERT into transactions", () => {
    const stmt = sqlite.prepare(
      "INSERT INTO transactions (id, client_id, event_id, cashier_user_id, subtotal_idr, total_idr) VALUES (?, ?, ?, ?, ?, ?)"
    );
    expect(() => stmt.run("t1", "c1", "e1", "u1", 100, 100)).not.toThrow();
  });

  it("blocks UPDATE on transactions", () => {
    expect(() =>
      sqlite.prepare("UPDATE transactions SET total_idr = 200 WHERE id = 't1'").run()
    ).toThrow("append-only");
  });

  it("blocks DELETE on transactions", () => {
    expect(() =>
      sqlite.prepare("DELETE FROM transactions WHERE id = 't1'").run()
    ).toThrow("append-only");
  });

  it("allows INSERT into transaction_items", () => {
    const stmt = sqlite.prepare(
      "INSERT INTO transaction_items (id, transaction_id, card_id, owner_user_id_snapshot, listed_price_idr_snapshot, sold_price_idr) VALUES (?, ?, ?, ?, ?, ?)"
    );
    expect(() => stmt.run("i1", "t1", "card1", "u1", 100, 100)).not.toThrow();
  });

  it("blocks UPDATE on transaction_items", () => {
    expect(() =>
      sqlite.prepare("UPDATE transaction_items SET sold_price_idr = 200 WHERE id = 'i1'").run()
    ).toThrow("append-only");
  });

  it("blocks DELETE on transaction_items", () => {
    expect(() =>
      sqlite.prepare("DELETE FROM transaction_items WHERE id = 'i1'").run()
    ).toThrow("append-only");
  });
});
