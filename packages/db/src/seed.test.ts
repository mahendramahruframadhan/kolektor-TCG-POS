import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";
import { seed } from "./seed.js";
import { runMigrations } from "./migrate.js";

async function freshDb() {
  const { sqlite, db } = await runMigrations(":memory:");
  return { db, sqlite };
}

describe("seed admin user", () => {
  it("does NOT create admin user when ADMIN_EMAIL / ADMIN_PASSWORD are unset", async () => {
    const prevEmail = process.env.ADMIN_EMAIL;
    const prevPassword = process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
    try {
      const { db, sqlite } = await freshDb();
      await seed(db);
      const admins = db.select().from(schema.users).all();
      expect(admins).toHaveLength(0);
      sqlite.close();
    } finally {
      if (prevEmail !== undefined) process.env.ADMIN_EMAIL = prevEmail;
      if (prevPassword !== undefined) process.env.ADMIN_PASSWORD = prevPassword;
    }
  });

  it("creates admin user with bcrypt hash when ADMIN_PASSWORD is set", async () => {
    process.env.ADMIN_EMAIL = "seed@test.local";
    process.env.ADMIN_PASSWORD = "a-strong-password-123";
    try {
      const { db, sqlite } = await freshDb();
      await seed(db);
      const admin = db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, "seed@test.local"))
        .get();
      expect(admin).toBeTruthy();
      expect(admin!.passwordHash.startsWith("sha256:")).toBe(false);
      expect(admin!.passwordHash.startsWith("$2")).toBe(true); // bcrypt prefix
      expect(await bcrypt.compare("a-strong-password-123", admin!.passwordHash)).toBe(true);
      sqlite.close();
    } finally {
      delete process.env.ADMIN_EMAIL;
      delete process.env.ADMIN_PASSWORD;
    }
  });
});
