import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { settings } from "@kolektapos/db/schema";
import { UpdateSettingSchema, validateSetting } from "@kolektapos/types";
import { requireAuth, requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

export async function settingsRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get("/settings", { preHandler: requireAuth }, async (_request, reply) => {
    const rows = db.select().from(settings).all();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.valueJson);
      } catch {
        // Skip malformed rows rather than 500 the whole response.
        // Log at route level so operators can investigate.
        (_request as unknown as { log?: { warn: (o: unknown, m?: string) => void } }).log?.warn(
          { key: row.key, rawValue: row.valueJson },
          "[settings] malformed valueJson; skipped"
        );
      }
    }
    return reply.send(out);
  });

  app.put("/settings/:key", { preHandler: requireAdmin }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const envelope = UpdateSettingSchema.safeParse(request.body);
    if (!envelope.success) {
      return reply.status(400).send({ error: envelope.error.flatten() });
    }

    // Per-key schema check: rejects unknown keys + malformed values
    // (previously z.unknown() accepted anything).
    const validated = validateSetting(key, envelope.data.value);
    if (!validated.ok) {
      return reply.status(422).send({ error: validated.error });
    }

    const bodyRaw = request.body as { value?: unknown; version?: number };
    const clientVersion = bodyRaw.version; // undefined means new key (no conflict possible)

    const existing = db.select().from(settings).where(eq(settings.key, key)).get();
    const userId = request.session.userId;

    if (existing && clientVersion !== undefined && existing.version !== clientVersion) {
      return reply.status(409).send({ error: "Conflict: version mismatch", currentVersion: existing.version });
    }

    if (existing) {
      db.update(settings)
        .set({
          valueJson: JSON.stringify(validated.value),
          updatedByUserId: userId,
          updatedAt: Math.floor(Date.now() / 1000),
          version: (existing.version ?? 1) + 1,
        })
        .where(eq(settings.key, key))
        .run();
    } else {
      db.insert(settings)
        .values({
          id: crypto.randomUUID(),
          key,
          valueJson: JSON.stringify(validated.value),
          updatedByUserId: userId,
        })
        .run();
    }

    return reply.send({ key, value: validated.value });
  });
}
