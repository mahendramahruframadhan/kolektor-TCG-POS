import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "@kolektapos/db/schema";
import { cards, holds } from "@kolektapos/db/schema";
import { applyDrizzleMigrations } from "../test-migrations.js";
import { expireOverdueHolds } from "./cart-sweeper.js";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;
let heldCardId: string;
let soldCardId: string;
let userId: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  db = drizzle(sqlite, { schema });

  userId = crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run(userId, "user@test.com", "hash", "TestUser", "cashier");

  const eventId = crypto.randomUUID();
  sqlite
    .prepare("INSERT INTO events (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)")
    .run(eventId, "Test Event", "2026-04-26", "2026-04-27", "active");

  heldCardId = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(heldCardId, crypto.randomUUID(), "C-CCCCC", userId, userId, "Held Card", "fixed", 50000, "held", 0, 1);

  soldCardId = crypto.randomUUID();
  sqlite
    .prepare(
      "INSERT INTO cards (id, client_id, short_id, owner_user_id, stock_received_by_user_id, title, pricing_mode, price_idr, status, oversold, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(soldCardId, crypto.randomUUID(), "D-DDDDD", userId, userId, "Sold Card", "fixed", 60000, "sold", 0, 1);
});

afterAll(() => {
  sqlite.close();
});

describe("cart-sweeper hold expiry guard", () => {
  it("hold expiry reverts a held card back to available", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredAt = nowSec - 1;

    const holdId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO holds (id, card_id, held_by_user_id, expires_at, released_at) VALUES (?, ?, ?, ?, NULL)"
      )
      .run(holdId, heldCardId, userId, expiredAt);

    expireOverdueHolds(db, nowSec);

    const card = db.select({ status: cards.status }).from(cards).where(eq(cards.id, heldCardId)).get();
    expect(card?.status).toBe("available");

    // Hold should be marked released
    const hold = db.select({ releasedAt: holds.releasedAt, releaseReason: holds.releaseReason })
      .from(holds)
      .where(eq(holds.id, holdId))
      .get();
    expect(hold?.releasedAt).toBeTruthy();
    expect(hold?.releaseReason).toBe("expired");
  });

  it("hold expiry does NOT revert a sold card to available", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const expiredAt = nowSec - 1;

    const holdId = crypto.randomUUID();
    sqlite
      .prepare(
        "INSERT INTO holds (id, card_id, held_by_user_id, expires_at, released_at) VALUES (?, ?, ?, ?, NULL)"
      )
      .run(holdId, soldCardId, userId, expiredAt);

    expireOverdueHolds(db, nowSec);

    // Sold card must remain "sold" — the WHERE status='held' guard protects it
    const card = db.select({ status: cards.status }).from(cards).where(eq(cards.id, soldCardId)).get();
    expect(card?.status).toBe("sold");

    // The hold itself should still be released (the hold row is cleaned up regardless)
    const hold = db.select({ releasedAt: holds.releasedAt })
      .from(holds)
      .where(eq(holds.id, holdId))
      .get();
    expect(hold?.releasedAt).toBeTruthy();
  });
});
