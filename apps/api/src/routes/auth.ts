import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { users } from "@kolektapos/db/schema";
import { LoginSchema } from "@kolektapos/types";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function authRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.post("/auth/login", async (request, reply) => {
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

    const passwordHash = user.passwordHash;
    let valid: boolean;

    // Support sha256: prefix from seed (dev only) + bcrypt for production
    if (passwordHash.startsWith("sha256:")) {
      const { createHash } = await import("crypto");
      const hash = "sha256:" + createHash("sha256").update(body.data.password).digest("hex");
      valid = hash === passwordHash;
    } else {
      valid = await bcrypt.compare(body.data.password, passwordHash);
    }

    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    request.session.userId = user.id;
    request.session.userRole = user.role;

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    });
  });

  app.post("/auth/logout", async (request, reply) => {
    await request.session.destroy();
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
