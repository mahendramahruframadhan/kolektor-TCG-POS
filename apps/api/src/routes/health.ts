import type { FastifyInstance } from "fastify";
import { count, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { carts, users } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof dbSchema>;

const startedAtSec = Math.floor(Date.now() / 1000);

/**
 * GET /health — liveness + shallow DB probe + a few operational counters.
 * Public (no auth) so uptime checks and load balancers can probe it.
 */
export async function healthRoutes(app: FastifyInstance, opts: { db: Db }) {
  const { db } = opts;

  app.get(
    "/health",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (_request, reply) => {
      const nowSec = Math.floor(Date.now() / 1000);
      try {
        const userCount =
          db.select({ c: count() }).from(users).get()?.c ?? 0;
        const activeCarts =
          db
            .select({ c: count() })
            .from(carts)
            .where(eq(carts.status, "draft"))
            .get()?.c ?? 0;

        return reply.send({
          ok: true,
          db: "connected",
          uptimeSec: nowSec - startedAtSec,
          users: userCount,
          activeDraftCarts: activeCarts,
        });
      } catch (err) {
        reply.log.error({ err, event: "health_probe_failed" });
        return reply.status(503).send({
          ok: false,
          db: "error",
          uptimeSec: nowSec - startedAtSec,
        });
      }
    }
  );
}
