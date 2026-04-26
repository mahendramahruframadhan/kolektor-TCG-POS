import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq, inArray, and, ne, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, transactions, transactionItems } from "@kolektapos/db/schema";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";
import { parsePagination } from "../utils/pagination.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function transactionRoutes(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  // GET /transactions — list transactions, optionally filtered by eventId
  app.get(
    "/transactions",
    { preHandler: requireAuth },
    async (request, reply) => {
      const query = request.query as { eventId?: string };
      const { limit, offset } = parsePagination(query);

      const base = db.select().from(transactions);
      const rows = query.eventId
        ? base.where(eq(transactions.eventId, query.eventId)).limit(limit).offset(offset).all()
        : base.limit(limit).offset(offset).all();

      return reply.send(rows);
    }
  );

  // GET /transactions/:id — get one transaction with its items
  app.get(
    "/transactions/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const tx = db
        .select()
        .from(transactions)
        .where(eq(transactions.id, id))
        .get();
      if (!tx) return reply.status(404).send({ error: "Transaction not found" });

      const items = db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, id))
        .all();

      return reply.send({ ...tx, items });
    }
  );

  // POST /transactions/:id/void — void a sale transaction
  app.post(
    "/transactions/:id/void",
    { preHandler: requireAdmin },
    async (request, reply) => {
      return handleVoidRefund(app, db, request, reply, "void");
    }
  );

  // POST /transactions/:id/refund — refund a sale transaction
  app.post(
    "/transactions/:id/refund",
    { preHandler: requireAdmin },
    async (request, reply) => {
      return handleVoidRefund(app, db, request, reply, "refund");
    }
  );
}

async function handleVoidRefund(
  _app: FastifyInstance,
  db: Db,
  request: FastifyRequest,
  reply: FastifyReply,
  kind: "void" | "refund"
) {
  const { id: parentId } = request.params as { id: string };
  const body = request.body as { reason?: string; clientId?: string };

  if (!body.reason || typeof body.reason !== "string" || body.reason.trim() === "") {
    return reply.status(400).send({ error: "reason is required" });
  }
  if (!body.clientId || typeof body.clientId !== "string") {
    return reply.status(400).send({ error: "clientId is required for idempotency" });
  }

  // Idempotency: if this clientId already exists, return the existing transaction
  const existingTx = db
    .select()
    .from(transactions)
    .where(eq(transactions.clientId, body.clientId))
    .get();
  if (existingTx) {
    const existingItems = db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, existingTx.id))
      .all();
    return reply.status(200).send({ transaction: existingTx, items: existingItems });
  }

  // Fetch parent transaction
  const parent = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, parentId))
    .get();
  if (!parent) {
    return reply.status(404).send({ error: "Parent transaction not found" });
  }
  if (parent.kind !== "sale") {
    return reply
      .status(422)
      .send({ error: "Only sale transactions can be voided or refunded" });
  }

  // Check if already voided — look for a void child transaction
  const existingVoid = db
    .select()
    .from(transactions)
    .where(eq(transactions.parentTransactionId, parentId))
    .all()
    .find((t) => t.kind === "void");

  if (existingVoid) {
    return reply
      .status(409)
      .send({ error: "Transaction has already been voided", voidTransactionId: existingVoid.id });
  }

  // Fetch parent items
  const parentItems = db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, parentId))
    .all();

  // Annotate request so the audit onSend hook can capture the reason from the
  // request body (not visible in the response body).
  (request as unknown as { auditExtra?: unknown }).auditExtra = {
    voidOrRefundReason: body.reason,
    parentTransactionId: parentId,
    kind,
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const cashierUserId = request.session.userId!;

  // Negate totals for the new transaction
  const subtotalIdr = -parent.subtotalIdr;
  const discountIdr = -parent.discountIdr;
  const totalIdr = -parent.totalIdr;

  const newTxId = crypto.randomUUID();

  db.transaction(() => {
    // INSERT new void/refund transaction (insert-only — no UPDATE/DELETE ever)
    db.insert(transactions)
      .values({
        id: newTxId,
        clientId: body.clientId!,
        cartId: parent.cartId,
        eventId: parent.eventId,
        cashierUserId,
        kind,
        parentTransactionId: parentId,
        subtotalIdr,
        discountIdr,
        discountReason: parent.discountReason,
        totalIdr,
        paymentChannelId: parent.paymentChannelId,
        paymentNote: parent.paymentNote,
        paidAt: nowSec,
        voidOrRefundReason: body.reason,
      })
      .run();

    // INSERT transaction_items mirroring the parent with negated sold prices
    for (const item of parentItems) {
      db.insert(transactionItems)
        .values({
          id: crypto.randomUUID(),
          transactionId: newTxId,
          cardId: item.cardId,
          ownerUserIdSnapshot: item.ownerUserIdSnapshot,
          listedPriceIdrSnapshot: item.listedPriceIdrSnapshot,
          soldPriceIdr: -item.soldPriceIdr,
          lineDiscountIdr: -item.lineDiscountIdr,
          lineDiscountReason: item.lineDiscountReason,
          overrideBelowBottom: item.overrideBelowBottom,
          overrideReason: item.overrideReason,
        })
        .run();
    }

    // Set cards.status = 'available' only if no other un-voided sale references the card
    const cardIds = parentItems.map((i) => i.cardId);
    if (cardIds.length > 0) {
      for (const cardId of cardIds) {
        // Find any other sale transactions referencing this card (excluding the one being voided/refunded)
        const otherSales = db
          .select({ id: transactions.id })
          .from(transactionItems)
          .innerJoin(transactions, eq(transactions.id, transactionItems.transactionId))
          .where(
            and(
              eq(transactionItems.cardId, cardId),
              eq(transactions.kind, "sale"),
              ne(transactions.id, parentId),
            )
          )
          .all();

        // Among those other sales, check if any are not themselves voided
        const otherUnvoidedSales = otherSales.filter((otherSale) => {
          const voidChild = db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.parentTransactionId, otherSale.id),
                eq(transactions.kind, "void"),
              )
            )
            .get();
          return !voidChild;
        });

        // Only reopen the card if no other active (un-voided) sale holds it
        if (otherUnvoidedSales.length === 0) {
          db.update(cards)
            .set({ status: "available", oversold: false, updatedAt: nowSec, version: sql`version + 1` })
            .where(eq(cards.id, cardId))
            .run();
        } else if (otherUnvoidedSales.length === 1) {
          // Exactly one unvoided sale remains — the card is no longer oversold
          // (it was oversold because ≥2 active sales existed; now only 1 remains)
          db.update(cards)
            .set({ oversold: false, updatedAt: nowSec, version: sql`version + 1` })
            .where(eq(cards.id, cardId))
            .run();
        }
      }
    }
  });

  const newTx = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, newTxId))
    .get();
  const newItems = db
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, newTxId))
    .all();

  return reply.status(201).send({ transaction: newTx, items: newItems });
}
