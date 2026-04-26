import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, transactions, transactionItems, settings } from "@kolektapos/db/schema";
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
  // Change 1: cap batch size at 100
  transactions: z.array(PendingTxSchema).min(1).max(100),
});

export async function flushPendingTxRoute(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  // Change 2: add rate limit config
  app.post(
    "/sync/flush-pending-tx",
    { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = FlushBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const cashierUserId = request.session.userId!;
      const nowSec = Math.floor(Date.now() / 1000);

      // Read max_transaction_discount_pct once before the loop (avoid N+1 reads)
      const maxTxDiscPctRow = db.select().from(settings).where(eq(settings.key, "max_transaction_discount_pct")).get();
      const maxTxDiscPct = maxTxDiscPctRow ? JSON.parse(maxTxDiscPctRow.valueJson) as number : 100;

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

        // Change 3a: pre-fetch cardMap BEFORE the transaction so validation can abort cleanly
        const cardIds = tx.items.map((i) => i.cardId);
        const cardRows = db
          .select()
          .from(cards)
          .where(inArray(cards.id, cardIds))
          .all();
        const cardMap = new Map(cardRows.map((c) => [c.id, c]));

        // Change 3b/3c: validate totals and per-item rules; throw inside the transaction to
        // guarantee rollback — better-sqlite3 only rolls back on thrown exceptions, not plain return.
        let rejectReason: string | null = null;

        try {
          db.transaction(() => {
            // Change 3c: verify subtotal and total arithmetic
            const computedSubtotal = tx.items.reduce((sum, item) => sum + item.soldPriceIdr, 0);
            if (computedSubtotal !== tx.subtotalIdr) {
              throw new Error("subtotalIdr mismatch");
            }
            if (tx.totalIdr !== tx.subtotalIdr - tx.discountIdr) {
              throw new Error("totalIdr mismatch");
            }

            // Enforce max_transaction_discount_pct cap
            if (tx.discountIdr > 0) {
              const maxDiscountIdr = Math.floor(tx.subtotalIdr * maxTxDiscPct / 100);
              if (tx.discountIdr > maxDiscountIdr) {
                throw new Error(`Transaction discount exceeds max ${maxTxDiscPct}%`);
              }
            }

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

            // Change 3a/3b: validate each item and override ownerUserIdSnapshot with server truth
            for (const item of tx.items) {
              const card = cardMap.get(item.cardId);
              if (!card) {
                throw new Error(`Card ${item.cardId} not found`);
              }

              // Override client-supplied snapshot with server's authoritative owner
              const verifiedOwner = card.ownerUserId;

              // Change 3b: price floor check for negotiable cards
              if (card.pricingMode === "negotiable" && card.bottomPriceIdr !== null) {
                if (item.soldPriceIdr < card.bottomPriceIdr && !item.overrideBelowBottom) {
                  throw new Error(`soldPriceIdr below floor for card ${item.cardId}`);
                }
              }

              db.insert(transactionItems)
                .values({
                  id: crypto.randomUUID(),
                  transactionId: txId,
                  cardId: item.cardId,
                  ownerUserIdSnapshot: verifiedOwner,
                  listedPriceIdrSnapshot: item.listedPriceIdrSnapshot,
                  soldPriceIdr: item.soldPriceIdr,
                  lineDiscountIdr: item.lineDiscountIdr,
                  lineDiscountReason: item.lineDiscountReason,
                  overrideBelowBottom: item.overrideBelowBottom,
                  overrideReason: item.overrideReason,
                })
                .run();
            }

            for (const cardId of cardIds) {
              const card = cardMap.get(cardId);
              db.update(cards)
                .set({
                  status: "sold",
                  // Change 4: preserve oversold flag once set; only set it if card was already sold
                  oversold: (card?.oversold === true) ? true : (card?.status === "sold"),
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
        } catch (err) {
          rejectReason = err instanceof Error ? err.message : "internal error";
        }

        if (rejectReason) {
          results.push({ clientId: tx.clientId, status: "rejected", reason: rejectReason });
          continue;
        }

        results.push({ clientId: tx.clientId, status: "accepted", serverTransactionId: txId });
      }

      return reply.send({ results, processedAt: nowSec });
    }
  );
}
