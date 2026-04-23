import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";
import { requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function auditLogRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // GET /audit-log — list audit entries (admin only)
  app.get("/audit-log", { preHandler: requireAdmin }, async (_request, reply) => {
    const rows = db
      .select()
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt))
      .limit(500)
      .all();
    return reply.send(rows);
  });
}
