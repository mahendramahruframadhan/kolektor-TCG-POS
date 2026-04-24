import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { backupRoute } from "./backup.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;
let dbPath: string;
let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "kolektapos-backup-test-"));
  dbPath = join(dir, "app.sqlite");
  const photoDir = join(dir, "photos");

  sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      display_name TEXT,
      role TEXT DEFAULT 'cashier',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      version INTEGER DEFAULT 1
    );
  `);

  const hash = await bcrypt.hash("pw-12345", 10);
  sqlite.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
  ).run("u-admin", "a@t.com", hash, "Admin", "admin");

  const db = drizzle(sqlite, { schema });
  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await backupRoute(app, { dbPath, photoStoragePath: photoDir });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "a@t.com", password: "pw-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe("GET /backup", () => {
  it("returns a non-empty zip with the PK header", async () => {
    // Mutate the DB so there's fresh data to capture.
    for (let i = 0; i < 20; i++) {
      sqlite.prepare(
        "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
      ).run(`u-${i}`, `u${i}@t.com`, "x", `U${i}`, "cashier");
    }

    const res = await app.inject({
      method: "GET",
      url: "/backup",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.rawPayload.length).toBeGreaterThan(100);
    // PK zip header
    expect(res.rawPayload[0]).toBe(0x50);
    expect(res.rawPayload[1]).toBe(0x4b);
  });

  it("does not 500 when called twice back-to-back (tempfile not orphaned)", async () => {
    const r1 = await app.inject({ method: "GET", url: "/backup", headers: { cookie } });
    const r2 = await app.inject({ method: "GET", url: "/backup", headers: { cookie } });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
  });
});
