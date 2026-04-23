import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import bcrypt from "bcryptjs";
import * as schema from "@kolektapos/db/schema";

process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { syncRoutes } from "./sync.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let sqlite: Database.Database;
let cookie: string;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });

  // Load the full schema from the drizzle migration so every column
  // selected by /sync/pull resolves correctly.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = resolve(
    __dirname,
    "../../../../packages/db/drizzle"
  );
  for (const file of ["0000_faulty_cerebro.sql", "0001_good_talos.sql"]) {
    const sql = readFileSync(resolve(migrationsDir, file), "utf8").replace(
      /-->\s*statement-breakpoint/g,
      ""
    );
    sqlite.exec(sql);
  }

  const hash = await bcrypt.hash("pw-secret-12345", 10);
  sqlite
    .prepare(
      "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)"
    )
    .run("u1", "cashier@test.com", hash, "Cashier", "cashier");

  app = Fastify({ logger: false });
  await sessionPlugin(app);
  await authRoutes(app, { db });
  await syncRoutes(app, { db });

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email: "cashier@test.com", password: "pw-secret-12345" },
  });
  cookie = login.headers["set-cookie"] as string;
});

afterAll(async () => {
  await app.close();
  sqlite.close();
});

describe("/sync/pull user payload redaction", () => {
  it("does NOT leak passwordHash in initial pull (cursor=0)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sync/pull?cursor=0",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      changes: Array<{ entityType: string; payload: Record<string, unknown> }>;
    };
    const userChanges = body.changes.filter((c) => c.entityType === "user");
    expect(userChanges.length).toBeGreaterThan(0);
    for (const c of userChanges) {
      expect(c.payload).not.toHaveProperty("passwordHash");
      expect(c.payload).not.toHaveProperty("password_hash");
    }
  });

  it("does NOT leak passwordHash in delta pull (cursor=1)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/sync/pull?cursor=1",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      changes: Array<{ entityType: string; payload: Record<string, unknown> }>;
    };
    // Delta branch emits users via the user DTO too
    const userChanges = body.changes.filter((c) => c.entityType === "user");
    for (const c of userChanges) {
      expect(c.payload).not.toHaveProperty("passwordHash");
      expect(c.payload).not.toHaveProperty("password_hash");
    }
  });
});
