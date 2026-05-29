import type { FastifyInstance } from "fastify";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { transactions, transactionItems, users, events, paymentChannels, cards } from "@kolektapos/db/schema";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function pendingTransactionsAdminRoute(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  app.get(
    "/admin/pending-transactions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = request.session.userId;
      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const userRow = db.select().from(users).where(eq(users.id, user)).get();
      if (!userRow || userRow.role !== "admin") {
        return reply.status(403).send({ error: "Admin only" });
      }

      const eventRows = db.select().from(events).all();
      const channelRows = db.select().from(paymentChannels).all();
      const allCashiers = db.select().from(users).where(eq(users.role, "cashier")).all();

      const allTxRows = db.select().from(transactions).all();
      const allTxItems = db.select().from(transactionItems).all();

      const transactionList = allTxRows.map((tx) => {
        const cashier = allCashiers.find((c) => c.id === tx.cashierUserId);
        const event = eventRows.find((e) => e.id === tx.eventId);
        const channel = tx.paymentChannelId
          ? channelRows.find((c) => c.id === tx.paymentChannelId)
          : null;
        const items = allTxItems.filter((ti) => ti.transactionId === tx.id);

        return {
          id: tx.id,
          clientId: tx.clientId,
          cashierId: tx.cashierUserId,
          cashierDisplayName: cashier?.displayName ?? "Unknown",
          cashierEmail: cashier?.email ?? "",
          eventId: tx.eventId,
          eventName: event?.name ?? "Unknown Event",
          subtotalIdr: tx.subtotalIdr,
          discountIdr: tx.discountIdr,
          totalIdr: tx.totalIdr,
          paymentChannel: channel?.name ?? "Cash",
          itemCount: items.length,
          createdAt: tx.createdAt,
          paidAt: tx.paidAt,
          kind: tx.kind,
        };
      });

      const totalPending = transactionList.filter((t) => t.kind === "sale").length;
      const totalAmount = transactionList
        .filter((t) => t.kind === "sale")
        .reduce((sum, t) => sum + t.totalIdr, 0);

      const byCashier = allCashiers.map((cashier) => {
        const cashierTxs = transactionList.filter((t) => t.cashierId === cashier.id && t.kind === "sale");
        return {
          cashierId: cashier.id,
          cashierDisplayName: cashier.displayName,
          count: cashierTxs.length,
          amount: cashierTxs.reduce((sum, t) => sum + t.totalIdr, 0),
        };
      }).filter((c) => c.count > 0);

      return reply.send({
        transactions: transactionList.sort((a, b) => b.createdAt - a.createdAt),
        totalCount: transactionList.length,
        stats: {
          totalPending,
          totalAmount,
          byCashier,
        },
      });
    }
  );

  app.get(
    "/admin/pending-transactions/:transactionId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const user = request.session.userId;
      if (!user) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const userRow = db.select().from(users).where(eq(users.id, user)).get();
      if (!userRow || userRow.role !== "admin") {
        return reply.status(403).send({ error: "Admin only" });
      }

      const { transactionId } = request.params as { transactionId: string };

      const tx = db.select().from(transactions).where(eq(transactions.id, transactionId)).get();
      if (!tx) {
        return reply.status(404).send({ error: "Transaction not found" });
      }

      const cashier = db.select().from(users).where(eq(users.id, tx.cashierUserId)).get();
      const event = db.select().from(events).where(eq(events.id, tx.eventId)).get();
      const channel = tx.paymentChannelId
        ? db.select().from(paymentChannels).where(eq(paymentChannels.id, tx.paymentChannelId)).get()
        : null;
      const items = db.select().from(transactionItems).where(eq(transactionItems.transactionId, tx.id)).all();

      const cardIds = items.map((i) => i.cardId);
      const ownerIds = [...new Set(items.map((i) => i.ownerUserIdSnapshot))];

      const cardRows = cardIds.length
        ? db.select({ id: cards.id, title: cards.title, shortId: cards.shortId })
            .from(cards).where(inArray(cards.id, cardIds)).all()
        : [];
      const ownerRows = ownerIds.length
        ? db.select({ id: users.id, displayName: users.displayName })
            .from(users).where(inArray(users.id, ownerIds)).all()
        : [];

      const cardMap = new Map(cardRows.map((c) => [c.id, c]));
      const ownerMap = new Map(ownerRows.map((u) => [u.id, u]));

      const itemsWithCards = items.map((item) => {
        const card = cardMap.get(item.cardId);
        const owner = ownerMap.get(item.ownerUserIdSnapshot);
        return {
          ...item,
          cardTitle: card?.title ?? "Unknown",
          cardShortId: card?.shortId ?? "",
          ownerDisplayName: owner?.displayName ?? "Unknown",
        };
      });

      return reply.send({
        transaction: {
          id: tx.id,
          clientId: tx.clientId,
          kind: tx.kind,
          subtotalIdr: tx.subtotalIdr,
          discountIdr: tx.discountIdr,
          discountReason: tx.discountReason,
          totalIdr: tx.totalIdr,
          paymentChannel: channel?.name ?? "Cash",
          paymentNote: tx.paymentNote,
          notes: tx.notes,
          createdAt: tx.createdAt,
          paidAt: tx.paidAt,
          cashier: {
            id: cashier?.id,
            displayName: cashier?.displayName ?? "Unknown",
            email: cashier?.email ?? "",
          },
          event: {
            id: event?.id,
            name: event?.name ?? "Unknown",
          },
          items: itemsWithCards,
        },
      });
    }
  );
}