import React from "react";
import { useSyncStateStore } from "../store/sync-state.js";
import { OfflineBanner } from "./OfflineBanner.js";
import { OfflineBlockedState } from "./OfflineBlockedState.js";

export type OfflineMode = "safe" | "partial" | "blocked";

interface Props {
  children: React.ReactNode;
  offlineMode: OfflineMode;
}

export function OfflineModeGuard({ children, offlineMode }: Props) {
  // Use effectiveIsOnline from sync state (considers networkMode)
  // This allows cashier in force-offline mode to use app without needing internet
  const effectiveIsOnline = useSyncStateStore((s) => s.effectiveIsOnline);

  if (!effectiveIsOnline && offlineMode === "blocked") {
    return <OfflineBlockedState />;
  }

  if (!effectiveIsOnline && offlineMode === "partial") {
    return (
      <>
        <OfflineBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
