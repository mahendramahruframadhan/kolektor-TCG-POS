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

export function makeRequireCartOwnerOrAdmin(db: Db) {
  return async function requireCartOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (request.session.userRole === "admin") return;

    const { id: cartId } = request.params as { id: string };
    const cart = db.select().from(carts).where(eq(carts.id, cartId)).get();
    if (!cart) return reply.status(404).send({ error: "Cart not found" });
    if (cart.cashierUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}

export function makeRequireHoldOwnerOrAdmin(db: Db) {
  return async function requireHoldOwnerOrAdmin(request: FastifyRequest, reply: FastifyReply) {
    if (!request.session.userId) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    if (request.session.userRole === "admin") return;

    const { id: holdId } = request.params as { id: string };
    const hold = db.select().from(holds).where(eq(holds.id, holdId)).get();
    if (!hold) return reply.status(404).send({ error: "Hold not found" });
    if (hold.heldByUserId !== request.session.userId) {
      return reply.status(403).send({ error: "Forbidden" });
    }
  };
}
