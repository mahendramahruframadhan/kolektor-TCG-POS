import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards } from "@kolektapos/db/schema";
import { CreateCardSchema, UpdateCardSchema } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function cardRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // GET /cards — list all cards
  app.get("/cards", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db.select().from(cards).all();
    return reply.send(rows);
  });

  // GET /cards/:id — get card by UUID
  app.get("/cards/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.select().from(cards).where(eq(cards.id, id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });
    return reply.send(row);
  });

  // GET /cards/by-short-id/:shortId — get card by O-XXXXX short ID
  app.get(
    "/cards/by-short-id/:shortId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { shortId } = request.params as { shortId: string };
      const row = db.select().from(cards).where(eq(cards.shortId, shortId)).get();
      if (!row) return reply.status(404).send({ error: "Not found" });
      return reply.send(row);
    }
  );

  // POST /cards — create card (any authenticated user, intake flow)
  app.post("/cards", { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateCardSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Idempotency: if clientId already exists, return existing row
    const existing = db
      .select()
      .from(cards)
      .where(eq(cards.clientId, body.data.clientId))
      .get();
    if (existing) {
      return reply.status(200).send(existing);
    }

    const id = crypto.randomUUID();
    db.insert(cards).values({ id, ...body.data }).run();
    return reply
      .status(201)
      .send(db.select().from(cards).where(eq(cards.id, id)).get());
  });

  // PATCH /cards/:id — update card (optimistic concurrency via version)
  app.patch(
    "/cards/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = UpdateCardSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const card = db.select().from(cards).where(eq(cards.id, id)).get();
      if (!card) return reply.status(404).send({ error: "Not found" });

      if (card.version !== body.data.version) {
        return reply
          .status(409)
          .send({ error: "Version conflict", currentVersion: card.version });
      }

      const { version: _v, ...updates } = body.data;
      db.update(cards)
        .set({
          ...updates,
          updatedAt: Math.floor(Date.now() / 1000),
          version: card.version + 1,
        })
        .where(eq(cards.id, id))
        .run();

      return reply.send(db.select().from(cards).where(eq(cards.id, id)).get());
    }
  );
}
