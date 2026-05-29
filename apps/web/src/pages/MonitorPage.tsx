import React, { useState, useCallback } from "react";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { useDebugInfo } from "../hooks/useDebugInfo.js";
import { formatBytes, timeAgo } from "../lib/debug-utils.js";
import { flushPendingTransactions } from "../lib/background-sync.js";
import { RefreshCw, Wifi, WifiOff, HardDrive, ShoppingCart, Activity, Monitor } from "lucide-react";

function StatusBadge({ status, children }: { status: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const cls =
    status === "ok"
      ? "bg-green-100 text-green-700"
      : status === "warn"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-red-100 text-red-700";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function MonitorPage() {
  const { debugInfo, isLoading, refresh } = useDebugInfo();
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const handleSync = useCallback(async () => {
    setSyncResult("Sinkronisasi...");
    try {
      await flushPendingTransactions();
      setSyncResult("Sinkronisasi selesai");
      refresh();
    } catch {
      setSyncResult("Sinkronisasi gagal");
    }
    setTimeout(() => setSyncResult(null), 5000);
  }, [refresh]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    transaction: true,
    network: true,
    storage: true,
    auth: true,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar title="Monitor" back />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-fg mb-2">
              <ShoppingCart className="w-4 h-4" />
              <span className="text-xs font-bold uppercase">Pending</span>
            </div>
            <p className="text-2xl font-extrabold text-yellow-600">{debugInfo?.transaction.pendingCount ?? 0}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 text-muted-fg mb-2">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-bold uppercase">Synced</span>
            </div>
            <p className="text-2xl font-extrabold text-green-600">{debugInfo?.transaction.syncedCount ?? 0}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {debugInfo?.network.effectiveOnline ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            <span className="font-bold text-fg">
              {debugInfo?.network.effectiveOnline ? "Online" : "Offline"}
            </span>
          </div>
          <button
            onClick={refresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-muted transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-muted-fg ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {syncResult && (
          <div className="bg-primary/10 text-primary text-xs font-medium px-3 py-2 rounded-lg">
            {syncResult}
          </div>
        )}

        <button
          onClick={handleSync}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-fg rounded-xl font-bold hover:opacity-90 transition"
        >
          <RefreshCw className="w-4 h-4" />
          Sinkronkan Data Sekarang
        </button>

        <div className="space-y-3">
          <button
            onClick={() => toggleSection("transaction")}
            className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted rounded-lg transition"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-fg">
              <ShoppingCart className="w-4 h-4" />
              Transaksi
            </div>
            <span className="text-xs text-muted-fg">
              {openSections.transaction ? "▼" : "▶"}
            </span>
          </button>

          {openSections.transaction && debugInfo && (
            <div className="bg-card rounded-xl border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Pending</span>
                <span className="font-bold text-yellow-600">{debugInfo.transaction.pendingCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Menyinkronkan</span>
                <span className="font-bold text-blue-600">{debugInfo.transaction.syncingCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Tersinkron</span>
                <span className="font-bold text-green-600">{debugInfo.transaction.syncedCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Error</span>
                <span className="font-bold text-red-600">{debugInfo.transaction.errorCount}</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => toggleSection("network")}
            className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted rounded-lg transition"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-fg">
              <Wifi className="w-4 h-4" />
              Jaringan
            </div>
            <span className="text-xs text-muted-fg">
              {openSections.network ? "▼" : "▶"}
            </span>
          </button>

          {openSections.network && debugInfo && (
            <div className="bg-card rounded-xl border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Browser Online</span>
                <StatusBadge status={debugInfo.network.browserOnline ? "ok" : "error"}>
                  {debugInfo.network.browserOnline ? "Ya" : "Tidak"}
                </StatusBadge>
              </div>
              <div className="flex justify-between">
                <span>Mode</span>
                <span className="font-medium capitalize">{debugInfo.network.networkMode}</span>
              </div>
              <div className="flex justify-between">
                <span>Terakhir Sync</span>
                <span>{debugInfo.network.lastSyncAt ? timeAgo(debugInfo.network.lastSyncAt) : "Belum pernah"}</span>
              </div>
              {debugInfo.network.serverHealth && (
                <>
                  <div className="flex justify-between">
                    <span>Server</span>
                    <StatusBadge status={debugInfo.network.serverHealth.online ? "ok" : "error"}>
                      {debugInfo.network.serverHealth.online ? "Online" : "Offline"}
                    </StatusBadge>
                  </div>
                  {debugInfo.network.serverHealth.latency !== null && (
                    <div className="flex justify-between">
                      <span>Latency</span>
                      <span>{debugInfo.network.serverHealth.latency}ms</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => toggleSection("storage")}
            className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted rounded-lg transition"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-fg">
              <HardDrive className="w-4 h-4" />
              Storage
            </div>
            <span className="text-xs text-muted-fg">
              {openSections.storage ? "▼" : "▶"}
            </span>
          </button>

          {openSections.storage && debugInfo && (
            <div className="bg-card rounded-xl border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>localStorage</span>
                <span>{formatBytes(debugInfo.storage.localStorage.totalSize)}</span>
              </div>
              <div className="flex justify-between">
                <span>IndexedDB</span>
                <span>{formatBytes(debugInfo.storage.indexedDB.used)} / {formatBytes(debugInfo.storage.indexedDB.total)}</span>
              </div>
              {debugInfo.storage.tableSizes.map((t) => (
                <div key={t.name} className="flex justify-between pl-2 border-l-2 border-border">
                  <span className="text-muted-fg">{t.name}</span>
                  <span>{t.count} rows</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            onClick={() => toggleSection("auth")}
            className="w-full flex items-center justify-between py-2 px-3 hover:bg-muted rounded-lg transition"
          >
<div className="flex items-center gap-2 text-sm font-bold text-fg">
               <Monitor className="w-4 h-4" />
               Auth
             </div>
            <span className="text-xs text-muted-fg">
              {openSections.auth ? "▼" : "▶"}
            </span>
          </button>

          {openSections.auth && debugInfo && (
            <div className="bg-card rounded-xl border border-border p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>User Online</span>
                <span>{debugInfo.authentication.onlineUser?.email ?? "None"}</span>
              </div>
              <div className="flex justify-between">
                <span>Offline Session</span>
                <StatusBadge status={debugInfo.authentication.isOfflineSession ? "warn" : "ok"}>
                  {debugInfo.authentication.isOfflineSession ? "Ya" : "Tidak"}
                </StatusBadge>
              </div>
              <div className="flex justify-between">
                <span>Sisa Jam</span>
                <span>{debugInfo.authentication.offlineSessionRemainingHours ?? "N/A"}</span>
              </div>
              <div className="pt-2 border-t border-border">
                <p className="text-xs text-muted-fg mb-1">Credentials Cached:</p>
                {debugInfo.authentication.offlineCredentials.map((c) => (
                  <div key={c.email} className="text-xs pl-2 border-l-2 border-border">
                    {c.email} ({c.role})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}