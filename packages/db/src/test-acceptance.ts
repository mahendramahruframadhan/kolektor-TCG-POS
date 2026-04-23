/**
 * M1 acceptance tests (run via: tsx src/test-acceptance.ts)
 * 1. Schema migrates cleanly
 * 2. transactions: UPDATE/DELETE both raise
 * 3. transaction_items: UPDATE/DELETE both raise
 * 4. Settlement query uses owner_user_id_snapshot, not live cards.owner_user_id
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";
import * as schema from "./schema.js";
import { eq } from "drizzle-orm";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function assertThrows(fn: () => void, label: string) {
  try {
    fn();
    console.error(`  ✗ ${label} (expected error, got none)`);
    failed++;
  } catch {
    console.log(`  ✓ ${label}`);
    passed++;
  }
}

const DB_PATH = ":memory:";

console.log("\n[M1 acceptance]\n");

// ── 1. migrate + seed ─────────────────────────────────────────────────────
const { sqlite, db } = await runMigrations(DB_PATH);
await seed(db);

// Verify payment channels seeded
const channels = db.select().from(schema.paymentChannels).all();
assert(channels.length === 10, `10 payment channels seeded (got ${channels.length})`);

// Verify settings seeded
const settingsRows = db.select().from(schema.settings).all();
assert(settingsRows.length === 3, `3 default settings seeded (got ${settingsRows.length})`);

// Verify admin user seeded
const adminUser = db
  .select()
  .from(schema.users)
  .where(eq(schema.users.role, "admin"))
  .get();
assert(adminUser != null, "admin user seeded");

// ── 2+3. append-only triggers ────────────────────────────────────────────
// We need an event + user + payment channel to create a transaction
const eventId = crypto.randomUUID();
sqlite.prepare(
  `INSERT INTO events (id,name,venue,start_date,end_date,status,created_at,updated_at,version)
   VALUES (?,?,?,?,?,?,strftime('%s','now'),strftime('%s','now'),1)`
).run(eventId, "Test Event", "Jakarta", "2026-04-01", "2026-04-02", "active");

const cashierId = crypto.randomUUID();
sqlite.prepare(
  `INSERT INTO users (id,email,password_hash,display_name,role,created_at,updated_at,version)
   VALUES (?,?,?,?,?,strftime('%s','now'),strftime('%s','now'),1)`
).run(cashierId, "cashier@test.id", "hash", "Cashier", "cashier");

const channelId = channels[0]!.id;
const txClientId = crypto.randomUUID();
const txId = crypto.randomUUID();

sqlite.prepare(
  `INSERT INTO transactions
   (id,client_id,event_id,cashier_user_id,kind,subtotal_idr,total_idr,payment_channel_id,created_at)
   VALUES (?,?,?,?,?,?,?,?,strftime('%s','now'))`
).run(txId, txClientId, eventId, cashierId, "sale", 50000, 50000, channelId);

assert(true, "transactions INSERT succeeds");

assertThrows(
  () => sqlite.prepare("UPDATE transactions SET notes='x' WHERE id=?").run(txId),
  "transactions UPDATE raises"
);

assertThrows(
  () => sqlite.prepare("DELETE FROM transactions WHERE id=?").run(txId),
  "transactions DELETE raises"
);

// transaction_items
const ownerId = adminUser!.id;
const cardId = crypto.randomUUID();
sqlite.prepare(
  `INSERT INTO cards
   (id,client_id,short_id,owner_user_id,intaken_by_user_id,title,pricing_mode,
    price_idr,status,created_at,updated_at,version)
   VALUES (?,?,?,?,?,?,?,?,?,strftime('%s','now'),strftime('%s','now'),1)`
).run(cardId, crypto.randomUUID(), "B-AAAAA", ownerId, cashierId, "Pikachu EX", "fixed", 50000, "sold");

const tiId = crypto.randomUUID();
sqlite.prepare(
  `INSERT INTO transaction_items
   (id,transaction_id,card_id,owner_user_id_snapshot,
    listed_price_idr_snapshot,sold_price_idr,created_at)
   VALUES (?,?,?,?,?,?,strftime('%s','now'))`
).run(tiId, txId, cardId, ownerId, 50000, 50000);

assert(true, "transaction_items INSERT succeeds");

assertThrows(
  () =>
    sqlite.prepare("UPDATE transaction_items SET sold_price_idr=1 WHERE id=?").run(tiId),
  "transaction_items UPDATE raises"
);

assertThrows(
  () => sqlite.prepare("DELETE FROM transaction_items WHERE id=?").run(tiId),
  "transaction_items DELETE raises"
);

// ── 4. Settlement uses snapshot, not live owner ──────────────────────────
// Mutate cards.owner_user_id post-sale to a different user
const newOwnerId = crypto.randomUUID();
sqlite.prepare(
  `INSERT INTO users (id,email,password_hash,display_name,role,created_at,updated_at,version)
   VALUES (?,?,?,?,?,strftime('%s','now'),strftime('%s','now'),1)`
).run(newOwnerId, "newowner@test.id", "hash2", "New Owner", "cashier");

sqlite.prepare("UPDATE cards SET owner_user_id=? WHERE id=?").run(newOwnerId, cardId);

const settlement = sqlite
  .prepare(
    `SELECT owner_user_id_snapshot, SUM(sold_price_idr) as net
     FROM transaction_items
     GROUP BY owner_user_id_snapshot`
  )
  .all() as Array<{ owner_user_id_snapshot: string; net: number }>;

const adminNet = settlement.find((r) => r.owner_user_id_snapshot === ownerId);
assert(
  adminNet?.net === 50000,
  `settlement shows 50000 for original owner (snapshot), not live owner (got ${adminNet?.net})`
);

const liveOwnerInSettlement = settlement.find(
  (r) => r.owner_user_id_snapshot === newOwnerId
);
assert(
  liveOwnerInSettlement == null,
  "live owner does NOT appear in settlement (snapshot is source of truth)"
);

sqlite.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
