import React, { useState } from "react";
import { RefreshCw, Download, Check, AlertCircle, Upload } from "lucide-react";
import { useSyncStateStore } from "../store/sync-state.js";
import { useAuthStore } from "../store/auth.js";
import { opportunisticSync } from "../lib/background-sync.js";

export function ManualSyncButton() {
  const user = useAuthStore((s) => s.user);
  const isForceOfflineLocked = useSyncStateStore((s) => s.isForceOfflineLocked);
  const pendingCount = useSyncStateStore((s) => s.pendingTransactionCount);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  
  // Show button ONLY for cashier (not admin)
  if (user?.role !== "cashier") return null;
  
  const isBrowserOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  
  if (!isBrowserOnline) {
    // Show disabled button with "Offline" text when no internet
    return (
      <button
        disabled
        className="flex items-center gap-2 px-3 py-2 bg-muted text-muted-fg rounded-lg text-sm font-medium opacity-50 cursor-not-allowed"
        aria-label="Tidak ada koneksi internet"
      >
        <AlertCircle className="w-4 h-4" />
        Offline
      </button>
    );
  }
  
  if (!isBrowserOnline || !isForceOfflineLocked) return null;

  const handleSync = async () => {
    // Check again before sync - in case internet lost during wait
    if (!navigator.onLine) {
      alert("Tidak ada koneksi internet. Sambungan internet diperlukan untuk sinkronisasi.");
      return;
    }
    
    setSyncing(true);
    setResult(null);
    try {
      // Push pending transactions + Pull latest data from server
      await opportunisticSync();
      setResult("success");
    } catch {
      setResult("error");
    } finally {
      setSyncing(false);
      // Clear result after 3 seconds
      setTimeout(() => setResult(null), 3000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition ${
          result === "success" 
            ? "bg-green-600 text-white"
            : result === "error"
            ? "bg-red-600 text-white"
            : "bg-primary text-primary-fg hover:opacity-90"
        } disabled:opacity-50`}
        aria-label="Sinkronisasi manual (push + pull)"
      >
        {result === "success" ? (
          <Check className="w-4 h-4" />
        ) : result === "error" ? (
          <AlertCircle className="w-4 h-4" />
        ) : syncing ? (
          <RefreshCw className="w-4 h-4 animate-spin" />
        ) : pendingCount > 0 ? (
          <Upload className="w-4 h-4" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {syncing 
          ? "Menyinkron..." 
          : result === "success" 
          ? "Berhasil!" 
          : result === "error" 
          ? "Gagal" 
          : pendingCount > 0 
          ? `Sync (${pendingCount})` 
          : "Sync Data"}
      </button>
    </div>
  );
}