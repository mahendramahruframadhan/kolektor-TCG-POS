import type { FastifyInstance } from "fastify";
import { createReadStream, statSync } from "fs";
import { requireAdmin } from "../plugins/auth-guard.js";

export async function backupRoute(
  app: FastifyInstance,
  opts: { dbPath: string }
) {
  const { dbPath } = opts;

  // GET /backup — stream the SQLite database file as a download (admin only)
  app.get("/backup", { preHandler: requireAdmin }, async (_request, reply) => {
    let stat;
    try {
      stat = statSync(dbPath);
    } catch {
      return reply.status(503).send({ error: "Database file not accessible" });
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `kolektapos-${today}.db`;

    reply.header("Content-Disposition", `attachment; filename="${filename}"`);
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Length", stat.size.toString());

    const stream = createReadStream(dbPath);
    return reply.send(stream);
  });
}
