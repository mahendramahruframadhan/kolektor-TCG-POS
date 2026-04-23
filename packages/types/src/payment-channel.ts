import { z } from "zod";

export const CreatePaymentChannelSchema = z.object({
  name: z.string().min(1),
  type: z.string().default("other"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const UpdatePaymentChannelSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreatePaymentChannel = z.infer<typeof CreatePaymentChannelSchema>;
export type UpdatePaymentChannel = z.infer<typeof UpdatePaymentChannelSchema>;
