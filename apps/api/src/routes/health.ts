import type { FastifyInstance } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { count, eq, min, max } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { carts, users, transactions } from "@kolektapos/db/schema";
import { requireAdmin } from "../plugins/auth-guard.js";

type Db = BetterSQLite3Database<typeof dbSchema>;

const startedAtMs = Date.now();

// Derived once at startup from the same journal the migrator reads — never stale.
const _journalPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/drizzle/meta/_journal.json"
);
const _journal = JSON.parse(readFileSync(_journalPath, "utf8")) as { entries: { tag: string }[] };
const SCHEMA_VERSION = _journal.entries.at(-1)?.tag ?? "unknown";

/**
 * GET /health — liveness + shallow DB probe + a few operational counters.
 * Public (no auth) so uptime checks and load balancers can probe it.
 * Returns HealthCheckResponse per PRD §5.2.
 */
export async function healthRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get(
    "/health",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      try {
        const userCount =
          db.select({ c: count() }).from(users).get()?.c ?? 0;
        const activeCarts =
          db
            .select({ c: count() })
            .from(carts)
            .where(eq(carts.status, "draft"))
            .get()?.c ?? 0;

        reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
        reply.header("X-Server-Version", SCHEMA_VERSION);

        return reply.send({
          status: "ok",
          ok: true,
          timestamp: nowMs,
          uptimeSec: nowSec - Math.floor(startedAtMs / 1000),
          version: SCHEMA_VERSION,
          database: "connected",
          users: userCount,
          activeDraftCarts: activeCarts,
        });
      } catch (err) {
        reply.log.error({ err, event: "health_probe_failed" });
        reply.header("Cache-Control", "no-cache, no-store, must-revalidate");
        return reply.status(503).send({
          status: "error",
          ok: false,
          timestamp: nowMs,
          uptimeSec: nowSec - Math.floor(startedAtMs / 1000),
          version: SCHEMA_VERSION,
          database: "disconnected",
        });
      }
    }
  );

  /**
   * GET /health/deep — admin-only operational detail for the booth operator.
   * Returns schema version, uptime, cart and transaction counters.
   */
  app.get(
    "/health/deep",
    {
      preHandler: requireAdmin,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (_request, reply) => {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);

      const draftStats = db
        .select({ c: count(), oldest: min(carts.updatedAt) })
        .from(carts)
        .where(eq(carts.status, "draft"))
        .get();
      const activeDraftCarts = draftStats?.c ?? 0;
      const oldestOpenCartAgeSec = draftStats?.oldest != null
        ? nowSec - draftStats.oldest
        : null;

      const lastPaidAt =
        db.select({ m: max(transactions.paidAt) }).from(transactions).get()?.m ?? null;

      return reply.send({
        ok: true,
        schemaVersion: SCHEMA_VERSION,
        uptimeSec: nowSec - Math.floor(startedAtMs / 1000),
        activeDraftCarts,
        oldestOpenCartAgeSec,
        lastTransactionAt: lastPaidAt,
      });
    }
  );
}
