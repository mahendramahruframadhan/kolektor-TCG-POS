import type { FastifyInstance } from "fastify";
import { eq, inArray, and, gte, lt, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import {
  events,
  transactions,
  transactionItems,
  users,
  cards,
  paymentChannels,
} from "@kolektapos/db/schema";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function settlementRoutes(
  app: FastifyInstance,
  opts: { db: Db }
) {
  const { db } = opts;

  // GET /reports/event/:eventId/settlement
  // Computes per-owner payout using ownerUserIdSnapshot (§6.1 rule 3, §7.3)
  app.get(
    "/reports/event/:eventId/settlement",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };

      const event = db.select().from(events).where(eq(events.id, eventId)).get();
      if (!event) return reply.status(404).send({ error: "Event not found" });

      // All sale + void/refund transactions for this event
      const allTxs = db.select().from(transactions).where(eq(transactions.eventId, eventId)).all();
      const txIds = allTxs.map((t) => t.id);

      let allItems: (typeof transactionItems.$inferSelect)[] = [];
      if (txIds.length > 0) {
        allItems = db
          .select()
          .from(transactionItems)
          .where(inArray(transactionItems.transactionId, txIds))
          .all();
      }

      // Build per-owner totals using ownerUserIdSnapshot (never join live cards)
      const txKindMap: Record<string, string> = {};
      for (const tx of allTxs) txKindMap[tx.id] = tx.kind;

      const ownerTotals: Record<string, number> = {};
      const ownerItemCount: Record<string, number> = {};
      for (const item of allItems) {
        const kind = txKindMap[item.transactionId];
        const ownerId = item.ownerUserIdSnapshot;
        // item.soldPriceIdr is already signed: negative for void/refund items (§7.3).
        ownerTotals[ownerId] = (ownerTotals[ownerId] ?? 0) + item.soldPriceIdr;
        if (kind === "sale") {
          ownerItemCount[ownerId] = (ownerItemCount[ownerId] ?? 0) + 1;
        }
      }

      // Fetch display names
      const ownerIds = Object.keys(ownerTotals);
      let ownerUsers: (typeof users.$inferSelect)[] = [];
      if (ownerIds.length > 0) {
        ownerUsers = db.select().from(users).where(inArray(users.id, ownerIds)).all();
      }
      const ownerNameMap: Record<string, string> = {};
      for (const u of ownerUsers) ownerNameMap[u.id] = u.displayName;

      const breakdown = ownerIds.map((ownerId) => ({
        ownerId,
        ownerName: ownerNameMap[ownerId] ?? ownerId,
        totalPayoutIdr: ownerTotals[ownerId] ?? 0,
        itemsSold: ownerItemCount[ownerId] ?? 0,
      }));

      const saleTxs = allTxs.filter((t) => t.kind === "sale");
      const grandTotalSales = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      const grandTotalVoids = allTxs
        .filter((t) => t.kind === "void" || t.kind === "refund")
        .reduce((s, t) => s + Math.abs(t.totalIdr), 0);

      const channelBreakdown = buildChannelBreakdown(db, saleTxs);

      return reply.send({
        eventId,
        eventName: event.name,
        settledAt: event.settledAt ?? null,
        settledByUserId: event.settledByUserId ?? null,
        grandTotalSalesIdr: grandTotalSales,
        grandTotalVoidsIdr: grandTotalVoids,
        netIdr: grandTotalSales - grandTotalVoids,
        breakdown,
        channelBreakdown,
      });
    }
  );

  // POST /events/:eventId/settle — lock settlement (admin only)
  app.post(
    "/events/:eventId/settle",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };
      const userId = request.session.userId!;

      const event = db.select().from(events).where(eq(events.id, eventId)).get();
      if (!event) return reply.status(404).send({ error: "Event not found" });
      if (event.settledAt) {
        return reply.status(409).send({ error: "Event already settled", settledAt: event.settledAt });
      }
      if (event.status !== "closed") {
        return reply.status(422).send({ error: "Only closed events can be settled" });
      }

      const nowSec = Math.floor(Date.now() / 1000);
      db.update(events)
        .set({ settledAt: nowSec, settledByUserId: userId, updatedAt: nowSec, version: event.version + 1 })
        .where(eq(events.id, eventId))
        .run();

      return reply.send({ ok: true, settledAt: nowSec });
    }
  );

  // GET /reports/event/:eventId/inventory-value — total value of available cards
  app.get(
    "/reports/event/:eventId/inventory-value",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { eventId } = request.params as { eventId: string };

      const eventCards = db
        .select()
        .from(cards)
        .where(eq(cards.eventId, eventId))
        .all();

      const available = eventCards.filter((c) => c.status === "available");
      const held = eventCards.filter((c) => c.status === "held");
      const sold = eventCards.filter((c) => c.status === "sold");

      const sumPrice = (list: typeof eventCards) =>
        list.reduce((s, c) => s + (c.listedPriceIdr ?? c.priceIdr ?? 0), 0);

      return reply.send({
        eventId,
        totalCards: eventCards.length,
        availableCount: available.length,
        heldCount: held.length,
        soldCount: sold.length,
        availableValueIdr: sumPrice(available),
        heldValueIdr: sumPrice(held),
        soldValueIdr: sumPrice(sold),
        totalListedValueIdr: sumPrice(eventCards),
      });
    }
  );

  // GET /reports/monthly?year=YYYY&month=MM — aggregate by calendar month
  app.get(
    "/reports/monthly",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { year, month } = request.query as { year?: string; month?: string };
      const y = parseInt(year ?? String(new Date().getFullYear()), 10);
      const m = parseInt(month ?? String(new Date().getMonth() + 1), 10);

      // Unix timestamps for start/end of month
      const startDate = new Date(y, m - 1, 1);
      const endDate = new Date(y, m, 1);
      const startTs = Math.floor(startDate.getTime() / 1000);
      const endTs = Math.floor(endDate.getTime() / 1000);

      // Filter at SQL level — was: load-all + JS filter (O(n) memory).
      const monthTxs = db
        .select()
        .from(transactions)
        .where(
          and(
            isNotNull(transactions.paidAt),
            gte(transactions.paidAt, startTs),
            lt(transactions.paidAt, endTs)
          )
        )
        .all();

      const saleTxs = monthTxs.filter((t) => t.kind === "sale");
      const voidRefundTxs = monthTxs.filter((t) => t.kind === "void" || t.kind === "refund");

      const grossIdr = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      const voidRefundIdr = voidRefundTxs.reduce((s, t) => s + Math.abs(t.totalIdr), 0);
      const netIdr = grossIdr - voidRefundIdr;

      // Per-day breakdown
      const dayMap: Record<string, { grossIdr: number; netIdr: number; count: number }> = {};
      for (const tx of saleTxs) {
        const d = new Date((tx.paidAt ?? 0) * 1000).toISOString().slice(0, 10);
        if (!dayMap[d]) dayMap[d] = { grossIdr: 0, netIdr: 0, count: 0 };
        dayMap[d]!.grossIdr += tx.totalIdr;
        dayMap[d]!.count += 1;
      }
      for (const tx of voidRefundTxs) {
        const d = new Date((tx.paidAt ?? 0) * 1000).toISOString().slice(0, 10);
        if (!dayMap[d]) dayMap[d] = { grossIdr: 0, netIdr: 0, count: 0 };
        dayMap[d]!.netIdr -= Math.abs(tx.totalIdr);
      }
      for (const day of Object.values(dayMap)) {
        day.netIdr += day.grossIdr;
      }

      const dailyBreakdown = Object.entries(dayMap)
        .map(([date, v]) => ({ date, ...v }))
        .sort((a, b) => a.date.localeCompare(b.date));

      const channelBreakdown = buildChannelBreakdown(db, saleTxs);

      return reply.send({
        year: y,
        month: m,
        grossIdr,
        voidRefundIdr,
        netIdr,
        transactionCount: saleTxs.length,
        dailyBreakdown,
        channelBreakdown,
      });
    }
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function buildChannelBreakdown(
  db: Db,
  saleTxs: { paymentChannelId: string | null; totalIdr: number }[]
) {
  const channelIds = [
    ...new Set(saleTxs.flatMap((t) => (t.paymentChannelId ? [t.paymentChannelId] : []))),
  ];
  const nameMap: Record<string, string> = {};
  if (channelIds.length > 0) {
    for (const ch of db.select().from(paymentChannels).where(inArray(paymentChannels.id, channelIds)).all()) {
      nameMap[ch.id] = ch.name;
    }
  }
  const acc: Record<string, { channelName: string; count: number; gross: number }> = {};
  for (const tx of saleTxs) {
    const chId = tx.paymentChannelId ?? "unknown";
    if (!acc[chId]) acc[chId] = { channelName: nameMap[chId] ?? chId, count: 0, gross: 0 };
    acc[chId]!.count += 1;
    acc[chId]!.gross += tx.totalIdr;
  }
  return Object.entries(acc).map(([channelId, v]) => ({ channelId, ...v }));
}
