import cron from "node-cron";
import { lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as dbSchema from "@kolektapos/db/schema";
import { auditLog } from "@kolektapos/db/schema";
import { mkdirSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

type Db = BetterSQLite3Database<typeof dbSchema>;

const RETENTION_DAYS = 90;

/**
 * Archives and prunes audit_log rows older than RETENTION_DAYS.
 *
 * Daily at 03:17 local time: rows with created_at older than N days are
 * written as JSONL to `<archiveDir>/YYYY-MM.jsonl` (append-only per month)
 * and then deleted from the table. See docs/data-retention-policy.md §2.
 *
 * Archive files are never touched by this job; operators prune them per the
 * retention policy (recommended: keep 2 years).
 */
export function startAuditPruner(
  db: Db,
  opts: { archiveDir?: string; logger?: FastifyBaseLogger } = {}
): cron.ScheduledTask {
  const archiveDir = opts.archiveDir ?? resolve(process.cwd(), "storage/audit-archive");
  const log = opts.logger;

  const run = () => {
    try {
      const cutoffSec = Math.floor(Date.now() / 1000) - RETENTION_DAYS * 24 * 60 * 60;
      const rows = db
        .select()
        .from(auditLog)
        .where(lt(auditLog.createdAt, cutoffSec))
        .all();

      if (rows.length === 0) {
        log?.debug({ event: "audit_prune_run", pruned: 0 });
        return;
      }

      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true });

      // Group by YYYY-MM of the row's createdAt so each month is one file.
      const byMonth: Record<string, typeof rows> = {};
      for (const row of rows) {
        const ts = row.createdAt ?? 0;
        const d = new Date(ts * 1000);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        (byMonth[key] ??= []).push(row);
      }

      for (const [month, monthRows] of Object.entries(byMonth)) {
        const path = resolve(archiveDir, `${month}.jsonl`);
        const blob = monthRows.map((r) => JSON.stringify(r)).join("\n") + "\n";
        appendFileSync(path, blob, "utf8");
      }

      db.transaction(() => {
        db.delete(auditLog).where(lt(auditLog.createdAt, cutoffSec)).run();
      });

      log?.info({
        event: "audit_prune_run",
        pruned: rows.length,
        archived: Object.keys(byMonth),
      });
    } catch (err) {
      log?.error({ err, event: "audit_prune_failed" }, "audit pruner crashed");
    }
  };

  // Daily at 03:17. Offset from the cart sweeper's every-5-min cadence.
  const task = cron.schedule("17 3 * * *", run);
  return task;
}
