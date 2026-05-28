import React from "react";
import { WifiOff } from "lucide-react";
import { useSyncStateStore } from "../store/sync-state.js";

export function OfflineBanner() {
  const pendingCount = useSyncStateStore((s) => s.pendingTransactionCount);

  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-3 bg-warning/10 border-b border-warning/30 text-warning text-sm font-medium"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        Mode offline — data akan disinkronkan saat koneksi tersedia
      </span>
      {pendingCount > 0 && (
        <span className="bg-warning text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {pendingCount} pending
        </span>
      )}
    </div>
  );
}
