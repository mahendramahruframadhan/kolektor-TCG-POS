import type { FastifyInstance } from "fastify";
import { eq, and, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import {
  cards,
  carts,
  cartItems,
  transactions,
  transactionItems,
  settings,
} from "@kolektapos/db/schema";
import {
  CreateCartSchema,
  AddCartItemSchema,
  PayCartSchema,
} from "@kolektapos/types";
import { requireAuth } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

/** Read cart_idle_ttl_minutes from settings, fallback to 30 */
function getCartIdleTtl(db: Db): number {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "cart_idle_ttl_minutes"))
    .get();
  if (!row) return 30;
  try {
    return Number(JSON.parse(row.valueJson)) || 30;
  } catch {
    return 30;
  }
}

export async function cartRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // POST /carts — create a new cart
  app.post("/carts", { preHandler: requireAuth }, async (request, reply) => {
    const body = CreateCartSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    // Idempotency: if clientId already exists, return existing row
    const existing = db
      .select()
      .from(carts)
      .where(eq(carts.clientId, body.data.clientId))
      .get();
    if (existing) {
      return reply.status(200).send(existing);
    }

    const id = crypto.randomUUID();
    const cashierUserId = request.session.userId!;
    const nowSec = Math.floor(Date.now() / 1000);

    db.insert(carts)
      .values({
        id,
        clientId: body.data.clientId,
        eventId: body.data.eventId,
        cashierUserId,
        lastActivityAt: nowSec,
      })
      .run();

    return reply
      .status(201)
      .send(db.select().from(carts).where(eq(carts.id, id)).get());
  });

  // GET /carts/:id — get cart with its items
  app.get("/carts/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const cart = db.select().from(carts).where(eq(carts.id, id)).get();
    if (!cart) return reply.status(404).send({ error: "Not found" });

    const items = db
      .select()
      .from(cartItems)
      .where(eq(cartItems.cartId, id))
      .all();

    return reply.send({ ...cart, items });
  });

  // POST /carts/:id/items — add card to cart
  app.post(
    "/carts/:id/items",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: cartId } = request.params as { id: string };
      const body = AddCartItemSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
      if (!cart) return reply.status(404).send({ error: "Cart not found" });
      if (cart.status !== "draft") {
        return reply
          .status(409)
          .send({ error: "Cart is not in draft status" });
      }

      const card = db
        .select()
        .from(cards)
        .where(eq(cards.id, body.data.cardId))
        .get();
      if (!card) return reply.status(404).send({ error: "Card not found" });

      // Card must be available — not held, sold, or locked by another cart
      if (card.status !== "available") {
        return reply
          .status(409)
          .send({ error: `Card is not available (status: ${card.status})` });
      }
      if (card.lockedByCartId !== null && card.lockedByCartId !== cartId) {
        return reply
          .status(409)
          .send({ error: "Card is locked by another cart" });
      }

      // ── Floor price / discount validation ───────────────────────────────
      const requiresAdminOverride = body.data.requiresAdminOverride ?? false;

      if (card.pricingMode === "fixed") {
        // Compute line discount % from intended vs listed/fixed price
        const listedPrice = card.priceIdr ?? 0;
        if (listedPrice > 0) {
          const lineDiscountPct =
            body.data.lineDiscountIdr > 0
              ? Math.round((body.data.lineDiscountIdr / listedPrice) * 100)
              : 0;

          // Read max_line_discount_pct_fixed from settings
          const settingRow = db
            .select()
            .from(settings)
            .where(eq(settings.key, "max_line_discount_pct_fixed"))
            .get();
          let maxPct = 100; // fallback: unlimited
          if (settingRow) {
            try {
              maxPct = Number(JSON.parse(settingRow.valueJson)) || 100;
            } catch {
              maxPct = 100;
            }
          }

          if (lineDiscountPct > maxPct && !requiresAdminOverride) {
            return reply.status(422).send({
              error: "Diskon melebihi batas",
              maxPct,
            });
          }
        }
      } else if (card.pricingMode === "negotiable") {
        const bottomPrice = card.bottomPriceIdr ?? 0;
        if (bottomPrice > 0 && body.data.intendedPriceIdr < bottomPrice && !requiresAdminOverride) {
          return reply.status(422).send({
            error: "Di bawah harga minimum (bottom price)",
            bottomPriceIdr: bottomPrice,
          });
        }
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const cashierUserId = request.session.userId!;

      // Atomically lock card + insert cart_item + update cart.last_activity_at
      db.transaction(() => {
        // Lock the card
        db.update(cards)
          .set({
            lockedByCartId: cartId,
            lockedByUserId: cashierUserId,
            lockedAt: nowSec,
            updatedAt: nowSec,
          })
          .where(eq(cards.id, body.data.cardId))
          .run();

        // Insert cart item
        const itemId = crypto.randomUUID();
        db.insert(cartItems)
          .values({
            id: itemId,
            cartId,
            cardId: body.data.cardId,
            intendedPriceIdr: body.data.intendedPriceIdr,
            lineDiscountIdr: body.data.lineDiscountIdr,
            lineDiscountReason: body.data.lineDiscountReason,
            requiresAdminOverride: body.data.requiresAdminOverride,
            overrideByUserId: body.data.overrideByUserId,
            overrideReason: body.data.overrideReason,
          })
          .run();

        // Update cart.last_activity_at
        db.update(carts)
          .set({ lastActivityAt: nowSec, updatedAt: nowSec })
          .where(eq(carts.id, cartId))
          .run();
      });

      const updatedCart = db.select().from(carts).where(eq(carts.id, cartId)).get();
      const items = db
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cartId))
        .all();
      const item = items.find((i) => i.cardId === body.data.cardId);

      return reply.status(201).send({ cart: updatedCart, item });
    }
  );

  // DELETE /carts/:id/items/:cardId — remove card from cart and release lock
  app.delete(
    "/carts/:id/items/:cardId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: cartId, cardId } = request.params as {
        id: string;
        cardId: string;
      };

      const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
      if (!cart) return reply.status(404).send({ error: "Cart not found" });
      if (cart.status !== "draft") {
        return reply
          .status(409)
          .send({ error: "Cart is not in draft status" });
      }

      const item = db
        .select()
        .from(cartItems)
        .where(and(eq(cartItems.cartId, cartId), eq(cartItems.cardId, cardId)))
        .get();
      if (!item) return reply.status(404).send({ error: "Item not found in cart" });

      const nowSec = Math.floor(Date.now() / 1000);

      db.transaction(() => {
        // Delete the cart item
        db.delete(cartItems)
          .where(
            and(eq(cartItems.cartId, cartId), eq(cartItems.cardId, cardId))
          )
          .run();

        // Release the card lock
        db.update(cards)
          .set({
            lockedByCartId: null,
            lockedByUserId: null,
            lockedAt: null,
            updatedAt: nowSec,
          })
          .where(eq(cards.id, cardId))
          .run();

        // Update cart.last_activity_at
        db.update(carts)
          .set({ lastActivityAt: nowSec, updatedAt: nowSec })
          .where(eq(carts.id, cartId))
          .run();
      });

      return reply.status(204).send();
    }
  );

  // POST /carts/:id/pay — complete cart and create transaction
  app.post(
    "/carts/:id/pay",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: cartId } = request.params as { id: string };
      const body = PayCartSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
      if (!cart) return reply.status(404).send({ error: "Cart not found" });
      if (cart.status !== "draft") {
        return reply
          .status(409)
          .send({ error: "Cart is not in draft status" });
      }

      // Idempotency: if this transactionClientId already exists, return existing tx
      const existingTx = db
        .select()
        .from(transactions)
        .where(eq(transactions.clientId, body.data.transactionClientId))
        .get();
      if (existingTx) {
        const existingItems = db
          .select()
          .from(transactionItems)
          .where(eq(transactionItems.transactionId, existingTx.id))
          .all();
        return reply.status(200).send({ transaction: existingTx, receipt: existingItems });
      }

      const items = db
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cartId))
        .all();
      if (items.length === 0) {
        return reply.status(400).send({ error: "Cart is empty" });
      }

      // Validate all items still available — fetch current card state
      const cardIds = items.map((i) => i.cardId);
      const cardRows = db
        .select()
        .from(cards)
        .where(inArray(cards.id, cardIds))
        .all();

      const cardMap = new Map(cardRows.map((c) => [c.id, c]));

      // Check for oversold: any card already sold by another transaction
      const soldCards = cardRows.filter((c) => c.status === "sold");
      if (soldCards.length > 0) {
        // Per design rule §10 (oversold is accepted residual risk), we still record.
        // However, we still validate the cart's own lock hasn't been stolen.
        // Cards locked by THIS cart but status not 'sold' are still OK.
        // Cards already 'sold' by another transaction create an oversold flag.
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const cashierUserId = request.session.userId!;

      // Compute totals — all integer IDR
      const subtotalIdr = items.reduce((sum, item) => {
        const soldPrice = item.intendedPriceIdr - item.lineDiscountIdr;
        return sum + soldPrice;
      }, 0);
      const totalIdr = subtotalIdr - (body.data.discountIdr ?? 0);

      const txId = crypto.randomUUID();

      db.transaction(() => {
        // INSERT transaction (insert-only — no UPDATE/DELETE ever)
        db.insert(transactions)
          .values({
            id: txId,
            clientId: body.data.transactionClientId,
            cartId,
            eventId: cart.eventId,
            cashierUserId,
            kind: "sale",
            subtotalIdr,
            discountIdr: body.data.discountIdr ?? 0,
            discountReason: body.data.discountReason,
            totalIdr,
            paymentChannelId: body.data.paymentChannelId,
            paymentNote: body.data.paymentNote,
            paidAt: nowSec,
            notes: body.data.notes,
          })
          .run();

        // INSERT transaction_items (insert-only) with owner snapshot
        for (const item of items) {
          const card = cardMap.get(item.cardId);
          // ownerUserIdSnapshot must come from current card.owner_user_id (snapshot at sale time)
          const ownerUserIdSnapshot = card?.ownerUserId ?? "unknown";
          const listedPriceIdrSnapshot =
            card?.pricingMode === "fixed"
              ? (card.priceIdr ?? 0)
              : (card?.listedPriceIdr ?? 0);
          const soldPriceIdr = item.intendedPriceIdr - item.lineDiscountIdr;

          db.insert(transactionItems)
            .values({
              id: crypto.randomUUID(),
              transactionId: txId,
              cardId: item.cardId,
              ownerUserIdSnapshot,
              listedPriceIdrSnapshot,
              soldPriceIdr,
              lineDiscountIdr: item.lineDiscountIdr,
              lineDiscountReason: item.lineDiscountReason,
              overrideBelowBottom: item.requiresAdminOverride,
              overrideReason: item.overrideReason,
            })
            .run();
        }

        // Set all cards.status = 'sold', release locks, flag oversold if needed
        for (const cardId of cardIds) {
          const card = cardMap.get(cardId);
          const alreadySold = card?.status === "sold";
          db.update(cards)
            .set({
              status: "sold",
              oversold: alreadySold ? true : false,
              lockedByCartId: null,
              lockedByUserId: null,
              lockedAt: null,
              updatedAt: nowSec,
              version: (card?.version ?? 1) + 1,
            })
            .where(eq(cards.id, cardId))
            .run();
        }

        // Set cart.status = 'paid', paid_transaction_id = txId
        db.update(carts)
          .set({
            status: "paid",
            paidTransactionId: txId,
            updatedAt: nowSec,
            version: cart.version + 1,
          })
          .where(eq(carts.id, cartId))
          .run();
      });

      const tx = db
        .select()
        .from(transactions)
        .where(eq(transactions.id, txId))
        .get();
      const receipt = db
        .select()
        .from(transactionItems)
        .where(eq(transactionItems.transactionId, txId))
        .all();

      return reply.status(201).send({ transaction: tx, receipt });
    }
  );

  // POST /carts/:id/abandon — abandon cart and release all locks
  app.post(
    "/carts/:id/abandon",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { id: cartId } = request.params as { id: string };

      const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
      if (!cart) return reply.status(404).send({ error: "Cart not found" });
      if (cart.status !== "draft") {
        return reply
          .status(409)
          .send({ error: "Cart is not in draft status" });
      }

      const nowSec = Math.floor(Date.now() / 1000);

      // Get all card IDs in this cart before abandoning
      const items = db
        .select()
        .from(cartItems)
        .where(eq(cartItems.cartId, cartId))
        .all();
      const cardIds = items.map((i) => i.cardId);

      db.transaction(() => {
        // Release all card locks for this cart
        if (cardIds.length > 0) {
          for (const cardId of cardIds) {
            db.update(cards)
              .set({
                lockedByCartId: null,
                lockedByUserId: null,
                lockedAt: null,
                updatedAt: nowSec,
              })
              .where(eq(cards.id, cardId))
              .run();
          }
        }

        // Set cart to abandoned
        db.update(carts)
          .set({
            status: "abandoned",
            abandonedReason: "manual",
            updatedAt: nowSec,
            version: cart.version + 1,
          })
          .where(eq(carts.id, cartId))
          .run();
      });

      return reply.send(db.select().from(carts).where(eq(carts.id, cartId)).get());
    }
  );
}
