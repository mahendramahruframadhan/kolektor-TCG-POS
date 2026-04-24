import { create } from "zustand";

export type SyncState = "online" | "syncing" | "offline" | "error";

interface SyncStateStore {
  state: SyncState;
  lastError: string | null;
  lastSyncAt: number | null;
  setState: (s: SyncState, error?: string | null) => void;
  markSuccess: () => void;
}

/**
 * Single source of truth for the network sync indicator shown in MobileAppBar.
 * `background-sync.ts` writes to it; SyncDot reads from it.
 */
export const useSyncStateStore = create<SyncStateStore>((set) => ({
  state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "online",
  lastError: null,
  lastSyncAt: null,
  setState: (state, error = null) => set({ state, lastError: error }),
  markSuccess: () =>
    set({ state: "online", lastError: null, lastSyncAt: Date.now() }),
}));

// Wire OS-level connectivity events so offline transitions are immediate.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    useSyncStateStore.getState().setState("online");
  });
  window.addEventListener("offline", () => {
    useSyncStateStore.getState().setState("offline");
  });
}
