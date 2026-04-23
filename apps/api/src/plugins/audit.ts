import type { FastifyInstance } from "fastify";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof schema>;

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "newpassword",
  "new_password",
  "currentpassword",
  "current_password",
  "session",
  "token",
  "sessionsecret",
  "session_secret",
]);

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

export async function auditPlugin(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.addHook("onSend", async (request, reply, payload) => {
    const method = request.method;
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) return payload;
    const status = reply.statusCode;
    if (status < 200 || status >= 300) return payload;

    const userId: string | undefined = (
      request.session as unknown as Record<string, unknown>
    )?.userId as string | undefined;
    const url = request.url;
    const parts = url.split("/").filter(Boolean);
    const entityType = parts[1] ?? "unknown";
    const entityId = parts[2] ?? null;

    let redactedJson: string | null = null;
    if (typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload);
        redactedJson = JSON.stringify(redact(parsed)).slice(0, 2000);
      } catch {
        // Non-JSON payload — store nothing rather than risk leaking raw
        redactedJson = null;
      }
    }

    try {
      db.insert(auditLog)
        .values({
          id: crypto.randomUUID(),
          userId: userId ?? null,
          action: method,
          entityType,
          entityId,
          diffJson: redactedJson,
        })
        .run();
    } catch (err) {
      request.log.error({ err, url, method }, "[audit] failed to write audit log");
    }

    return payload;
  });
}
