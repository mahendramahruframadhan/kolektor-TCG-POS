import { describe, it, expect } from "vitest";
import { CreateCardSchema, UpdateCardSchema } from "./card.js";

describe("CreateCardSchema", () => {
  it("accepts valid fixed-price card", () => {
    const card = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      shortId: "0-ABC12",
      ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
      stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Pikachu",
      pricingMode: "fixed",
      priceIdr: 50000,
    };
    expect(CreateCardSchema.safeParse(card).success).toBe(true);
  });

  it("accepts valid negotiable card", () => {
    const card = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      shortId: "0-ABC12",
      ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
      stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Charizard",
      pricingMode: "negotiable",
      listedPriceIdr: 100000,
      bottomPriceIdr: 80000,
    };
    expect(CreateCardSchema.safeParse(card).success).toBe(true);
  });

  it("rejects fixed card without priceIdr", () => {
    const card = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      shortId: "0-ABC12",
      ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
      stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Pikachu",
      pricingMode: "fixed",
    };
    expect(CreateCardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects negotiable card without bottomPriceIdr", () => {
    const card = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      shortId: "0-ABC12",
      ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
      stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Charizard",
      pricingMode: "negotiable",
      listedPriceIdr: 100000,
    };
    expect(CreateCardSchema.safeParse(card).success).toBe(false);
  });

  it("rejects invalid shortId format", () => {
    const card = {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      shortId: "abc-123",
      ownerUserId: "550e8400-e29b-41d4-a716-446655440001",
      stockReceivedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      title: "Pikachu",
      pricingMode: "fixed",
      priceIdr: 50000,
    };
    expect(CreateCardSchema.safeParse(card).success).toBe(false);
  });
});

describe("UpdateCardSchema", () => {
  it("accepts partial update", () => {
    const update = { title: "New Title", version: 2 };
    expect(UpdateCardSchema.safeParse(update).success).toBe(true);
  });

  it("requires version", () => {
    const update = { title: "New Title" };
    expect(UpdateCardSchema.safeParse(update).success).toBe(false);
  });
});
