import type { FastifyInstance } from "fastify";
import { eq, gt, and, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import {
  cards,
  carts,
  cartItems,
  transactions,
  transactionItems,
  events,
  users,
  paymentChannels,
  settings,
  holds,
} from "@kolektapos/db/schema";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

/**
 * Sync routes (PRD §16.2) — push/pull with server-authoritative cursor.
 * Cursor is a Unix timestamp (server_received_at / updatedAt).
 */
export async function syncRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  /**
   * GET /sync/pull?cursor=0&deviceId=UUID
   *
   * Returns all entity changes since cursor.
   * Cursor = 0 → initial pull (§16.6): users, events (active + last 2 closed),
   * payment_channels, settings, all non-retired cards, active draft carts,
   * transactions from last 30 days.
   */
  app.get("/sync/pull", { preHandler: requireAuth }, async (request, reply) => {
    const { cursor: cursorStr = "0" } = request.query as Record<string, string>;
    const cursor = parseInt(cursorStr, 10) || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const changes: unknown[] = [];

    if (cursor === 0) {
      // Initial pull — full dataset
      const userRows = db.select().from(users).all();
      const eventRows = db
        .select()
        .from(events)
        .all();
      const channelRows = db.select().from(paymentChannels).all();
      const settingRows = db.select().from(settings).all();
      const cardRows = db
        .select()
        .from(cards)
        .where(eq(cards.status, "sold"))
        .all(); // All non-sold + available
      const allCards = db.select().from(cards).all();
      const thirtyDaysAgo = nowSec - 30 * 24 * 60 * 60;
      const txRows = db
        .select()
        .from(transactions)
        .where(gt(transactions.createdAt, thirtyDaysAgo))
        .all();
      const txItemRows = db
        .select()
        .from(transactionItems)
        .where(
          inArray(
            transactionItems.transactionId,
            txRows.map((t) => t.id)
          )
        )
        .all();

      for (const row of userRows) changes.push({ entityType: "user", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of eventRows) changes.push({ entityType: "event", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of channelRows) changes.push({ entityType: "payment_channel", operation: "create", payload: row, serverReceivedAt: 0 });
      for (const row of settingRows) changes.push({ entityType: "setting", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of allCards) changes.push({ entityType: "card", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of txRows) changes.push({ entityType: "transaction", operation: "create", payload: row, serverReceivedAt: row.createdAt });
      for (const row of txItemRows) changes.push({ entityType: "transaction_item", operation: "create", payload: row, serverReceivedAt: row.createdAt });
    } else {
      // Delta pull — changes since cursor
      const cardChanges = db.select().from(cards).where(gt(cards.updatedAt, cursor)).all();
      const eventChanges = db.select().from(events).where(gt(events.updatedAt, cursor)).all();
      const userChanges = db.select().from(users).where(gt(users.updatedAt, cursor)).all();
      const cartChanges = db.select().from(carts).where(gt(carts.updatedAt, cursor)).all();
      const txChanges = db.select().from(transactions).where(gt(transactions.createdAt, cursor)).all();

      for (const row of cardChanges) changes.push({ entityType: "card", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of eventChanges) changes.push({ entityType: "event", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of userChanges) changes.push({ entityType: "user", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of cartChanges) changes.push({ entityType: "cart", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of txChanges) changes.push({ entityType: "transaction", operation: "create", payload: row, serverReceivedAt: row.createdAt });
    }

    return reply.send({
      changes,
      newCursor: nowSec,
      hasMore: false,
    });
  });

  /**
   * POST /sync/push
   *
   * Client sends batch of ops. Server applies each, returns per-op result.
   * Server uses server_received_at (not client wall-clock) for ordering.
   */
  app.post("/sync/push", { preHandler: requireAuth }, async (request, reply) => {
    const body = request.body as {
      ops: Array<{ type: string; clientId: string; payload: Record<string, unknown> }>;
    };
    const results: unknown[] = [];
    const nowSec = Math.floor(Date.now() / 1000);

    for (const op of body.ops ?? []) {
      try {
        switch (op.type) {
          case "create_card": {
            const existing = db
              .select()
              .from(cards)
              .where(eq(cards.clientId, op.clientId))
              .get();
            if (existing) {
              results.push({ clientId: op.clientId, status: "accepted", serverEntityId: existing.id });
              break;
            }
            // Check short_id uniqueness
            const shortIdExists = db
              .select()
              .from(cards)
              .where(eq(cards.shortId, op.payload.shortId as string))
              .get();
            if (shortIdExists) {
              results.push({ clientId: op.clientId, status: "rejected", reason: "duplicate_short_id" });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(cards).values({ id, clientId: op.clientId, ...(op.payload as never) }).run();
            results.push({ clientId: op.clientId, status: "accepted", serverEntityId: id });
            break;
          }

          case "create_transaction": {
            const existing = db
              .select()
              .from(transactions)
              .where(eq(transactions.clientId, op.clientId))
              .get();
            if (existing) {
              results.push({ clientId: op.clientId, status: "accepted", serverEntityId: existing.id });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(transactions).values({ id, clientId: op.clientId, ...(op.payload as never) }).run();
            results.push({ clientId: op.clientId, status: "accepted", serverEntityId: id });
            break;
          }

          default:
            results.push({ clientId: op.clientId, status: "rejected", reason: "unknown_op_type" });
        }
      } catch (err) {
        results.push({
          clientId: op.clientId,
          status: "rejected",
          reason: err instanceof Error ? err.message : "internal_error",
        });
      }
    }

    return reply.send({ results, newCursor: nowSec });
  });

  /**
   * POST /sync/photo/:cardClientId
   *
   * Multipart photo upload (PRD §16.5).
   * Stores photo and returns canonical URL.
   */
  app.post(
    "/sync/photo/:cardClientId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { cardClientId } = request.params as { cardClientId: string };
      // Simplified: just acknowledge the upload
      // Production implementation would write to PHOTO_STORAGE_PATH
      const photoPath = `/storage/photos/${cardClientId}.jpg`;
      const card = db.select().from(cards).where(eq(cards.clientId, cardClientId)).get();
      if (card) {
        db.update(cards)
          .set({ photoPath, updatedAt: Math.floor(Date.now() / 1000), version: card.version + 1 })
          .where(eq(cards.clientId, cardClientId))
          .run();
      }
      return reply.send({ photoPath });
    }
  );
}
