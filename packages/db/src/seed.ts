import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";

export async function seed(db: BetterSQLite3Database<typeof schema>) {
  // ── payment channels ──────────────────────────────────────────────────
  const channels = [
    { name: "Cash", type: "cash", sortOrder: 0 },
    { name: "Other", type: "other", sortOrder: 999 },
  ];

  // Deactivate legacy channels replaced by defaults
  const legacyNames = ["Cash IDR", "BCA", "Mandiri", "BNI", "GoPay", "OVO", "Dana", "ShopeePay", "QRIS"];
  for (const legacyName of legacyNames) {
    const legacy = db
      .select()
      .from(schema.paymentChannels)
      .where(eq(schema.paymentChannels.name, legacyName))
      .get();
    if (legacy) {
      db.update(schema.paymentChannels)
        .set({ isActive: false, version: legacy.version + 1 })
        .where(eq(schema.paymentChannels.id, legacy.id))
        .run();
    }
  }

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
    } else {
      db.update(schema.paymentChannels)
        .set({ sortOrder: ch.sortOrder, isActive: true, version: exists.version + 1 })
        .where(eq(schema.paymentChannels.id, exists.id))
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

  // ── users (admin + cashier) ──────────────────────────────────────────
  const users = [
    { email: "admin@storio.id", password: "storio@admin.id", displayName: "Admin", role: "admin" as const },
    { email: "kasir@storio.id", password: "storio@kasir.id", displayName: "Kasir", role: "cashier" as const },
  ];

  for (const user of users) {
    const exists = db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, user.email))
      .get();
    if (!exists) {
      const hash = await bcrypt.hash(user.password, 12);
      db.insert(schema.users)
        .values({
          id: crypto.randomUUID(),
          email: user.email,
          passwordHash: hash,
          displayName: user.displayName,
          role: user.role,
        })
        .run();
      console.log(`[seed] user created: ${user.email} (${user.role})`);
    }
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
