import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function buildDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  // WAL mode for concurrent readers
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

export async function runMigrations(dbPath: string) {
  const { sqlite, db } = buildDb(dbPath);

  migrate(db, { migrationsFolder: join(__dirname, "../drizzle") });

  // Apply hand-authored triggers (drizzle-kit doesn't manage these)
  const triggers = readFileSync(
    join(__dirname, "triggers.sql"),
    "utf-8"
  );
  sqlite.exec(triggers);

  console.log("[migrate] migrations + triggers applied");
  return { sqlite, db };
}

// Run directly: tsx src/migrate.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.DATABASE_PATH ?? "kolektapos.db";
  const { sqlite } = await runMigrations(dbPath);
  sqlite.close();
}
