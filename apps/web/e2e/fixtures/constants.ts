// apps/web/e2e/fixtures/constants.ts

/** Deterministic UUIDs for E2E test fixtures. Re-seeded on every globalSetup run. */
export const E2E = {
  // Users
  ADMIN_ID:    "e2e00000-0000-0000-0000-000000000001",
  ADMIN_EMAIL: "e2e@kolekta.id",
  ADMIN_PASS:  "E2ePass123!",

  // Event
  EVENT_ID:    "e2e00000-0000-0000-0000-000000000002",
  EVENT_CID:   "e2e00000-0000-0000-0001-000000000002",

  // Cards
  CARD1_ID:    "e2e00000-0000-0000-0000-000000000003",
  CARD1_CID:   "e2e00000-0000-0000-0001-000000000003",
  CARD2_ID:    "e2e00000-0000-0000-0000-000000000004",
  CARD2_CID:   "e2e00000-0000-0000-0001-000000000004",
  CARD3_ID:    "e2e00000-0000-0000-0000-000000000005",
  CARD3_CID:   "e2e00000-0000-0000-0001-000000000005",

  // Pre-seeded sale transactions for TEST3 (creates oversold state)
  TX_A_ID:     "e2e00000-0000-0000-0000-000000000010",
  TX_A_CID:    "e2e00000-0000-0000-0001-000000000010",
  TX_B_ID:     "e2e00000-0000-0000-0000-000000000011",
  TX_B_CID:    "e2e00000-0000-0000-0001-000000000011",

  // Short IDs
  SHORT1:      "0-TEST1",
  SHORT2:      "0-TEST2",
  SHORT3:      "0-TEST3",

  // Prices (integer IDR)
  PRICE1:      100_000,
  LISTED2:     500_000,
  BOTTOM2:     300_000,
  PRICE3:       75_000,

  // Misc
  SESSION_SECRET: "e2e-test-secret-must-be-at-least-32-characters-long-xxxxxxxxxx",
  API_PORT: 3001,
} as const;
