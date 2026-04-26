import { z } from "zod";
import {
  CardLanguageSchema,
  CardConditionSchema,
  CardPricingModeSchema,
  GradingCompanySchema,
} from "@kolektapos/types";

/**
 * Sync protocol — push/pull with server-authoritative cursor (PRD §16.2).
 *
 * Push: client sends batch of ops since last cursor.
 * Pull: client requests changes since cursor.
 * Cursor is based on server_received_at (not client wall-clock).
 */

// ── Per-op payload schemas ─────────────────────────────────────────────────

export const CreateCardOpPayloadSchema = z
  .object({
    shortId: z.string().regex(/^[A-Z0-9]-[A-Z0-9]{5}$/),
    ownerUserId: z.string().uuid(),
    stockReceivedByUserId: z.string().uuid(),
    eventId: z.string().uuid().optional(),
    title: z.string().min(1),
    setName: z.string().default(""),
    setNumber: z.string().default(""),
    category: z.string().default(""),
    rarity: z.string().default(""),
    language: CardLanguageSchema.default("EN"),
    edition: z.string().default(""),
    condition: CardConditionSchema.default("Near Mint"),
    isGraded: z.boolean().default(false),
    gradingCompany: GradingCompanySchema.optional(),
    grade: z.string().optional(),
    certNumber: z.string().optional(),
    pricingMode: CardPricingModeSchema.default("fixed"),
    priceIdr: z.number().int().positive().optional(),
    listedPriceIdr: z.number().int().positive().optional(),
    bottomPriceIdr: z.number().int().positive().optional(),
    photoPath: z.string().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.pricingMode === "fixed"
        ? d.priceIdr != null
        : d.listedPriceIdr != null && d.bottomPriceIdr != null,
    { message: "fixed cards need priceIdr; negotiable cards need listedPriceIdr + bottomPriceIdr" }
  );

export const CreateTransactionOpPayloadSchema = z
  .object({
    cartId: z.string().uuid().nullable().optional(),
    eventId: z.string().uuid(),
    kind: z.literal("sale"),
    subtotalIdr: z.number().int(),
    discountIdr: z.number().int().default(0),
    discountReason: z.string().optional(),
    totalIdr: z.number().int(),
    paymentChannelId: z.string().uuid().nullable().optional(),
    paymentNote: z.string().optional(),
    paidAt: z.number().int(),
    notes: z.string().optional(),
  })
  .strict();

export type CreateCardOpPayload = z.infer<typeof CreateCardOpPayloadSchema>;
export type CreateTransactionOpPayload = z.infer<typeof CreateTransactionOpPayloadSchema>;

// ── Op types ──────────────────────────────────────────────────────────────

export const SyncOpTypeSchema = z.enum([
  "create_card",
  "update_card",
  "create_cart",
  "update_cart",
  "add_cart_item",
  "remove_cart_item",
  "abandon_cart",
  "pay_cart",
  "create_transaction",
  "create_hold",
  "release_hold",
]);

export type SyncOpType = z.infer<typeof SyncOpTypeSchema>;

export const CreateCardOpSchema = z.object({
  type: z.literal("create_card"),
  clientId: z.string().uuid(),
  payload: CreateCardOpPayloadSchema,
  clientCreatedAt: z.number().int(),
});

export const CreateTransactionOpSchema = z.object({
  type: z.literal("create_transaction"),
  clientId: z.string().uuid(),
  payload: CreateTransactionOpPayloadSchema,
  clientCreatedAt: z.number().int(),
});

// Fallback for unrecognised op types — server rejects them but the client
// can still send future op types without breaking older servers.
export const UnknownOpSchema = z.object({
  type: z.string(),
  clientId: z.string().uuid(),
  payload: z.record(z.unknown()),
  clientCreatedAt: z.number().int(),
});

export const SyncOpSchema = z.union([
  CreateCardOpSchema,
  CreateTransactionOpSchema,
  UnknownOpSchema,
]);

export type SyncOp = z.infer<typeof SyncOpSchema>;
export type CreateCardOp = z.infer<typeof CreateCardOpSchema>;
export type CreateTransactionOp = z.infer<typeof CreateTransactionOpSchema>;

// ── Push request/response ─────────────────────────────────────────────────

export const SyncPushRequestSchema = z.object({
  ops: z.array(SyncOpSchema),
  deviceId: z.string().uuid(),
});

export const SyncOpResultSchema = z.object({
  clientId: z.string().uuid(),
  status: z.enum(["accepted", "rejected", "conflict"]),
  reason: z.string().optional(),
  serverEntityId: z.string().uuid().optional(),
});

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncOpResultSchema),
  newCursor: z.number().int(),
});

export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncOpResult = z.infer<typeof SyncOpResultSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;

// ── Pull request/response ─────────────────────────────────────────────────

export const SyncPullRequestSchema = z.object({
  cursor: z.number().int().default(0),
  deviceId: z.string().uuid(),
});

export const SyncEntityChangeSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.record(z.unknown()),
  serverReceivedAt: z.number().int(),
});

export const SyncPullResponseSchema = z.object({
  changes: z.array(SyncEntityChangeSchema),
  newCursor: z.number().int(),
  hasMore: z.boolean(),
});

export type SyncPullRequest = z.infer<typeof SyncPullRequestSchema>;
export type SyncEntityChange = z.infer<typeof SyncEntityChangeSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
