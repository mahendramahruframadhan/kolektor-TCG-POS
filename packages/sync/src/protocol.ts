import { z } from "zod";

/**
 * Sync protocol — push/pull with server-authoritative cursor (PRD §16.2).
 *
 * Push: client sends batch of ops since last cursor.
 * Pull: client requests changes since cursor.
 * Cursor is based on server_received_at (not client wall-clock).
 */

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

export const SyncOpSchema = z.object({
  type: SyncOpTypeSchema,
  clientId: z.string().uuid(),
  payload: z.record(z.unknown()),
  clientCreatedAt: z.number().int(), // display-only, not for ordering
});

export type SyncOp = z.infer<typeof SyncOpSchema>;

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
