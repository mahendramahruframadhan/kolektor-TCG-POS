import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ── helpers ───────────────────────────────────────────────────────────────
const now = sql`(strftime('%s','now'))`;
const pk = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

// ── users ─────────────────────────────────────────────────────────────────
export const users = sqliteTable("users", {
  id: pk(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: ["admin", "cashier"] }).notNull().default("cashier"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
  version: integer("version").notNull().default(1),
});

// ── events ────────────────────────────────────────────────────────────────
export const events = sqliteTable("events", {
  id: pk(),
  name: text("name").notNull(),
  venue: text("venue").notNull().default(""),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status", { enum: ["draft", "active", "closed"] })
    .notNull()
    .default("draft"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
  version: integer("version").notNull().default(1),
});

// ── payment_channels ──────────────────────────────────────────────────────
export const paymentChannels = sqliteTable("payment_channels", {
  id: pk(),
  name: text("name").notNull(),
  type: text("type").notNull().default("other"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── settings ──────────────────────────────────────────────────────────────
export const settings = sqliteTable("settings", {
  id: pk(),
  key: text("key").notNull().unique(),
  valueJson: text("value_json").notNull(),
  updatedByUserId: text("updated_by_user_id").references(() => users.id),
  updatedAt: integer("updated_at").notNull().default(now),
});

// ── cards ─────────────────────────────────────────────────────────────────
export const cards = sqliteTable(
  "cards",
  {
    id: pk(),
    // client-generated UUID for idempotent sync (§6.1 rule 6)
    clientId: text("client_id").notNull().unique(),
    // short ID: O-XXXXX format (§8)
    shortId: text("short_id").notNull().unique(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    intakenByUserId: text("intaken_by_user_id")
      .notNull()
      .references(() => users.id),
    eventId: text("event_id").references(() => events.id),
    title: text("title").notNull(),
    setName: text("set_name").notNull().default(""),
    setNumber: text("set_number").notNull().default(""),
    rarity: text("rarity").notNull().default(""),
    language: text("language", {
      enum: ["EN", "JP", "ID", "KR", "CN", "Other"],
    })
      .notNull()
      .default("EN"),
    edition: text("edition").notNull().default(""),
    condition: text("condition", {
      enum: [
        "Mint",
        "Near Mint",
        "Lightly Played",
        "Moderately Played",
        "Heavily Played",
        "Damaged",
      ],
    })
      .notNull()
      .default("Near Mint"),
    isGraded: integer("is_graded", { mode: "boolean" })
      .notNull()
      .default(false),
    gradingCompany: text("grading_company", {
      enum: ["PSA", "BGS", "CGC", "SGC", "Other"],
    }),
    grade: text("grade"),
    certNumber: text("cert_number"),
    photoPath: text("photo_path"),
    pricingMode: text("pricing_mode", { enum: ["fixed", "negotiable"] })
      .notNull()
      .default("fixed"),
    // All monetary values are integer IDR — no REAL/NUMERIC (§6.1 rule 8)
    priceIdr: integer("price_idr"),
    listedPriceIdr: integer("listed_price_idr"),
    bottomPriceIdr: integer("bottom_price_idr"),
    status: text("status", {
      enum: ["available", "held", "sold", "returned"],
    })
      .notNull()
      .default("available"),
    oversold: integer("oversold", { mode: "boolean" }).notNull().default(false),
    // Denormalized cart-lock fields for fast scan-screen display (§6.1 rule 4)
    // Source of truth is cart_items; update these atomically on cart_items insert/remove.
    lockedByCartId: text("locked_by_cart_id"),
    lockedByUserId: text("locked_by_user_id"),
    lockedAt: integer("locked_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("cards_client_id_idx").on(t.clientId),
    uniqueIndex("cards_short_id_idx").on(t.shortId),
    index("cards_owner_idx").on(t.ownerUserId),
    index("cards_status_idx").on(t.status),
  ]
);

// ── holds ─────────────────────────────────────────────────────────────────
export const holds = sqliteTable("holds", {
  id: pk(),
  cardId: text("card_id")
    .notNull()
    .references(() => cards.id),
  heldByUserId: text("held_by_user_id")
    .notNull()
    .references(() => users.id),
  customerLabel: text("customer_label").notNull().default(""),
  expiresAt: integer("expires_at").notNull(),
  releasedAt: integer("released_at"),
  releaseReason: text("release_reason", {
    enum: ["expired", "manual_release", "converted_to_cart", "voided"],
  }),
  notes: text("notes").notNull().default(""),
  createdAt: integer("created_at").notNull().default(now),
});

// ── carts ─────────────────────────────────────────────────────────────────
export const carts = sqliteTable(
  "carts",
  {
    id: pk(),
    clientId: text("client_id").notNull().unique(),
    cashierUserId: text("cashier_user_id")
      .notNull()
      .references(() => users.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    status: text("status", { enum: ["draft", "paid", "abandoned"] })
      .notNull()
      .default("draft"),
    abandonedReason: text("abandoned_reason", {
      enum: ["manual", "idle_ttl", "admin_force"],
    }),
    paidTransactionId: text("paid_transaction_id"),
    lastActivityAt: integer("last_activity_at").notNull().default(now),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
    version: integer("version").notNull().default(1),
  },
  (t) => [uniqueIndex("carts_client_id_idx").on(t.clientId)]
);

// ── cart_items ────────────────────────────────────────────────────────────
export const cartItems = sqliteTable("cart_items", {
  id: pk(),
  cartId: text("cart_id")
    .notNull()
    .references(() => carts.id),
  cardId: text("card_id")
    .notNull()
    .references(() => cards.id),
  // All monetary: integer IDR
  intendedPriceIdr: integer("intended_price_idr").notNull(),
  lineDiscountIdr: integer("line_discount_idr").notNull().default(0),
  lineDiscountPct: integer("line_discount_pct").notNull().default(0),
  lineDiscountReason: text("line_discount_reason"),
  requiresAdminOverride: integer("requires_admin_override", { mode: "boolean" })
    .notNull()
    .default(false),
  overrideByUserId: text("override_by_user_id").references(() => users.id),
  overrideReason: text("override_reason"),
  createdAt: integer("created_at").notNull().default(now),
  updatedAt: integer("updated_at").notNull().default(now),
});

// ── transactions (APPEND-ONLY) ────────────────────────────────────────────
// Enforced by SQLite triggers in triggers.sql
export const transactions = sqliteTable(
  "transactions",
  {
    id: pk(),
    clientId: text("client_id").notNull().unique(),
    cartId: text("cart_id").references(() => carts.id),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    cashierUserId: text("cashier_user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind", { enum: ["sale", "void", "refund"] })
      .notNull()
      .default("sale"),
    parentTransactionId: text("parent_transaction_id"),
    // All monetary: integer IDR
    subtotalIdr: integer("subtotal_idr").notNull(),
    discountIdr: integer("discount_idr").notNull().default(0),
    discountReason: text("discount_reason"),
    totalIdr: integer("total_idr").notNull(),
    paymentChannelId: text("payment_channel_id").references(
      () => paymentChannels.id
    ),
    paymentNote: text("payment_note"),
    paidAt: integer("paid_at"),
    voidOrRefundReason: text("void_or_refund_reason"),
    notes: text("notes"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("transactions_client_id_idx").on(t.clientId),
    index("transactions_event_idx").on(t.eventId),
    index("transactions_cashier_idx").on(t.cashierUserId),
    index("transactions_kind_idx").on(t.kind),
  ]
);

// ── transaction_items (APPEND-ONLY) ───────────────────────────────────────
// Enforced by SQLite triggers in triggers.sql
export const transactionItems = sqliteTable(
  "transaction_items",
  {
    id: pk(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id),
    // Snapshot: single source of truth for settlement (§6.1 rule 5)
    // NEVER join through cards.owner_user_id for payout math
    ownerUserIdSnapshot: text("owner_user_id_snapshot").notNull(),
    listedPriceIdrSnapshot: integer("listed_price_idr_snapshot").notNull(),
    soldPriceIdr: integer("sold_price_idr").notNull(),
    lineDiscountIdr: integer("line_discount_idr").notNull().default(0),
    lineDiscountReason: text("line_discount_reason"),
    overrideBelowBottom: integer("override_below_bottom", { mode: "boolean" })
      .notNull()
      .default(false),
    overrideReason: text("override_reason"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("ti_transaction_idx").on(t.transactionId),
    index("ti_card_idx").on(t.cardId),
    index("ti_owner_snapshot_idx").on(t.ownerUserIdSnapshot),
  ]
);

// ── cash_reconciliations ──────────────────────────────────────────────────
export const cashReconciliations = sqliteTable("cash_reconciliations", {
  id: pk(),
  eventId: text("event_id")
    .notNull()
    .references(() => events.id),
  date: text("date").notNull(),
  expectedCashIdr: integer("expected_cash_idr").notNull(),
  countedCashIdr: integer("counted_cash_idr").notNull(),
  varianceIdr: integer("variance_idr").notNull(),
  notes: text("notes").notNull().default(""),
  closedByUserId: text("closed_by_user_id").references(() => users.id),
  closedAt: integer("closed_at"),
});

// ── audit_log ─────────────────────────────────────────────────────────────
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: pk(),
    userId: text("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    diffJson: text("diff_json"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("audit_user_idx").on(t.userId),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ]
);
