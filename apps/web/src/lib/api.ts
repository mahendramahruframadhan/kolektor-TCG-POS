import type { SyncPullResponse, SyncPushResponse } from "@kolektapos/sync";
import type { CreateCard, UpdateCard } from "@kolektapos/types";

const BASE = "/api";

// Callback set by auth store so api.ts can trigger logout on 401
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: "include",
      headers: { ...headers, ...options.headers },
      ...options,
    });
  } catch (fetchErr) {
    // Network failure (offline, DNS error, CORS, etc.)
    throw Object.assign(
      new Error(fetchErr instanceof Error ? fetchErr.message : "Network Error"),
      { status: undefined, name: "NetworkError", cause: fetchErr }
    );
  }

  if (!res.ok) {
    if (res.status === 401) {
      onSessionExpired?.();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = typeof err.error === "string"
      ? err.error
      : JSON.stringify(err.error ?? "Request failed");
    throw Object.assign(new Error(msg), {
      status: res.status,
      body: err,
    });
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── Shared response shape types ────────────────────────────────────────────

/** Server card row (includes all DB columns the API returns). */
type CardResponse = {
  id: string;
  clientId: string;
  shortId: string;
  ownerUserId: string;
  stockReceivedByUserId: string;
  eventId?: string;
  title: string;
  category: string;
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
  pricingMode: string;
  priceIdr?: number;
  listedPriceIdr?: number;
  bottomPriceIdr?: number;
  status: string;
  lockedByCartId?: string;
  lockedByUserId?: string;
  lockedAt?: number;
  oversold: boolean;
  version: number;
  createdAt: number;
};

type CartResponse = {
  id: string;
  clientId: string;
  status: string;
  eventId: string;
};

type CartItemResponse = {
  id: string;
  cartId: string;
  cardId: string;
  intendedPriceIdr: number;
};

type PayCartResponse = {
  transaction: { id: string; totalIdr: number; kind: string };
  receipt: unknown[];
};

type TransactionResponse = {
  id: string;
  kind: string;
  totalIdr: number;
  eventId: string;
  items: unknown[];
};

type VoidRefundResponse = {
  transaction: { id: string; kind: string };
  items: unknown[];
};

type PaymentChannelListItem = {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  sortOrder: number;
};

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{
        id: string;
        email: string;
        displayName: string;
        role: string;
        offlineHash?: string;
        allUsersHash?: Array<{
          id: string;
          email: string;
          displayName: string;
          role: string;
          offlineHash: string;
        }>;
      }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      ),
    logout: () => request("/auth/logout", { method: "POST" }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      request<{ ok: boolean }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    me: () =>
      request<{ id: string; email: string; displayName: string; role: string }>(
        "/me"
      ),
    cacheCredential: () =>
      request<{
        email: string;
        offlineHash: string;
        id: string;
        displayName: string;
        role: string;
        cachedAt: number;
      }>("/auth/cache-credential", { method: "POST" }),
  },
  events: {
    list: () => request<{ id: string; name: string; venue: string; startDate: string; endDate: string; status: string; version: number; createdAt: number }[]>("/events"),
    create: (body: { name: string; venue: string; startDate: string; endDate: string; status: string }) =>
      request<{ id: string; name: string; venue: string; startDate: string; endDate: string; status: string }>("/events", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { name?: string; venue?: string; startDate?: string; endDate?: string; status?: string; version: number }) =>
      request<{ id: string; name: string; venue: string; startDate: string; endDate: string; status: string; version: number }>(`/events/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  paymentChannels: {
    list: () => request<PaymentChannelListItem[]>("/payment-channels"),
    create: (body: { name: string; type: string; sortOrder: number }) =>
      request<PaymentChannelListItem>("/payment-channels", {
        method: "POST",
        body: JSON.stringify({ ...body, isActive: true }),
      }),
    update: (id: string, body: { name?: string; type?: string; sortOrder?: number; isActive?: boolean; version: number }) =>
      request<PaymentChannelListItem>(`/payment-channels/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/payment-channels/${id}`, { method: "DELETE" }),
  },
  settings: {
    get: () => request<Record<string, unknown>>("/settings"),
    set: (key: string, value: unknown) =>
      request<unknown>(`/settings/${key}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
  },
  users: {
    list: () => request<{ id: string; email: string; displayName: string; role: string; createdAt: number }[]>("/users"),
    create: (body: { email: string; password: string; displayName: string; role: string }) =>
      request<{ id: string; email: string; displayName: string; role: string }>("/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: { displayName?: string; role?: string; password?: string }) =>
      request<{ id: string; email: string; displayName: string; role: string }>(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  cards: {
    byShortId: (shortId: string) =>
      request<CardResponse>(`/cards/by-short-id/${shortId}`),
    list: () => request<CardResponse[]>("/cards"),
    create: (body: CreateCard) =>
      request<CardResponse>("/cards", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateCard) =>
      request<CardResponse>(`/cards/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
  holds: {
    create: (body: unknown) =>
      request<unknown>("/holds", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    release: (id: string) =>
      request<unknown>(`/holds/${id}`, { method: "DELETE" }),
  },
  transactions: {
    get: (id: string) => request<TransactionResponse>(`/transactions/${id}`),
    void: (id: string, body: unknown) =>
      request<VoidRefundResponse>(`/transactions/${id}/void`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    refund: (id: string, body: unknown) =>
      request<unknown>(`/transactions/${id}/refund`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  auditLog: {
    list: (page = 1, limit = 50) =>
      request<{ rows: unknown[]; page: number; limit: number }>(`/audit-log?page=${page}&limit=${limit}`),
  },
  overrides: {
    list: () => request<unknown[]>("/overrides"),
  },
  backup: {
    download: () => fetch("/api/backup", { credentials: "include" }),
  },
  reports: {
    settlement: (eventId: string) =>
      request<unknown>(`/reports/event/${eventId}/settlement`),
    inventoryValue: (eventId: string) =>
      request<unknown>(`/reports/event/${eventId}/inventory-value`),
    monthly: (year: number, month: number, eventId?: string) => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      if (eventId) params.set("eventId", eventId);
      return request<unknown>(`/reports/monthly?${params}`);
    },
    settleEvent: (eventId: string) =>
      request<unknown>(`/events/${eventId}/settle`, { method: "POST" }),
  },
  cashReconciliations: {
    list: (eventId?: string, date?: string) => {
      const params = new URLSearchParams();
      if (eventId) params.set("eventId", eventId);
      if (date) params.set("date", date);
      const qs = params.toString();
      return request<unknown[]>(`/cash-reconciliations${qs ? `?${qs}` : ""}`);
    },
    create: (body: {
      eventId: string;
      date: string;
      expectedCashIdr: number;
      countedCashIdr: number;
      notes?: string;
    }) =>
      request<unknown>("/cash-reconciliations", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  admin: {
    pendingTransactions: () =>
      request<{
        transactions: Array<{
          id: string;
          clientId: string;
          cashierId: string;
          cashierDisplayName: string;
          cashierEmail: string;
          eventId: string;
          eventName: string;
          subtotalIdr: number;
          discountIdr: number;
          totalIdr: number;
          paymentChannel: string;
          itemCount: number;
          createdAt: number;
          paidAt: number;
          kind: string;
        }>;
        totalCount: number;
        stats: {
          totalPending: number;
          totalAmount: number;
          byCashier: Array<{ cashierId: string; cashierDisplayName: string; count: number; amount: number }>;
        };
      }>("/admin/pending-transactions"),
    pendingTransactionDetail: (transactionId: string) =>
      request<{
        transaction: {
          id: string;
          clientId: string;
          kind: string;
          subtotalIdr: number;
          discountIdr: number;
          discountReason?: string;
          totalIdr: number;
          paymentChannel: string;
          paymentNote?: string;
          notes?: string;
          createdAt: number;
          paidAt: number;
          cashier: { id: string; displayName: string; email: string };
          event: { id: string; name: string };
          items: Array<{
            cardId: string;
            cardTitle: string;
            cardShortId: string;
            ownerDisplayName: string;
            ownerUserIdSnapshot: string;
            listedPriceIdrSnapshot: number;
            soldPriceIdr: number;
            lineDiscountIdr: number;
            lineDiscountReason?: string;
            overrideBelowBottom: boolean;
            overrideReason?: string;
          }>;
        };
      }>(`/admin/pending-transactions/${transactionId}`),
  },
  sync: {
    pull: (cursor: number, deviceId: string) =>
      request<SyncPullResponse>(`/sync/pull?cursor=${cursor}&deviceId=${encodeURIComponent(deviceId)}`),
    push: (ops: unknown[], deviceId: string) =>
      request<SyncPushResponse>("/sync/push", {
        method: "POST",
        body: JSON.stringify({ ops, deviceId }),
      }),
    flushPendingTx: (pendingTxs: unknown[]) =>
      request<{
        results: { clientId: string; status: "accepted" | "rejected"; serverTransactionId?: string; reason?: string }[];
        processedAt: number;
      }>("/sync/flush-pending-tx", {
        method: "POST",
        body: JSON.stringify({ transactions: pendingTxs }),
      }),
  },
  carts: {
    create: (body: unknown) =>
      request<CartResponse>("/carts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    addItem: (cartId: string, body: unknown) =>
      request<{ item: CartItemResponse }>(`/carts/${cartId}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    removeItem: (cartId: string, cardId: string) =>
      request<void>(`/carts/${cartId}/items/${cardId}`, {
        method: "DELETE",
      }),
    pay: (cartId: string, body: unknown) =>
      request<PayCartResponse>(`/carts/${cartId}/pay`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    abandon: (cartId: string) =>
      request<{ ok: boolean }>(`/carts/${cartId}/abandon`, { method: "POST" }),
  },
};
