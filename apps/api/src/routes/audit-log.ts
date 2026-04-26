import type { FastifyInstance } from "fastify";
import { desc, eq, gte, lte, and } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";
import { requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function auditLogRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // GET /audit-log — list audit entries (admin only)
  app.get("/audit-log", { preHandler: requireAdmin }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page ?? "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(q.limit ?? "50", 10)));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (q.userId) conditions.push(eq(auditLog.userId, q.userId));
    if (q.entityType) conditions.push(eq(auditLog.entityType, q.entityType));
    if (q.action) conditions.push(eq(auditLog.action, q.action));
    if (q.from) conditions.push(gte(auditLog.createdAt, parseInt(q.from, 10)));
    if (q.to) conditions.push(lte(auditLog.createdAt, parseInt(q.to, 10)));

    const rows = db
      .select()
      .from(auditLog)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return reply.send({ rows, page, limit });
  });
}
