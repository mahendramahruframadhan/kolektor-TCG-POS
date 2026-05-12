import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { users } from "@kolektapos/db/schema";
import { LoginSchema } from "@kolektapos/types";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

interface AuthUserPayload {
  id: string;
  email: string;
  displayName: string;
  role: string;
  offlineHash?: string;
  allUsersHash?: Array<{
    id: string;
    email: string;
    displayName: string;
    role: string;
    offlineHash: string;
  }>;
}

export async function authRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post("/auth/login", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = LoginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.email, body.data.email))
      .get();

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(body.data.password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    await new Promise<void>((resolve, reject) =>
      request.session.regenerate((err) => (err ? reject(err) : resolve()))
    );
    request.session.userId = user.id;
    request.session.userRole = user.role;

    const sessionUser: AuthUserPayload = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      offlineHash: user.passwordHash,
    };

    if (user.role === "admin") {
      const allCashiers = db.select().from(users).where(eq(users.role, "cashier")).all();
      sessionUser.allUsersHash = [
        { id: user.id, email: user.email, displayName: user.displayName, role: user.role, offlineHash: user.passwordHash },
        ...allCashiers.map(c => ({ id: c.id, email: c.email, displayName: c.displayName, role: c.role, offlineHash: c.passwordHash })),
      ];
    }

    return reply.send(sessionUser);
  });

  app.post("/auth/cache-credential", {
    preHandler: requireAuth,
  }, async (request, reply) => {
    if (request.session.userRole !== "cashier") {
      return reply.status(403).send({ error: "Only cashier can cache credentials for offline login" });
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.id, request.session.userId!))
      .get();

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return reply.send({
      email: user.email,
      offlineHash: user.passwordHash,
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      cachedAt: Math.floor(Date.now() / 1000),
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    await request.session.destroy();
    return reply.send({ ok: true });
  });

  app.post("/auth/change-password", {
    preHandler: requireAuth,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (request, reply) => {
    const body = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({ error: "Password baru minimal 8 karakter." });
    }

    const user = db.select().from(users).where(eq(users.id, request.session.userId!)).get();
    if (!user) return reply.status(404).send({ error: "User not found" });

    const valid = await bcrypt.compare(body.data.currentPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Password saat ini tidak valid." });
    }

    const newHash = await bcrypt.hash(body.data.newPassword, 12);
    db.update(users)
      .set({
        passwordHash: newHash,
        updatedAt: Math.floor(Date.now() / 1000),
        version: user.version + 1,
      })
      .where(eq(users.id, user.id))
      .run();

    return reply.send({ ok: true });
  });

  app.get("/me", async (request, reply) => {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const user = db
      .select()
      .from(users)
      .where(eq(users.id, request.session.userId))
      .get();

    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  });
}
