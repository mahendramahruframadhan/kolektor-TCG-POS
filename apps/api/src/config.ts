import { z } from "zod";

/**
 * Centralised env schema. Parsed once at boot — misconfiguration fails
 * fast with a clear message instead of surfacing later as obscure
 * runtime errors (DB file missing, CORS wrong origin, session cookie
 * invalid, etc.).
 */
const SessionSecretSchema = z
  .string()
  .min(32, "SESSION_SECRET must be at least 32 characters long")
  .refine(
    (v) => v !== "change-me-to-a-long-random-string",
    "SESSION_SECRET is still the .env.example placeholder — rotate via `openssl rand -hex 32`"
  );

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().max(65535).default(3001),
    HOST: z.string().default("0.0.0.0"),
    DATABASE_PATH: z.string().default("kolektapos.db"),
    PHOTO_STORAGE_PATH: z.string().default("storage/photos"),
    SESSION_SECRET: SessionSecretSchema,
    DOMAIN: z.string().optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production" && !v.DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DOMAIN"],
        message:
          "DOMAIN is required in production — CORS would otherwise reflect any origin with credentials",
      });
    }
    if ((v.ADMIN_EMAIL && !v.ADMIN_PASSWORD) || (!v.ADMIN_EMAIL && v.ADMIN_PASSWORD)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ADMIN_EMAIL"],
        message:
          "ADMIN_EMAIL and ADMIN_PASSWORD must be set together (or both left unset — seed then skips admin creation)",
      });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "<env>"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[config] Invalid environment variables:\n${formatted}\n\nSee .env.example for the expected shape.`
    );
  }
  return parsed.data;
}
