import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { events } from "@kolektapos/db/schema";
import { CreateEventSchema, UpdateEventSchema } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function eventRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/events", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db.select().from(events).all();
    return reply.send(rows);
  });

  app.get("/events/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.select().from(events).where(eq(events.id, id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });

  app.post("/events", { preHandler: requireAdmin }, async (request, reply) => {
    const body = CreateEventSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Single active event at a time (§F3)
    if (body.data.status === "active") {
      const active = db
        .select()
        .from(events)
        .where(eq(events.status, "active"))
        .get();
      if (active) {
        return reply
          .status(409)
          .send({ error: "Another event is already active. Close it first." });
      }
    }

    const id = crypto.randomUUID();
    db.insert(events).values({ id, ...body.data }).run();
    return reply.status(201).send(db.select().from(events).where(eq(events.id, id)).get());
  });

  app.patch("/events/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdateEventSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const event = db.select().from(events).where(eq(events.id, id)).get();
    if (!event) return reply.status(404).send({ error: "Not found" });

    if (event.version !== body.data.version) {
      return reply.status(409).send({ error: "Version conflict", currentVersion: event.version });
    }

    if (body.data.status === "active") {
      const active = db
        .select()
        .from(events)
        .where(eq(events.status, "active"))
        .get();
      if (active && active.id !== id) {
        return reply.status(409).send({ error: "Another event is already active." });
      }
    }

    const { version: _v, ...updates } = body.data;
    db.update(events)
      .set({
        ...updates,
        updatedAt: Math.floor(Date.now() / 1000),
        version: event.version + 1,
      })
      .where(eq(events.id, id))
      .run();

    return reply.send(db.select().from(events).where(eq(events.id, id)).get());
  });
}
