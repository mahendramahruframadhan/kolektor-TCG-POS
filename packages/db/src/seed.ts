import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";

export async function seed(db: BetterSQLite3Database<typeof schema>) {
  // ── payment channels ──────────────────────────────────────────────────
  const channels = [
    { name: "Cash IDR", type: "cash", sortOrder: 0 },
    { name: "BCA", type: "bank_transfer", sortOrder: 1 },
    { name: "Mandiri", type: "bank_transfer", sortOrder: 2 },
    { name: "BNI", type: "bank_transfer", sortOrder: 3 },
    { name: "GoPay", type: "ewallet", sortOrder: 4 },
    { name: "OVO", type: "ewallet", sortOrder: 5 },
    { name: "Dana", type: "ewallet", sortOrder: 6 },
    { name: "ShopeePay", type: "ewallet", sortOrder: 7 },
    { name: "QRIS", type: "qris", sortOrder: 8 },
    { name: "Other", type: "other", sortOrder: 9 },
  ];

  for (const ch of channels) {
    const exists = db
      .select()
      .from(schema.paymentChannels)
      .where(eq(schema.paymentChannels.name, ch.name))
      .get();
    if (!exists) {
      db.insert(schema.paymentChannels)
        .values({ id: crypto.randomUUID(), ...ch })
        .run();
    }
  }

  // ── default settings (§5.1 F35) ──────────────────────────────────────
  const defaults: { key: string; value: number | string }[] = [
    { key: "max_line_discount_pct_fixed", value: 20 },
    { key: "max_transaction_discount_pct", value: 30 },
    { key: "cart_idle_ttl_minutes", value: 30 },
    { key: "default_landing_page", value: "pos" },
  ];

  for (const { key, value } of defaults) {
    const exists = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, key))
      .get();
    if (!exists) {
      db.insert(schema.settings)
        .values({ id: crypto.randomUUID(), key, valueJson: JSON.stringify(value) })
        .run();
    }
  }

  // ── admin user (explicit env, bcrypt only) ───────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    console.log("[seed] ADMIN_EMAIL/ADMIN_PASSWORD unset — skipping admin user creation.");
    console.log("[seed] done");
    return;
  }

  const exists = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .get();
  if (!exists) {
    const hash = await bcrypt.hash(adminPassword, 12);
    db.insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        email: adminEmail,
        passwordHash: hash,
        displayName: "Revota",
        role: "admin",
      })
      .run();
    console.log(`[seed] admin user created: ${adminEmail}`);
  }

  console.log("[seed] done");
}

// Run directly: tsx src/seed.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.DATABASE_PATH ?? "kolektapos.db";
  const sqlite = new Database(dbPath);
  const db = drizzle(sqlite, { schema });
  await seed(db);
  sqlite.close();
}
