import { create } from "zustand";
import { api } from "../lib/api.js";

export type SyncState = "online" | "syncing" | "offline" | "error";
export type NetworkMode = "auto" | "force-offline";
export type ToastType = "success" | "error" | "info" | "warning";

export interface ServerHealth {
  online: boolean;
  latency: number | null;
  timestamp: number;
  error?: string;
}

const NETWORK_MODE_KEY = "kolekta-network-mode";

function loadNetworkMode(): NetworkMode {
  if (typeof localStorage === "undefined") return "auto";
  return (localStorage.getItem(NETWORK_MODE_KEY) as NetworkMode) ?? "auto";
}

function computeEffective(state: SyncState, mode: NetworkMode): boolean {
  if (mode === "force-offline") return false;
  return state === "online" || state === "syncing";
}

interface ToastMessage {
  id: string;
  text: string;
  type: ToastType;
}

interface SyncStateStore {
  state: SyncState;
  lastError: string | null;
  lastSyncAt: number | null;
  networkMode: NetworkMode;
  effectiveIsOnline: boolean;
  pendingTransactionCount: number;
  toasts: ToastMessage[];
  serverHealth: ServerHealth | null;
  lastHealthCheckAt: number | null;
  setState: (s: SyncState, error?: string | null) => void;
  markSuccess: () => void;
  setNetworkMode: (mode: NetworkMode) => void;
  setPendingTransactionCount: (count: number) => void;
  addToast: (text: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
  triggerSilentReconnect: () => Promise<boolean>;
  updateServerHealth: (health: ServerHealth) => void;
  triggerHealthCheck: () => Promise<void>;
}

let reconnectAttempted = false;

export const useSyncStateStore = create<SyncStateStore>((set, get) => {
  const initialMode = loadNetworkMode();
  const initialState: SyncState =
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online";
  return {
    state: initialState,
    lastError: null,
    lastSyncAt: null,
    networkMode: initialMode,
    effectiveIsOnline: computeEffective(initialState, initialMode),
    pendingTransactionCount: 0,
    toasts: [],
    serverHealth: null,
    lastHealthCheckAt: null,

    setState: (state, error = null) =>
      set((s) => {
        const newEffective = computeEffective(state, s.networkMode);
        const prevEffective = computeEffective(s.state, s.networkMode);

        if (newEffective && !prevEffective && state === "online") {
          get().triggerSilentReconnect();
        }

        return {
          state,
          lastError: error,
          effectiveIsOnline: newEffective,
        };
      }),

    markSuccess: () =>
      set((s) => ({
        state: "online",
        lastError: null,
        lastSyncAt: Date.now(),
        effectiveIsOnline: computeEffective("online", s.networkMode),
      })),

    setNetworkMode: (networkMode) => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(NETWORK_MODE_KEY, networkMode);
      }
      set((s) => ({
        networkMode,
        effectiveIsOnline: computeEffective(s.state, networkMode),
      }));
    },

    setPendingTransactionCount: (pendingTransactionCount) =>
      set({ pendingTransactionCount }),

    addToast: (text, type = "info") => {
      const id = Date.now().toString();
      set((s) => ({ toasts: [...s.toasts, { id, text, type }] }));
      setTimeout(() => get().removeToast(id), 5000);
    },

    removeToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    triggerSilentReconnect: async () => {
      if (reconnectAttempted) return false;
      reconnectAttempted = true;

      const { useOfflineAuthStore } = await import("./auth.js");
      const { useAuthStore } = await import("./auth.js");

      const offlineStore = useOfflineAuthStore.getState();
      const authStore = useAuthStore.getState();

      if (!offlineStore.isOfflineSession) return false;

      const pendingAuth = offlineStore.getPendingAuth();
      if (!pendingAuth) return false;

      try {
        const response = await api.auth.login(pendingAuth.email, pendingAuth.password);
        offlineStore.clearPendingAuth();
        offlineStore.clearOfflineSession();
        authStore.setUser({
          id: response.id,
          email: response.email,
          displayName: response.displayName,
          role: response.role,
        });
        get().addToast("Koneksi restored — data syncing...", "success");
        setTimeout(() => reconnectAttempted = false, 60000);
        return true;
      } catch {
        reconnectAttempted = false;
        return false;
      }
    },

    updateServerHealth: (serverHealth) =>
      set({ serverHealth, lastHealthCheckAt: Date.now() }),

    triggerHealthCheck: async () => {
      try {
        const start = performance.now();
        const response = await fetch("/api/health", {
          method: "HEAD",
          cache: "no-cache",
        });
        const latency = Math.round(performance.now() - start);
        if (response.ok) {
          get().updateServerHealth({
            online: true,
            latency,
            timestamp: Date.now(),
          });
        } else {
          get().updateServerHealth({
            online: false,
            latency: null,
            timestamp: Date.now(),
            error: `HTTP ${response.status}`,
          });
        }
      } catch (err) {
        get().updateServerHealth({
          online: false,
          latency: null,
          timestamp: Date.now(),
          error: err instanceof Error ? err.message : "Network error",
        });
      }
    },
  };
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const store = useSyncStateStore.getState();
    if (store.networkMode === "force-offline") return;
    store.triggerHealthCheck();
  });
  window.addEventListener("offline", () => {
    reconnectAttempted = false;
    useSyncStateStore.getState().setState("offline");
  });

  // Periodic health check every 10 seconds (PRD §5.6)
  setInterval(() => {
    const store = useSyncStateStore.getState();
    if (store.networkMode === "force-offline") return;
    store.triggerHealthCheck();
  }, 10000);
}
