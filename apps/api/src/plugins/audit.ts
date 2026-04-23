import type { FastifyInstance } from "fastify";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

export async function auditPlugin(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.addHook("onSend", async (request, reply, payload) => {
    // Only audit mutating methods that succeeded
    const method = request.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return payload;
    const status = reply.statusCode;
    if (status < 200 || status >= 300) return payload;

    const userId: string | undefined = (request.session as Record<string, unknown>)?.userId as string | undefined;
    const url = request.url;
    const parts = url.split("/").filter(Boolean);
    const entityType = parts[1] ?? "unknown";
    const entityId = parts[2] ?? null;

    try {
      db.insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          userId: userId ?? null,
          action: method,
          entityType,
          entityId,
          diffJson: typeof payload === "string" ? payload.slice(0, 2000) : null,
        })
        .run();
    } catch {
      // audit must never break the response
    }

    return payload;
  });
}
