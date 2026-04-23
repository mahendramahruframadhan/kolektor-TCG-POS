const BASE = "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error ?? "Request failed"), {
      status: res.status,
      body: err,
    });
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ id: string; email: string; displayName: string; role: string }>(
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
    list: () => request<unknown[]>("/payment-channels"),
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
      request<unknown>(`/cards/by-short-id/${shortId}`),
    list: () => request<unknown[]>("/cards"),
    create: (body: unknown) =>
      request<unknown>("/cards", {
        method: "POST",
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
    void: (id: string, body: unknown) =>
      request<unknown>(`/transactions/${id}/void`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    refund: (id: string, body: unknown) =>
      request<unknown>(`/transactions/${id}/refund`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
  backup: {
    download: () => fetch("/api/backup", { credentials: "include" }),
  },
  reports: {
    settlement: (eventId: string) =>
      request<unknown>(`/reports/event/${eventId}/settlement`),
    inventoryValue: (eventId: string) =>
      request<unknown>(`/reports/event/${eventId}/inventory-value`),
    monthly: (year: number, month: number) =>
      request<unknown>(`/reports/monthly?year=${year}&month=${month}`),
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
  sync: {
    pull: (cursor: number, deviceId: string) =>
      request<unknown>(`/sync/pull?cursor=${cursor}&deviceId=${encodeURIComponent(deviceId)}`),
    push: (ops: unknown[], deviceId: string) =>
      request<unknown>("/sync/push", {
        method: "POST",
        body: JSON.stringify({ ops, deviceId }),
      }),
  },
  carts: {
    create: (body: unknown) =>
      request<unknown>("/carts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    addItem: (cartId: string, body: unknown) =>
      request<unknown>(`/carts/${cartId}/items`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    removeItem: (cartId: string, cardId: string) =>
      request<unknown>(`/carts/${cartId}/items/${cardId}`, {
        method: "DELETE",
      }),
    pay: (cartId: string, body: unknown) =>
      request<unknown>(`/carts/${cartId}/pay`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    abandon: (cartId: string) =>
      request<unknown>(`/carts/${cartId}/abandon`, { method: "POST" }),
  },
};
