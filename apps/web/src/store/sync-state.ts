import { create } from "zustand";
import type { PersistStorage } from "zustand/middleware";

export type SyncState = "online" | "syncing" | "offline" | "error";
export type NetworkMode = "auto" | "force-offline";

const NETWORK_MODE_KEY = "kolekta-network-mode";

// Offline credentials interface
export interface OfflineCredentials {
  email: string;
  passwordHash: string;
  userId: string;
  role: string;
  lastLogin: number;
  expiresAt: number; // 7 days from last login
}

function loadNetworkMode(): NetworkMode {
  if (typeof localStorage === "undefined") return "auto";
  return (localStorage.getItem(NETWORK_MODE_KEY) as NetworkMode) ?? "auto";
}

function computeEffective(state: SyncState, mode: NetworkMode): boolean {
  if (mode === "force-offline") return false;
  return state === "online" || state === "syncing";
}

interface SyncStateStore {
  state: SyncState;
  lastError: string | null;
  lastSyncAt: number | null;
  networkMode: NetworkMode;
  effectiveIsOnline: boolean;
  pendingTransactionCount: number;
  // Offline credentials for cashier
  offlineCredentials: OfflineCredentials | null;
  isForceOfflineLocked: boolean;
  setState: (s: SyncState, error?: string | null) => void;
  markSuccess: () => void;
  setNetworkMode: (mode: NetworkMode) => void;
  setPendingTransactionCount: (count: number) => void;
  // New functions for offline mode
  enableForceOffline: () => void;
  saveOfflineCredentials: (email: string, passwordHash: string, userId: string, role: string) => void;
  validateOfflineCredentials: (email: string, password: string) => Promise<boolean>;
  clearOfflineCredentials: () => void;
}

export const useSyncStateStore = create<SyncStateStore>((set, get) => {
  const initialMode = loadNetworkMode();
  const initialState: SyncState =
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online";
  
  // Load offline credentials from localStorage if exists
  let loadedCredentials: OfflineCredentials | null = null;
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("kolekta-offline-creds");
    if (stored) {
      try {
        loadedCredentials = JSON.parse(stored);
      } catch {
        loadedCredentials = null;
      }
    }
  }
  
  return {
    state: initialState,
    lastError: null,
    lastSyncAt: null,
    networkMode: initialMode,
    effectiveIsOnline: computeEffective(initialState, initialMode),
    pendingTransactionCount: 0,
    offlineCredentials: loadedCredentials,
    isForceOfflineLocked: initialMode === "force-offline",
    setState: (state, error = null) =>
      set((s) => ({
        state,
        lastError: error,
        effectiveIsOnline: computeEffective(state, s.networkMode),
      })),
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
    // New functions for offline mode
    enableForceOffline: () => {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(NETWORK_MODE_KEY, "force-offline");
      }
      set({
        networkMode: "force-offline",
        isForceOfflineLocked: true,
        effectiveIsOnline: false,
      });
    },
    saveOfflineCredentials: (email, passwordHash, userId, role) => {
      const credentials: OfflineCredentials = {
        email,
        passwordHash,
        userId,
        role,
        lastLogin: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
      };
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("kolekta-offline-creds", JSON.stringify(credentials));
      }
      set({ offlineCredentials: credentials });
    },
    validateOfflineCredentials: async (email, password) => {
      const creds = get().offlineCredentials;
      if (!creds) return false;
      if (creds.email !== email) return false;
      if (creds.expiresAt < Date.now()) return false;
      
      // Import bcryptjs dynamically to avoid issues
      try {
        const bcrypt = await import("bcryptjs");
        return bcrypt.compare(password, creds.passwordHash);
      } catch {
        return false;
      }
    },
    clearOfflineCredentials: () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("kolekta-offline-creds");
      }
      set({ offlineCredentials: null });
    },
  };
});

if (typeof window !== "undefined") {
  window.addEventListener("online", () =>
    useSyncStateStore.getState().setState("online")
  );
  window.addEventListener("offline", () =>
    useSyncStateStore.getState().setState("offline")
  );
}
