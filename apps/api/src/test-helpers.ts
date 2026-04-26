import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";
import { applyDrizzleMigrations } from "./test-migrations.js";

export type TestDb = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

/**
 * Create an in-memory SQLite database with all migrations applied.
 * Call this in `beforeAll`; close with `sqlite.close()` in `afterAll`.
 */
export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  applyDrizzleMigrations(sqlite);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export interface SeedUserOpts {
  id?: string;
  email?: string;
  displayName?: string;
  role?: "admin" | "cashier";
  password?: string;
  /** Pass a pre-hashed value to skip bcrypt (e.g. a placeholder like "hash") */
  passwordHash?: string;
}

/**
 * Insert a test user. Returns the user id.
 * Defaults: role="cashier", password="test-pw-12345" (bcrypt cost 4 for speed).
 * If `passwordHash` is provided it is used directly and `password` is ignored.
 */
export async function seedUser(
  sqlite: Database.Database,
  opts: SeedUserOpts = {}
): Promise<string> {
  const id = opts.id ?? crypto.randomUUID();
  const email = opts.email ?? `user-${id.slice(0, 8)}@test.com`;
  const role = opts.role ?? "cashier";
  const displayName = opts.displayName ?? "Test User";
  let hash: string;
  if (opts.passwordHash !== undefined) {
    hash = opts.passwordHash;
  } else {
    const password = opts.password ?? "test-pw-12345";
    hash = await bcrypt.hash(password, 4); // cost 4 for test speed
  }
  sqlite
    .prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, email, hash, displayName, role);
  return id;
}

export interface SeedEventOpts {
  id?: string;
  name?: string;
  status?: "draft" | "active" | "closed";
}

/**
 * Insert a test event. Returns the event id.
 * Defaults: status="active".
 * `venue` is NOT NULL with default "" in the schema — omitted here, SQLite uses the default.
 * `version` is NOT NULL with default 1 — also omitted, SQLite uses the default.
 */
export function seedEvent(
  sqlite: Database.Database,
  opts: SeedEventOpts = {}
): string {
  const id = opts.id ?? crypto.randomUUID();
  const name = opts.name ?? "Test Event";
  const status = opts.status ?? "active";
  sqlite
    .prepare(
      "INSERT INTO events (id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)"
    )
    .run(id, name, "2026-04-26", "2026-04-27", status);
  return id;
}
