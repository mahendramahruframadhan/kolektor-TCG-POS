import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import * as schema from "./schema.js";

// Minimal bcrypt-equivalent using SHA-256 for seed only.
// Production uses bcrypt via the API layer.
function hashPassword(plain: string): string {
  return "sha256:" + createHash("sha256").update(plain).digest("hex");
}

export async function seed(db: ReturnType<typeof drizzle>) {
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
  const defaults = [
    { key: "max_line_discount_pct_fixed", value: 20 },
    { key: "max_transaction_discount_pct", value: 30 },
    { key: "cart_idle_ttl_minutes", value: 30 },
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

  // ── admin user (env-seeded password) ─────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@kolekta.id";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme";
  const exists = db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, adminEmail))
    .get();
  if (!exists) {
    db.insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        email: adminEmail,
        passwordHash: hashPassword(adminPassword),
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
