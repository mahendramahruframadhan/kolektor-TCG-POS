import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type Database from "better-sqlite3";

/**
 * Apply the full Drizzle-generated schema to an in-memory SQLite instance for tests.
 * Auto-discovers every `.sql` file in `packages/db/drizzle/` in lexical order so a
 * new migration is picked up without hand-editing each test file.
 */
export function applyDrizzleMigrations(sqlite: Database.Database): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(__dirname, "../../../packages/db/drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8").replace(
      /-->\s*statement-breakpoint/g,
      ""
    );
    sqlite.exec(sql);
  }
}
