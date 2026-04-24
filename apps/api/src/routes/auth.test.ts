import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@kolektapos/db/schema";

// Set session secret before importing session plugin
process.env.SESSION_SECRET = "test-secret-that-is-at-least-32-characters-long";

import { authRoutes } from "./auth.js";
import { userRoutes } from "./users.js";
import { sessionPlugin } from "../plugins/session.js";

let app: ReturnType<typeof Fastify>;
let db: ReturnType<typeof drizzle>;
let sqlite: Database.Database;

async function buildTestApp() {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });

  // Create minimal schema
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now')),
      version INTEGER NOT NULL DEFAULT 1
    );
  `);

  // Seed admin user
  const bcrypt = await import("bcryptjs");
  const hash = await bcrypt.hash("changeme", 10);
  sqlite.prepare("INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)")
    .run("admin-id", "admin@test.com", hash, "Admin", "admin");

  const fastify = Fastify({ logger: false });
  await sessionPlugin(fastify);
  await authRoutes(fastify, { db });
  await userRoutes(fastify, { db });
  return fastify;
}

describe("auth routes", () => {
  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
    sqlite.close();
  });

  it("POST /auth/login succeeds with valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@test.com", password: "changeme" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.email).toBe("admin@test.com");
    expect(body.role).toBe("admin");
  });

  it("POST /auth/login fails with wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "admin@test.com", password: "wrong" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("POST /auth/login fails with unknown email", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@test.com", password: "changeme" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("GET /me returns 401 when unauthenticated", async () => {
    const res = await app.inject({ method: "GET", url: "/me" });
    expect(res.statusCode).toBe(401);
  });
});
