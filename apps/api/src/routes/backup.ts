import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { createReadStream, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import archiver from "archiver";
import { requireAdmin } from "../plugins/auth-guard.js";

export async function backupRoute(
  app: FastifyInstance,
  opts: { dbPath: string; photoStoragePath?: string }
) {
  const { dbPath, photoStoragePath = "storage/photos" } = opts;

  app.get("/backup", { preHandler: requireAdmin, config: { rateLimit: { max: 2, timeWindow: "1 hour" } } }, async (request, reply) => {
    const today = new Date().toISOString().slice(0, 10);
    const filename = `kolektapos-backup-${today}.zip`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/zip");

    // Snapshot the live DB into a tempfile via better-sqlite3's backup API —
    // WAL-safe, produces a consistent standalone .sqlite file.
    const snapshotPath = join(
      tmpdir(),
      `kolektapos-snapshot-${Date.now()}-${process.pid}.sqlite`
    );

    let source: Database.Database;
    try {
      source = new Database(dbPath, { readonly: true });
    } catch {
      return reply.status(503).send({ error: "Database file not accessible" });
    }
    try {
      try {
        source.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        // Checkpoint is best-effort; backup() still produces a consistent snapshot.
      }
      await source.backup(snapshotPath);
    } finally {
      source.close();
    }

    const archive = archiver("zip", { zlib: { level: 6 } });

    const cleanup = () => {
      try { unlinkSync(snapshotPath); } catch { /* best effort */ }
    };
    archive.on("end", cleanup);
    archive.on("close", cleanup);
    request.raw.on("close", cleanup);
    archive.on("warning", (err) => {
      reply.log.warn({ err }, "[backup] archiver warning");
    });
    archive.on("error", (err) => {
      cleanup();
      reply.log.error({ err }, "[backup] archiver error");
      try { reply.raw.destroy(err); } catch { /* already sent */ }
    });

    archive.append(createReadStream(snapshotPath), { name: "kolektapos.db" });
    // archiver tolerates missing directories via 'warning' event; no pre-check needed.
    archive.directory(photoStoragePath, "photos");

    // Pipe the archive into the reply BEFORE finalizing, otherwise finalize()
    // can emit end before the response stream starts consuming.
    reply.send(archive);
    archive.finalize();
  });
}
