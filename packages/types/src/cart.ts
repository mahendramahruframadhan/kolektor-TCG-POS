import { z } from "zod";

export const CreateCartSchema = z.object({
  clientId: z.string().uuid(),
  eventId: z.string().uuid(),
});

export const AddCartItemSchema = z.object({
  cardId: z.string().uuid(),
  intendedPriceIdr: z.number().int().positive(),
  lineDiscountIdr: z.number().int().min(0).default(0),
  lineDiscountReason: z.string().optional(),
  requiresAdminOverride: z.boolean().default(false),
  overrideByUserId: z.string().uuid().optional(),
  overrideReason: z.string().optional(),
});

export const PayCartSchema = z.object({
  paymentChannelId: z.string().uuid(),
  paymentNote: z.string().optional(),
  notes: z.string().optional(),
  discountIdr: z.number().int().min(0).default(0),
  discountReason: z.string().optional(),
  transactionClientId: z.string().uuid(),
});

export type CreateCart = z.infer<typeof CreateCartSchema>;
export type AddCartItem = z.infer<typeof AddCartItemSchema>;
export type PayCart = z.infer<typeof PayCartSchema>;
