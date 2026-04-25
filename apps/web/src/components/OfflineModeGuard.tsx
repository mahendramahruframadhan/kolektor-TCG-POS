import React from "react";
import { useIsOnline } from "../hooks/use-is-online.js";
import { OfflineBanner } from "./OfflineBanner.js";
import { OfflineBlockedState } from "./OfflineBlockedState.js";

export type OfflineMode = "safe" | "partial" | "blocked";

interface Props {
  children: React.ReactNode;
  offlineMode: OfflineMode;
}

export function OfflineModeGuard({ children, offlineMode }: Props) {
  const isOnline = useIsOnline();

  if (!isOnline && offlineMode === "blocked") {
    return <OfflineBlockedState />;
  }

  if (!isOnline && offlineMode === "partial") {
    return (
      <>
        <OfflineBanner />
        {children}
      </>
    );
  }

  return <>{children}</>;
}
