import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";

export async function sessionPlugin(app: FastifyInstance) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be at least 32 chars");
  }

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30-day rolling
    },
    rolling: true,
  });
}
