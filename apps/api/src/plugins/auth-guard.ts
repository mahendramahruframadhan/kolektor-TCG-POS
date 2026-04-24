import type { FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { carts, holds } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof dbSchema>;

declare module "@fastify/session" {
  interface FastifySessionObject {
    userId?: string;
    userRole?: string;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    cart?: typeof carts.$inferSelect;
    hold?: typeof holds.$inferSelect;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  if (request.session.userRole !== "admin") {
    return reply.status(403).send({ error: "Forbidden" });
  }
}

/**
 * Fetches the cart, stashes it on `request.cart`, and enforces owner-or-admin access.
 * Handlers can read `request.cart!` without a second SELECT.
 */
export function makeRequireCartOwnerOrAdmin(db: Db) {
  return async function requireCartOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id: cartId } = request.params as { id: string };
    const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
    if (!cart) return reply.status(404).send({ error: "Cart not found" });
    if (request.session.userRole !== "admin" && cart.cashierUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    request.cart = cart;
  };
}

/**
 * Fetches the hold, stashes it on `request.hold`, and enforces owner-or-admin access.
 */
export function makeRequireHoldOwnerOrAdmin(db: Db) {
  return async function requireHoldOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const { id: holdId } = request.params as { id: string };
    const hold = db.select().from(holds).where(eq(holds.id, holdId)).get();
    if (!hold) return reply.status(404).send({ error: "Hold not found" });
    if (request.session.userRole !== "admin" && hold.heldByUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
    request.hold = hold;
  };
}
