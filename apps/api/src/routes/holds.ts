import type { FastifyInstance } from "fastify";
import { eq, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, holds } from "@kolektapos/db/schema";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function holdRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // POST /holds — create a hold on a card
  app.post("/holds", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      cardId?: string;
      customerLabel?: string;
      expiresInMinutes?: number;
      notes?: string;
    };

    if (!body.cardId || typeof body.cardId !== "string") {
      return reply.status(400).send({ error: "cardId is required" });
    }
    if (typeof body.expiresInMinutes !== "number" || body.expiresInMinutes <= 0) {
      return reply.status(400).send({ error: "expiresInMinutes must be a positive number" });
    }

    const card = db.select().from(cards).where(eq(cards.id, body.cardId)).get();
    if (!card) {
      return reply.status(404).send({ error: "Card not found" });
    }
    if (card.status !== "available") {
      return reply
        .status(409)
        .send({ error: `Card is not available (status: ${card.status})` });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = nowSec + Math.floor(body.expiresInMinutes) * 60;
    const holdId = crypto.randomUUID();
    const heldByUserId = request.session.userId!;

    db.transaction(() => {
      db.insert(holds)
        .values({
          id: holdId,
          cardId: body.cardId!,
          heldByUserId,
          customerLabel: body.customerLabel ?? "",
          expiresAt,
          notes: body.notes ?? "",
        })
        .run();

      db.update(cards)
        .set({ status: "held", updatedAt: nowSec })
        .where(eq(cards.id, body.cardId!))
        .run();
    });

    const hold = db.select().from(holds).where(eq(holds.id, holdId)).get();
    return reply.status(201).send(hold);
  });

  // DELETE /holds/:id — release a hold manually
  app.delete(
    "/holds/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const hold = db.select().from(holds).where(eq(holds.id, id)).get();
      if (!hold) return reply.status(404).send({ error: "Hold not found" });
      if (hold.releasedAt !== null) {
        return reply.status(409).send({ error: "Hold already released" });
      }

      const nowSec = Math.floor(Date.now() / 1000);

      db.transaction(() => {
        db.update(holds)
          .set({ releasedAt: nowSec, releaseReason: "manual_release" })
          .where(eq(holds.id, id))
          .run();

        db.update(cards)
          .set({ status: "available", updatedAt: nowSec })
          .where(eq(cards.id, hold.cardId))
          .run();
      });

      return reply.status(204).send();
    }
  );

  // GET /holds/active — list all unreleased holds
  app.get(
    "/holds/active",
    { preHandler: requireAuth },
    async (_request, reply) => {
      const activeHolds = db
        .select()
        .from(holds)
        .where(isNull(holds.releasedAt))
        .all();

      return reply.send(activeHolds);
    }
  );
}
