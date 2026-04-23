import type { FastifyRequest, FastifyReply } from "fastify";

declare module "@fastify/session" {
  interface FastifySessionObject {
    userId?: string;
    userRole?: string;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.session.userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }
  if (request.session.userRole !== "admin") {
    return reply.status(403).send({ error: "Forbidden" });
  }
}
