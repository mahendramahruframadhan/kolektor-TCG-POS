import type { FastifyInstance } from "fastify";
import { createReadStream, statSync, existsSync } from "fs";
import archiver from "archiver";
import { requireAdmin } from "../plugins/auth-guard.js";

export async function backupRoute(
  app: FastifyInstance,
  opts: { dbPath: string; photoStoragePath?: string }
) {
  const { dbPath, photoStoragePath = "storage/photos" } = opts;

  // GET /backup — stream a zip containing SQLite + photos (admin only)
  app.get("/backup", { preHandler: requireAdmin }, async (_request, reply) => {
    let dbStat;
    try {
      dbStat = statSync(dbPath);
    } catch {
      return reply.status(503).send({ error: "Database file not accessible" });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `kolektapos-backup-${today}.zip`;

    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/zip");

    const archive = archiver("zip", { zlib: { level: 6 } });

    // Append DB file
    archive.append(createReadStream(dbPath), { name: "kolektapos.db" });

    // Append photos directory if it exists
    if (existsSync(photoStoragePath)) {
      archive.directory(photoStoragePath, "photos");
    }

    archive.finalize();
    return reply.send(archive);
  });
}
