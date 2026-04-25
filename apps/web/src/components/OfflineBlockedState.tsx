import React from "react";
import { WifiOff } from "lucide-react";

export function OfflineBlockedState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-64 gap-4 p-8 text-center">
      <WifiOff className="w-12 h-12 text-muted-fg" aria-hidden="true" />
      <h2 className="text-lg font-bold text-fg">Perlu Koneksi Internet</h2>
      <p className="text-sm text-muted-fg max-w-xs">
        Halaman ini tidak tersedia saat offline.
      </p>
    </div>
  );
}
