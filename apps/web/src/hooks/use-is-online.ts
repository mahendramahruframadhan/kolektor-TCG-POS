import { useSyncStateStore } from "../store/sync-state.js";

export function useIsOnline(): boolean {
  return useSyncStateStore((s) => s.effectiveIsOnline);
}
