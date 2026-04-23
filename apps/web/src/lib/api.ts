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
    me: () =>
      request<{ id: string; email: string; displayName: string; role: string }>(
        "/me"
      ),
  },
  events: {
    list: () => request<unknown[]>("/events"),
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
    list: () => request<unknown[]>("/users"),
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
