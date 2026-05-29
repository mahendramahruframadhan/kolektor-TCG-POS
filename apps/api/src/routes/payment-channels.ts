import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { paymentChannels, transactions } from "@kolektapos/db/schema";
import { CreatePaymentChannelSchema, UpdatePaymentChannelSchema } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function paymentChannelRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/payment-channels", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db
      .select()
      .from(paymentChannels)
      .all();
    return reply.send(rows);
  });

  app.post("/payment-channels", { preHandler: requireAdmin }, async (request, reply) => {
    const body = CreatePaymentChannelSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const id = crypto.randomUUID();
    db.insert(paymentChannels).values({ id, ...body.data }).run();
    return reply.status(201).send(db.select().from(paymentChannels).where(eq(paymentChannels.id, id)).get());
  });

  app.patch("/payment-channels/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = UpdatePaymentChannelSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const bodyWithVersion = (request.body as { version?: number });
    const clientVersion = bodyWithVersion.version;
    if (typeof clientVersion !== "number") {
      return reply.status(400).send({ error: "version is required for updates" });
    }

    const row = db.select().from(paymentChannels).where(eq(paymentChannels.id, id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });

    if (row.version !== clientVersion) {
      return reply.status(409).send({ error: "Conflict: version mismatch", currentVersion: row.version });
    }

    db.update(paymentChannels).set({ ...body.data, version: row.version + 1 }).where(eq(paymentChannels.id, id)).run();
    return reply.send(db.select().from(paymentChannels).where(eq(paymentChannels.id, id)).get());
  });

  app.delete("/payment-channels/:id", { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = db.select().from(paymentChannels).where(eq(paymentChannels.id, id)).get();
    if (!row) return reply.status(404).send({ error: "Not found" });

    const usedInTx = db.select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.paymentChannelId, id))
      .get();
    if (usedInTx) {
      return reply.status(409).send({ error: "Metode pembayaran tidak bisa dihapus karena sudah digunakan dalam transaksi." });
    }

    // Soft-delete by deactivating; bump version so clients detect the mutation
    db.update(paymentChannels).set({ isActive: false, version: row.version + 1 }).where(eq(paymentChannels.id, id)).run();
    return reply.send({ ok: true });
  });
}
