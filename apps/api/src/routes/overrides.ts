import type { FastifyInstance } from "fastify";
import { eq, desc, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { transactions, transactionItems, users } from "@kolektapos/db/schema";
import { requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function overrideRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  // GET /overrides — list transaction items with admin overrides (admin only)
  app.get("/overrides", { preHandler: requireAdmin }, async (_request, reply) => {
    const items = db
      .select({
        itemId: transactionItems.id,
        transactionId: transactionItems.transactionId,
        cardId: transactionItems.cardId,
        ownerUserId: transactionItems.ownerUserIdSnapshot,
        soldPriceIdr: transactionItems.soldPriceIdr,
        lineDiscountIdr: transactionItems.lineDiscountIdr,
        overrideBelowBottom: transactionItems.overrideBelowBottom,
        overrideReason: transactionItems.overrideReason,
        itemCreatedAt: transactionItems.createdAt,
        txKind: transactions.kind,
        txCreatedAt: transactions.createdAt,
        cashierId: transactions.cashierUserId,
      })
      .from(transactionItems)
      .innerJoin(transactions, eq(transactionItems.transactionId, transactions.id))
      .where(eq(transactionItems.overrideBelowBottom, true))
      .orderBy(desc(transactionItems.createdAt))
      .limit(200)
      .all();

    const cashierIds = [...new Set(items.map((i) => i.cashierId))];
    const allUsers = cashierIds.length > 0
      ? db.select().from(users).where(inArray(users.id, cashierIds)).all()
      : [];
    const userMap: Record<string, string> = {};
    for (const u of allUsers) userMap[u.id] = u.displayName;

    const enriched = items.map((item) => ({
      ...item,
      cashierName: userMap[item.cashierId] ?? item.cashierId,
    }));

    return reply.send(enriched);
  });
}
