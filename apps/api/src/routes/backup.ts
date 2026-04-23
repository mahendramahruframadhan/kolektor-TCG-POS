import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { createReadStream, existsSync, statSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import archiver from "archiver";
import { requireAdmin } from "../plugins/auth-guard.js";

export async function backupRoute(
  app: FastifyInstance,
  opts: { dbPath: string; photoStoragePath?: string }
) {
  const { dbPath, photoStoragePath = "storage/photos" } = opts;

  app.get("/backup", { preHandler: requireAdmin }, async (_request, reply) => {
    try {
      statSync(dbPath);
    } catch {
      return reply.status(503).send({ error: "Database file not accessible" });
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `kolektapos-backup-${today}.zip`;
    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/zip");

    // Snapshot the live DB into a tempfile via better-sqlite3's backup API.
    // This is WAL-safe and produces a consistent, standalone .sqlite file.
    const snapshotPath = join(
      tmpdir(),
      `kolektapos-snapshot-${Date.now()}-${process.pid}.sqlite`
    );

    const source = new Database(dbPath, { readonly: false });
    try {
      try {
        source.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        // Checkpoint is best-effort; if it fails the backup API still
        // produces a consistent snapshot on its own.
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
    archive.on("error", (err) => {
      cleanup();
      reply.log.error({ err }, "[backup] archiver error");
    });

    archive.append(createReadStream(snapshotPath), { name: "kolektapos.db" });
    if (existsSync(photoStoragePath)) {
      archive.directory(photoStoragePath, "photos");
    }

    // IMPORTANT order: pipe the archive into the reply FIRST, then finalize().
    // The previous `archive.finalize(); reply.send(archive);` order meant
    // finalize() could emit end before the response stream started consuming.
    reply.send(archive);
    archive.finalize();
  });
}
