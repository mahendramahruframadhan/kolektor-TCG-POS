import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { eq, gt, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import {
  cards,
  carts,
  transactions,
  transactionItems,
  events,
  users,
  paymentChannels,
  settings,
} from "@kolektapos/db/schema";
import {
  SyncPushRequestSchema,
  SyncOpSchema,
  CreateCardOpPayloadSchema,
  CreateTransactionOpPayloadSchema,
} from "@kolektapos/sync";
import { z } from "zod";
import { requireAuth } from "../plugins/auth-guard.js";
import { userDto } from "../utils/user-dto.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

/**
 * Sync routes (PRD §16.2) — push/pull with server-authoritative cursor.
 * Cursor is a Unix timestamp (server_received_at / updatedAt).
 */
export async function syncRoutes(
  app: FastifyInstance,
  opts: { db: Db; photoStoragePath?: string }
) {
  const { db, photoStoragePath = "storage/photos" } = opts;

  /**
   * GET /sync/pull?cursor=0&deviceId=UUID
   *
   * Returns all entity changes since cursor.
   * Cursor = 0 → initial pull (§16.6): users, events (active + last 2 closed),
   * payment_channels, settings, all non-retired cards, active draft carts,
   * transactions from last 30 days.
   */
  app.get("/sync/pull", { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const { cursor: cursorStr = "0" } = request.query as Record<string, string>;
    const cursor = parseInt(cursorStr, 10) || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const changes: unknown[] = [];
    let hasMore = false;

    if (cursor === 0) {
      // Initial pull — full dataset
      const userRows = db.select().from(users).all();
      const eventRows = db
        .select()
        .from(events)
        .all();
      const channelRows = db.select().from(paymentChannels).all();
      const settingRows = db.select().from(settings).all();
      const allCards = db.select().from(cards).limit(5001).all();
      hasMore = allCards.length > 5000;
      const cardPage = allCards.slice(0, 5000);
      const thirtyDaysAgo = nowSec - 30 * 24 * 60 * 60;
      const txRows = db
        .select()
        .from(transactions)
        .where(gt(transactions.createdAt, thirtyDaysAgo))
        .all();
      const txIds = txRows.map((t) => t.id);
      const txItemRows: (typeof transactionItems.$inferSelect)[] = [];
      const CHUNK = 900;
      for (let i = 0; i < txIds.length; i += CHUNK) {
        const slice = txIds.slice(i, i + CHUNK);
        const chunk = db.select().from(transactionItems).where(inArray(transactionItems.transactionId, slice)).all();
        txItemRows.push(...chunk);
      }

      for (const row of userRows) changes.push({ entityType: "user", operation: "create", payload: userDto(row), serverReceivedAt: row.updatedAt });
      for (const row of eventRows) changes.push({ entityType: "event", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of channelRows) changes.push({ entityType: "payment_channel", operation: "create", payload: row, serverReceivedAt: 0 });
      for (const row of settingRows) changes.push({ entityType: "setting", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of cardPage) changes.push({ entityType: "card", operation: "create", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of txRows) changes.push({ entityType: "transaction", operation: "create", payload: row, serverReceivedAt: row.createdAt });
      for (const row of txItemRows) changes.push({ entityType: "transaction_item", operation: "create", payload: row, serverReceivedAt: row.createdAt });
    } else {
      // Delta pull — changes since cursor
      const cardChanges = db.select().from(cards).where(gt(cards.updatedAt, cursor)).all();
      const eventChanges = db.select().from(events).where(gt(events.updatedAt, cursor)).all();
      const userChanges = db.select().from(users).where(gt(users.updatedAt, cursor)).all();
      const cartChanges = db.select().from(carts).where(gt(carts.updatedAt, cursor)).all();
      const txChanges = db.select().from(transactions).where(gt(transactions.createdAt, cursor)).all();
      const txIds = txChanges.map((t) => t.id);
      const txItemChanges =
        txIds.length > 0
          ? db.select().from(transactionItems).where(inArray(transactionItems.transactionId, txIds)).all()
          : [];
      // paymentChannels has no updatedAt — always return all (small, rarely changes)
      const channelChanges = db.select().from(paymentChannels).all();
      const settingChanges = db.select().from(settings).where(gt(settings.updatedAt, cursor)).all();

      for (const row of cardChanges) changes.push({ entityType: "card", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of eventChanges) changes.push({ entityType: "event", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of userChanges) changes.push({ entityType: "user", operation: "update", payload: userDto(row), serverReceivedAt: row.updatedAt });
      for (const row of cartChanges) changes.push({ entityType: "cart", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
      for (const row of txChanges) changes.push({ entityType: "transaction", operation: "create", payload: row, serverReceivedAt: row.createdAt });
      for (const row of txItemChanges) changes.push({ entityType: "transaction_item", operation: "create", payload: row, serverReceivedAt: row.createdAt });
      for (const row of channelChanges) changes.push({ entityType: "payment_channel", operation: "update", payload: row, serverReceivedAt: 0 });
      for (const row of settingChanges) changes.push({ entityType: "setting", operation: "update", payload: row, serverReceivedAt: row.updatedAt });
    }

    return reply.send({
      changes,
      newCursor: nowSec,
      hasMore,
    });
  });

  /**
   * POST /sync/push
   *
   * Client sends batch of ops. Server applies each, returns per-op result.
   * Server uses server_received_at (not client wall-clock) for ordering.
   */
  app.post("/sync/push", { preHandler: requireAuth, config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (request, reply) => {
    const BoundedSyncPushRequestSchema = SyncPushRequestSchema.extend({
      ops: z.array(SyncOpSchema).max(500),
    });
    const parsed = BoundedSyncPushRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const body = parsed.data;
    const results: unknown[] = [];
    const nowSec = Math.floor(Date.now() / 1000);
    const cashierUserId = request.session.userId!;

    for (const op of body.ops) {
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
            const payloadParsed = CreateCardOpPayloadSchema.safeParse(op.payload);
            if (!payloadParsed.success) {
              results.push({ clientId: op.clientId, status: "rejected", reason: payloadParsed.error.message });
              break;
            }
            const shortIdExists = db
              .select()
              .from(cards)
              .where(eq(cards.shortId, payloadParsed.data.shortId))
              .get();
            if (shortIdExists) {
              results.push({ clientId: op.clientId, status: "rejected", reason: "duplicate_short_id" });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(cards).values({ id, clientId: op.clientId, ...payloadParsed.data }).run();
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
            const payloadParsed = CreateTransactionOpPayloadSchema.safeParse(op.payload);
            if (!payloadParsed.success) {
              results.push({ clientId: op.clientId, status: "rejected", reason: payloadParsed.error.message });
              break;
            }
            const id = crypto.randomUUID();
            db.insert(transactions)
              .values({
                id,
                clientId: op.clientId,
                cashierUserId, // from session, never client-controlled
                ...payloadParsed.data,
              })
              .run();
            results.push({ clientId: op.clientId, status: "accepted", serverEntityId: id });
            break;
          }

          default:
            results.push({ clientId: op.clientId, status: "rejected", reason: "unsupported_op_type" });
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

      // UUID validation — guards against path traversal in the filename
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          cardClientId
        )
      ) {
        return reply.status(400).send({ error: "Invalid cardClientId" });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      const contentType = data.mimetype;
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        return reply
          .status(415)
          .send({ error: "Unsupported file type — use JPEG, PNG, or WebP" });
      }

      const ext =
        contentType === "image/png"
          ? ".png"
          : contentType === "image/webp"
            ? ".webp"
            : ".jpg";
      const filename = `${cardClientId}${ext}`;
      const target = resolve(photoStoragePath, filename);

      // Write file to disk
      await pipeline(data.file, createWriteStream(target));

      // Verify card exists
      const card = db
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.clientId, cardClientId))
        .get();
      if (!card) {
        return reply.status(404).send({ error: "Card not found" });
      }

      // Update card record
      const photoPath = `/storage/photos/${filename}`;
      db.update(cards)
        .set({ photoPath, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(cards.clientId, cardClientId))
        .run();

      return reply.send({ photoPath });
    }
  );
}
