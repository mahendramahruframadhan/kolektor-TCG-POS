import Dexie, { type Table } from "dexie";

// Client-side IndexedDB schema mirroring §6 (subset relevant to PWA)
export interface IdbUser {
  id: string;
  email: string;
  displayName: string;
  role: "admin" | "cashier";
  version?: number;
}

export interface IdbEvent {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "closed";
  settledAt?: number;
  settledByUserId?: string;
  version: number;
}

export interface IdbCashReconciliation {
  id: string;
  eventId: string;
  date: string;
  expectedCashIdr: number;
  countedCashIdr: number;
  varianceIdr: number;
  notes: string;
  closedByUserId?: string;
  closedAt?: number;
}

export interface IdbPaymentChannel {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
}

export interface IdbSetting {
  key: string;
  value: unknown;
}

export interface IdbCard {
  id: string;
  clientId: string;
  shortId: string;
  ownerUserId: string;
  intakenByUserId: string;
  eventId?: string;
  title: string;
  setName: string;
  setNumber: string;
  rarity: string;
  language: string;
  edition: string;
  condition: string;
  isGraded: boolean;
  gradingCompany?: string;
  grade?: string;
  certNumber?: string;
  photoPath?: string;
  pricingMode: "fixed" | "negotiable";
  priceIdr?: number;
  listedPriceIdr?: number;
  bottomPriceIdr?: number;
  status: "available" | "held" | "sold" | "returned";
  oversold: boolean;
  lockedByCartId?: string;
  lockedByUserId?: string;
  lockedAt?: number;
  version: number;
}

export interface IdbCart {
  id: string;
  clientId: string;
  cashierUserId: string;
  eventId: string;
  status: "draft" | "paid" | "abandoned";
  abandonedReason?: string;
  paidTransactionId?: string;
  lastActivityAt: number;
  version: number;
}

export interface IdbCartItem {
  id: string;
  cartId: string;
  cardId: string;
  intendedPriceIdr: number;
  lineDiscountIdr: number;
  lineDiscountPct: number;
  lineDiscountReason?: string;
  requiresAdminOverride: boolean;
  overrideByUserId?: string;
  overrideReason?: string;
}

export interface IdbTransaction {
  id: string;
  clientId: string;
  cartId?: string;
  eventId: string;
  cashierUserId: string;
  kind: "sale" | "void" | "refund";
  parentTransactionId?: string;
  subtotalIdr: number;
  discountIdr: number;
  discountReason?: string;
  totalIdr: number;
  paymentChannelId?: string;
  paymentNote?: string;
  paidAt?: number;
  voidOrRefundReason?: string;
  notes?: string;
  createdAt: number;
}

export interface IdbTransactionItem {
  id: string;
  transactionId: string;
  cardId: string;
  ownerUserIdSnapshot: string;
  listedPriceIdrSnapshot: number;
  soldPriceIdr: number;
  lineDiscountIdr: number;
  lineDiscountReason?: string;
  overrideBelowBottom: boolean;
  overrideReason?: string;
  createdAt: number;
}

export interface IdbPendingPhoto {
  cardClientId: string;
  blob: Blob;
  createdAt: number;
}

class KolektaDb extends Dexie {
  users!: Table<IdbUser>;
  events!: Table<IdbEvent>;
  paymentChannels!: Table<IdbPaymentChannel>;
  settings!: Table<IdbSetting>;
  cards!: Table<IdbCard>;
  carts!: Table<IdbCart>;
  cartItems!: Table<IdbCartItem>;
  transactions!: Table<IdbTransaction>;
  transactionItems!: Table<IdbTransactionItem>;
  pendingPhotos!: Table<IdbPendingPhoto>;
  cashReconciliations!: Table<IdbCashReconciliation>;

  constructor() {
    super("kolektapos");
    this.version(1).stores({
      users: "id, email, role",
      events: "id, status",
      paymentChannels: "id, isActive",
      settings: "key",
      cards: "id, clientId, shortId, status, ownerUserId, lockedByCartId",
      carts: "id, clientId, status, cashierUserId",
      cartItems: "id, cartId, cardId",
      transactions: "id, clientId, eventId, cashierUserId, kind",
      transactionItems: "id, transactionId, cardId, ownerUserIdSnapshot",
      pendingPhotos: "cardClientId",
    });
    this.version(2).stores({
      cashReconciliations: "id, eventId, date",
    });
  }
}

export const idb = new KolektaDb();
