import { create } from "zustand";

export type SyncState = "online" | "syncing" | "offline" | "error";
export type NetworkMode = "auto" | "force-offline";

const NETWORK_MODE_KEY = "kolekta-network-mode";

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
  setState: (s: SyncState, error?: string | null) => void;
  markSuccess: () => void;
  setNetworkMode: (mode: NetworkMode) => void;
  setPendingTransactionCount: (count: number) => void;
}

export const useSyncStateStore = create<SyncStateStore>((set) => {
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
      localStorage.setItem(NETWORK_MODE_KEY, networkMode);
      set((s) => ({
        networkMode,
        effectiveIsOnline: computeEffective(s.state, networkMode),
      }));
    },
    setPendingTransactionCount: (pendingTransactionCount) =>
      set({ pendingTransactionCount }),
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
