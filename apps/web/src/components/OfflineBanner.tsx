import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 px-4 py-3 bg-warning/10 border-b border-warning/30 text-warning text-sm font-medium"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Anda offline. Perubahan tidak dapat disimpan.</span>
    </div>
  );
}
