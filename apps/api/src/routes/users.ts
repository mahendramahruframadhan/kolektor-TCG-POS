import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { users } from "@kolektapos/db/schema";
import { CreateUserSchema, UpdateUserSchema } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function userRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // List all users (any authenticated user — cashiers need this for stock-receive owner dropdown)
  app.get("/users", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .all();
    return reply.send(rows);
  });

  // Create user (admin only)
  app.post("/users", { preHandler: requireAdmin }, async (request, reply) => {
    const body = CreateUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const existing = db
      .select()
      .from(users)
      .where(eq(users.email, body.data.email))
      .get();
    if (existing) {
      return reply.status(409).send({ error: "Email already in use" });
    }

    const passwordHash = await bcrypt.hash(body.data.password, 12);
    const id = crypto.randomUUID();

    db.insert(users)
      .values({
        id,
        email: body.data.email,
        passwordHash,
        displayName: body.data.displayName,
        role: body.data.role,
      })
      .run();

    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    return reply.status(201).send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  });

  // Update user (admin only)
  app.patch("/users/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateUserSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return reply.status(404).send({ error: "Not found" });

    const updates: Partial<typeof users.$inferInsert> = {};
    if (body.data.displayName) updates.displayName = body.data.displayName;
    if (body.data.role) updates.role = body.data.role;
    if (body.data.password) {
      updates.passwordHash = await bcrypt.hash(body.data.password, 12);
    }
    updates.updatedAt = Math.floor(Date.now() / 1000);
    updates.version = user.version + 1;

    db.update(users).set(updates).where(eq(users.id, id)).run();

    const updated = db.select().from(users).where(eq(users.id, id)).get()!;
    return reply.send({ id: updated.id, email: updated.email, displayName: updated.displayName, role: updated.role });
  });

  // Get own profile (any authenticated user)
  app.get("/users/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Cashiers can only see themselves
    if (request.session.userRole !== "admin" && request.session.userId !== id) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return reply.status(404).send({ error: "Not found" });

    return reply.send({ id: user.id, email: user.email, displayName: user.displayName, role: user.role });
  });
}
