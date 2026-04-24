import { describe, it, expect } from "vitest";
import { generateShortId, isValidShortId } from "./index.js";

describe("generateShortId", () => {
  it("generates correct format O-XXXXX for owner index 0", () => {
    const id = generateShortId(0);
    expect(id).toMatch(/^[0-9A-Z]-[0-9A-Z]{5}$/);
    expect(id[0]).toBe("0");
  });

  it("generates correct owner char for indices 0-9", () => {
    for (let i = 0; i <= 9; i++) {
      const id = generateShortId(i);
      expect(id[0]).toBe(String(i));
    }
  });

  it("generates 'A' for owner index 10", () => {
    const id = generateShortId(10);
    expect(id[0]).toBe("A");
  });

  it("throws for owner index < 0", () => {
    expect(() => generateShortId(-1)).toThrow(RangeError);
  });

  it("throws for owner index > 10", () => {
    expect(() => generateShortId(11)).toThrow(RangeError);
  });

  it("generates unique IDs across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateShortId(0));
    }
    expect(ids.size).toBe(1000);
  });
});

describe("isValidShortId", () => {
  it("accepts valid short IDs", () => {
    expect(isValidShortId("0-A1B2C")).toBe(true);
    expect(isValidShortId("A-XXXXX")).toBe(true);
    expect(isValidShortId("9-ZZZZZ")).toBe(true);
  });

  it("rejects lowercase", () => {
    expect(isValidShortId("0-a1b2c")).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidShortId("0-ABC")).toBe(false);
    expect(isValidShortId("0-ABCDEF")).toBe(false);
  });

  it("rejects missing separator", () => {
    expect(isValidShortId("0A1B2C3")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidShortId("")).toBe(false);
  });
});
