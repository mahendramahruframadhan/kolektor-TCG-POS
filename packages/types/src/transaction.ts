import { z } from "zod";

export const CreateVoidRefundSchema = z.object({
  kind: z.enum(["void", "refund"]),
  parentTransactionId: z.string().uuid(),
  reason: z.string().min(1),
  clientId: z.string().uuid(),
});

export type CreateVoidRefund = z.infer<typeof CreateVoidRefundSchema>;
