import cron from "node-cron";
import { eq, and, lt, inArray } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { cards, carts, cartItems, settings } from "@kolektapos/db/schema";

type Db = BetterSQLite3Database<typeof dbSchema>;

/** Read cart_idle_ttl_minutes from settings, fallback to 30 */
function getCartIdleTtlMinutes(db: Db): number {
  const row = db
    .select()
    .from(settings)
    .where(eq(settings.key, "cart_idle_ttl_minutes"))
    .get();
  if (!row) return 30;
  try {
    return Number(JSON.parse(row.valueJson)) || 30;
  } catch {
    return 30;
  }
}

/**
 * Sweeps idle carts every 5 minutes.
 * Finds draft carts where last_activity_at < now - cart_idle_ttl_minutes,
 * sets them to abandoned, and releases all card locks.
 */
export function startCartSweeper(db: Db): cron.ScheduledTask {
  const task = cron.schedule("*/5 * * * *", () => {
    try {
      const ttlMinutes = getCartIdleTtlMinutes(db);
      const nowSec = Math.floor(Date.now() / 1000);
      const cutoffSec = nowSec - ttlMinutes * 60;

      // Find all idle draft carts
      const idleCarts = db
        .select({ id: carts.id, version: carts.version })
        .from(carts)
        .where(
          and(
            eq(carts.status, "draft"),
            lt(carts.lastActivityAt, cutoffSec)
          )
        )
        .all();

      if (idleCarts.length === 0) return;

      const idleCartIds = idleCarts.map((c) => c.id);

      db.transaction(() => {
        // Get all card IDs locked by these carts
        const lockedItems = db
          .select({ cardId: cartItems.cardId })
          .from(cartItems)
          .where(inArray(cartItems.cartId, idleCartIds))
          .all();

        const lockedCardIds = lockedItems.map((i) => i.cardId);

        // Release card locks
        if (lockedCardIds.length > 0) {
          for (const cardId of lockedCardIds) {
            db.update(cards)
              .set({
                lockedByCartId: null,
                lockedByUserId: null,
                lockedAt: null,
                updatedAt: nowSec,
              })
              .where(eq(cards.id, cardId))
              .run();
          }
        }

        // Mark carts as abandoned
        for (const cart of idleCarts) {
          db.update(carts)
            .set({
              status: "abandoned",
              abandonedReason: "idle_ttl",
              updatedAt: nowSec,
              version: cart.version + 1,
            })
            .where(eq(carts.id, cart.id))
            .run();
        }
      });

      console.log(
        `[cart-sweeper] Abandoned ${idleCarts.length} idle cart(s) (TTL=${ttlMinutes}m)`
      );
    } catch (err) {
      console.error("[cart-sweeper] Error during sweep:", err);
    }
  });

  return task;
}
