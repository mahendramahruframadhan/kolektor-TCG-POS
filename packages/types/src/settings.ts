import { z } from "zod";

export const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

export const KnownSettingKeys = [
  "max_line_discount_pct_fixed",
  "max_transaction_discount_pct",
  "cart_idle_ttl_minutes",
] as const;

export type KnownSettingKey = (typeof KnownSettingKeys)[number];
export type UpdateSetting = z.infer<typeof UpdateSettingSchema>;
