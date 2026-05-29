import type { FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";

export async function sessionPlugin(app: FastifyInstance, opts?: { secret?: string; nodeEnv?: string }) {
  const secret = opts?.secret ?? process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET env var must be at least 32 chars");
  }
  const isProduction = (opts?.nodeEnv ?? process.env.NODE_ENV) === "production";

  await app.register(fastifyCookie);
  await app.register(fastifySession, {
    secret,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30-day rolling
    },
    rolling: true,
  });
}
