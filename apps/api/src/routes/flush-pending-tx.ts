import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, transactions, transactionItems } from "@kolektapos/db/schema";
import { eq, inArray } from "drizzle-orm";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

const PendingItemSchema = z.object({
  cardId: z.string().uuid(),
  ownerUserIdSnapshot: z.string(),
  listedPriceIdrSnapshot: z.number().int(),
  intendedPriceIdr: z.number().int(),
  lineDiscountIdr: z.number().int().default(0),
  lineDiscountReason: z.string().optional(),
  overrideBelowBottom: z.boolean().default(false),
  overrideReason: z.string().optional(),
  soldPriceIdr: z.number().int(),
});

const PendingTxSchema = z.object({
  clientId: z.string().uuid(),
  cartClientId: z.string().uuid(),
  eventId: z.string(),
  items: z.array(PendingItemSchema).min(1),
  subtotalIdr: z.number().int(),
  discountIdr: z.number().int().default(0),
  discountReason: z.string().optional(),
  totalIdr: z.number().int(),
  paymentChannelId: z.string().uuid().nullable().optional(),
  paymentNote: z.string().optional(),
  notes: z.string().optional(),
  paidAt: z.number().int(),
});

const FlushBodySchema = z.object({
  transactions: z.array(PendingTxSchema).min(1),
});

export async function flushPendingTxRoute(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  app.post(
    "/sync/flush-pending-tx",
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = FlushBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const cashierUserId = request.session.userId!;
      const nowSec = Math.floor(Date.now() / 1000);
      const results: {
        clientId: string;
        status: "accepted" | "rejected";
        serverTransactionId?: string;
        reason?: string;
      }[] = [];

      for (const tx of parsed.data.transactions) {
        const existing = db
          .select()
          .from(transactions)
          .where(eq(transactions.clientId, tx.clientId))
          .get();

        if (existing) {
          results.push({ clientId: tx.clientId, status: "accepted", serverTransactionId: existing.id });
          continue;
        }

        const txId = crypto.randomUUID();

        db.transaction(() => {
          db.insert(transactions)
            .values({
              id: txId,
              clientId: tx.clientId,
              cartId: null,
              eventId: tx.eventId,
              cashierUserId,
              kind: "sale",
              subtotalIdr: tx.subtotalIdr,
              discountIdr: tx.discountIdr,
              discountReason: tx.discountReason,
              totalIdr: tx.totalIdr,
              paymentChannelId: tx.paymentChannelId ?? null,
              paymentNote: tx.paymentNote,
              paidAt: nowSec,
              notes: tx.notes,
            })
            .run();

          for (const item of tx.items) {
            db.insert(transactionItems)
              .values({
                id: crypto.randomUUID(),
                transactionId: txId,
                cardId: item.cardId,
                ownerUserIdSnapshot: item.ownerUserIdSnapshot,
                listedPriceIdrSnapshot: item.listedPriceIdrSnapshot,
                soldPriceIdr: item.soldPriceIdr,
                lineDiscountIdr: item.lineDiscountIdr,
                lineDiscountReason: item.lineDiscountReason,
                overrideBelowBottom: item.overrideBelowBottom,
                overrideReason: item.overrideReason,
              })
              .run();
          }

          const cardIds = tx.items.map((i) => i.cardId);
          const cardRows = db
            .select()
            .from(cards)
            .where(inArray(cards.id, cardIds))
            .all();
          const cardMap = new Map(cardRows.map((c) => [c.id, c]));

          for (const cardId of cardIds) {
            const card = cardMap.get(cardId);
            db.update(cards)
              .set({
                status: "sold",
                oversold: card?.status === "sold" ? true : false,
                lockedByCartId: null,
                lockedByUserId: null,
                lockedAt: null,
                updatedAt: nowSec,
                version: (card?.version ?? 1) + 1,
              })
              .where(eq(cards.id, cardId))
              .run();
          }
        });

        results.push({ clientId: tx.clientId, status: "accepted", serverTransactionId: txId });
      }

      return reply.send({ results, processedAt: nowSec });
    }
  );
}
