import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { settings } from "@kolektapos/db/schema";
import { UpdateSettingSchema } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function settingsRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/settings", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db.select().from(settings).all();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      out[row.key] = JSON.parse(row.valueJson);
    }
    return reply.send(out);
  });

  app.put("/settings/:key", { preHandler: requireAdmin }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = UpdateSettingSchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() });

    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    const userId = request.session.userId;

    if (existing) {
      db.update(settings)
        .set({
          valueJson: JSON.stringify(body.data.value),
          updatedByUserId: userId,
          updatedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(settings.key, key))
        .run();
    } else {
      db.insert(settings)
        .values({
          id: crypto.randomUUID(),
          key,
          valueJson: JSON.stringify(body.data.value),
          updatedByUserId: userId,
        })
        .run();
    }

    return reply.send({ key, value: body.data.value });
  });
}
