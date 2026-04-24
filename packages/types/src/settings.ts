import { z } from "zod";

/**
 * Settings that the server (and clients) expect. Any `PUT /settings/:key`
 * whose key is in this table is validated against the matching schema;
 * unknown keys are rejected so admins can't accidentally persist
 * malformed configuration that breaks downstream consumers.
 */
export const SETTING_SCHEMAS = {
  max_line_discount_pct_fixed: z.number().int().min(0).max(100),
  max_transaction_discount_pct: z.number().int().min(0).max(100),
  cart_idle_ttl_minutes: z.number().int().positive().max(1440),
  default_landing_page: z.enum(["dashboard", "pos", "reports"]),
} as const;

export type SettingKey = keyof typeof SETTING_SCHEMAS;

export const KnownSettingKeys = Object.keys(SETTING_SCHEMAS) as SettingKey[];

/** Validates an arbitrary `(key, value)` pair against its setting schema. */
export function validateSetting(
  key: string,
  value: unknown
):
  | { ok: true; key: SettingKey; value: unknown }
  | { ok: false; error: string } {
  const schema = (SETTING_SCHEMAS as Record<string, z.ZodTypeAny>)[key];
  if (!schema) return { ok: false, error: `unknown setting key: ${key}` };
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { ok: true, key: key as SettingKey, value: parsed.data };
}

/** Legacy envelope kept for existing route handlers. Prefer `validateSetting` for new code. */
export const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

export type UpdateSetting = z.infer<typeof UpdateSettingSchema>;
/** @deprecated alias for SettingKey */
export type KnownSettingKey = SettingKey;
