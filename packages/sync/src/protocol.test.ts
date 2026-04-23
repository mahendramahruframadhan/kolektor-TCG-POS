import { describe, it, expect } from "vitest";
import { SyncOpSchema, SyncPushRequestSchema, SyncPullRequestSchema } from "./protocol.js";

describe("SyncOpSchema", () => {
  it("accepts valid create_card op", () => {
    const op = {
      type: "create_card" as const,
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      payload: { title: "Pikachu", shortId: "0-ABC12" },
      clientCreatedAt: Date.now(),
    };
    expect(SyncOpSchema.safeParse(op).success).toBe(true);
  });

  it("rejects missing clientId", () => {
    const op = { type: "create_card", payload: {}, clientCreatedAt: Date.now() };
    expect(SyncOpSchema.safeParse(op).success).toBe(false);
  });

  it("rejects unknown op type", () => {
    const op = { type: "destroy_everything", clientId: "550e8400-e29b-41d4-a716-446655440000", payload: {}, clientCreatedAt: Date.now() };
    expect(SyncOpSchema.safeParse(op).success).toBe(false);
  });
});

describe("SyncPushRequestSchema", () => {
  it("accepts valid push request", () => {
    const req = {
      ops: [
        { type: "create_card" as const, clientId: "550e8400-e29b-41d4-a716-446655440000", payload: {}, clientCreatedAt: Date.now() },
        { type: "create_transaction" as const, clientId: "550e8400-e29b-41d4-a716-446655440001", payload: {}, clientCreatedAt: Date.now() },
      ],
      deviceId: "550e8400-e29b-41d4-a716-446655440002",
    };
    expect(SyncPushRequestSchema.safeParse(req).success).toBe(true);
  });

  it("accepts empty ops array (idempotent no-op)", () => {
    const req = { ops: [], deviceId: "550e8400-e29b-41d4-a716-446655440000" };
    expect(SyncPushRequestSchema.safeParse(req).success).toBe(true);
  });
});

describe("SyncPullRequestSchema", () => {
  it("accepts valid pull request", () => {
    const req = { cursor: 42, deviceId: "550e8400-e29b-41d4-a716-446655440000" };
    expect(SyncPullRequestSchema.safeParse(req).success).toBe(true);
  });

  it("accepts default cursor (0)", () => {
    const req = { deviceId: "550e8400-e29b-41d4-a716-446655440000" };
    expect(SyncPullRequestSchema.safeParse(req).success).toBe(true);
  });

  it("rejects invalid deviceId", () => {
    const req = { cursor: 0, deviceId: "not-a-uuid" };
    expect(SyncPullRequestSchema.safeParse(req).success).toBe(false);
  });
});
