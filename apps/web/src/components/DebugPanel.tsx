import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  RefreshCw,
  Download,
  Copy,
  Wifi,
  WifiOff,
  HardDrive,
  Database,
  CreditCard,
  ShoppingCart,
  Activity,
  Monitor,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { useDebugInfo } from "../hooks/useDebugInfo.js";
import {
  formatBytes,
  timeAgo,
  maskEmail,
  qualityLabel,
  qualityColor,
} from "../lib/debug-utils.js";
import {
  runAutomatedCleanup,
  getStorageHealth,
} from "../lib/storage-monitor.js";
import { flushPendingTransactions } from "../lib/background-sync.js";

type SectionKey =
  | "auth"
  | "network"
  | "storage"
  | "event"
  | "card"
  | "transaction"
  | "performance"
  | "system";

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "auth", label: "Authentication", icon: <Monitor className="w-4 h-4" /> },
  { key: "network", label: "Network", icon: <Wifi className="w-4 h-4" /> },
  { key: "storage", label: "Storage", icon: <HardDrive className="w-4 h-4" /> },
  { key: "event", label: "Event", icon: <Database className="w-4 h-4" /> },
  { key: "card", label: "Card", icon: <CreditCard className="w-4 h-4" /> },
  { key: "transaction", label: "Transaction", icon: <ShoppingCart className="w-4 h-4" /> },
  { key: "performance", label: "Performance", icon: <Activity className="w-4 h-4" /> },
  { key: "system", label: "System", icon: <Monitor className="w-4 h-4" /> },
];

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

function SectionHeader({
  label,
  icon,
  isOpen,
  onToggle,
}: {
  label: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 px-3 hover:bg-slate-50 rounded-lg transition"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {label}
      </div>
      {isOpen ? (
        <ChevronUp className="w-4 h-4 text-slate-400" />
      ) : (
        <ChevronDown className="w-4 h-4 text-slate-400" />
      )}
    </button>
  );
}

function DebugPanelContent({ onClose }: { onClose: () => void }) {
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    auth: true,
    network: true,
    storage: true,
    event: false,
    card: false,
    transaction: false,
    performance: false,
    system: false,
  });
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const { debugInfo, isLoading, refresh } = useDebugInfo();

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExport = useCallback(() => {
    if (!debugInfo) return;
    const dataStr = JSON.stringify(debugInfo, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kolekta-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [debugInfo]);

  const handleCopy = useCallback(async () => {
    if (!debugInfo) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(debugInfo, null, 2));
      setCleanupResult("Debug info disalin ke clipboard");
      setTimeout(() => setCleanupResult(null), 3000);
    } catch {
      setCleanupResult("Gagal menyalin ke clipboard");
    }
  }, [debugInfo]);

  const handleCleanup = useCallback(async () => {
    setCleanupResult("Membersihkan...");
    try {
      const result = await runAutomatedCleanup();
      const total = result.oldPendingTx + result.failedTx + result.abandonedCarts + result.oldEvents;
      setCleanupResult(`Cleanup selesai: ${total} item dihapus`);
      refresh();
    } catch {
      setCleanupResult("Cleanup gagal");
    }
    setTimeout(() => setCleanupResult(null), 5000);
  }, [refresh]);

  const handleForceSync = useCallback(async () => {
    setCleanupResult("Sinkronisasi...");
    try {
      await flushPendingTransactions();
      setCleanupResult("Sinkronisasi selesai");
      refresh();
    } catch {
      setCleanupResult("Sinkronisasi gagal");
    }
    setTimeout(() => setCleanupResult(null), 5000);
  }, [refresh]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-center sm:justify-center bg-black/30">
      <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800">Debug Panel</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleExport}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
              title="Export JSON"
            >
              <Download className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4 text-slate-500" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 overflow-x-auto">
          <button
            onClick={handleForceSync}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition"
          >
            <RefreshCw className="w-3 h-3" />
            Force Sync
          </button>
          <button
            onClick={handleCleanup}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 transition"
          >
            <Trash2 className="w-3 h-3" />
            Cleanup
          </button>
          {cleanupResult && (
            <span className="text-xs text-slate-600 whitespace-nowrap">{cleanupResult}</span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {SECTIONS.map(({ key, label, icon }) => {
            const isOpen = openSections[key];
            return (
              <div key={key} className="border border-slate-100 rounded-lg">
                <SectionHeader label={label} icon={icon} isOpen={isOpen} onToggle={() => toggleSection(key)} />
                {isOpen && debugInfo && (
                  <div className="px-3 pb-3 text-xs space-y-1.5">
                    {key === "auth" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Online User</span>
                          <span className="font-medium">
                            {debugInfo.authentication.onlineUser?.email ?? "None"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Offline Session</span>
                          <StatusBadge status={debugInfo.authentication.isOfflineSession ? "warn" : "ok"}>
                            {debugInfo.authentication.isOfflineSession ? "Yes" : "No"}
                          </StatusBadge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Remaining Hours</span>
                          <span className="font-medium">
                            {debugInfo.authentication.offlineSessionRemainingHours ?? "N/A"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Credentials</span>
                          <span className="font-medium">{debugInfo.authentication.offlineCredentials.length}</span>
                        </div>
                        {debugInfo.authentication.offlineCredentials.map((c) => (
                          <div key={c.email} className="pl-2 border-l-2 border-slate-200 text-slate-600">
                            {c.email} ({c.role}) — {c.hoursRemaining}h remaining
                          </div>
                        ))}
                      </>
                    )}

                    {key === "network" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Browser Online</span>
                          <StatusBadge status={debugInfo.network.browserOnline ? "ok" : "error"}>
                            {debugInfo.network.browserOnline ? "Yes" : "No"}
                          </StatusBadge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Effective Online</span>
                          <StatusBadge status={debugInfo.network.effectiveOnline ? "ok" : "error"}>
                            {debugInfo.network.effectiveOnline ? "Yes" : "No"}
                          </StatusBadge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Sync State</span>
                          <span className="font-medium capitalize">{debugInfo.network.syncState}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Network Mode</span>
                          <span className="font-medium capitalize">{debugInfo.network.networkMode}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last Sync</span>
                          <span className="font-medium">
                            {debugInfo.network.lastSyncAt ? timeAgo(debugInfo.network.lastSyncAt) : "Never"}
                          </span>
                        </div>
                        {debugInfo.network.serverHealth && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Server Status</span>
                              <StatusBadge status={debugInfo.network.serverHealth.online ? "ok" : "error"}>
                                {debugInfo.network.serverHealth.online ? "Online" : "Offline"}
                              </StatusBadge>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500">Latency</span>
                              <span className="font-medium">
                                {debugInfo.network.serverHealth.latency !== null
                                  ? `${debugInfo.network.serverHealth.latency}ms`
                                  : "N/A"}
                              </span>
                            </div>
                            {debugInfo.network.serverHealth.error && (
                              <div className="text-red-600">{debugInfo.network.serverHealth.error}</div>
                            )}
                          </>
                        )}
                        {debugInfo.network.lastError && (
                          <div className="text-red-600">Error: {debugInfo.network.lastError}</div>
                        )}
                      </>
                    )}

                    {key === "storage" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">localStorage</span>
                          <span className="font-medium">
                            {formatBytes(debugInfo.storage.localStorage.totalSize)} ({debugInfo.storage.localStorage.itemCount} items)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">IndexedDB</span>
                          <span className="font-medium">
                            {formatBytes(debugInfo.storage.indexedDB.used)} / {formatBytes(debugInfo.storage.indexedDB.total)} ({debugInfo.storage.indexedDB.percentage}%)
                          </span>
                        </div>
                        {debugInfo.storage.tableSizes.map((t) => (
                          <div key={t.name} className="flex justify-between pl-2 border-l-2 border-slate-200">
                            <span className="text-slate-600">{t.name}</span>
                            <span className="text-slate-700">{t.count} rows (~{formatBytes(t.estimatedSize)})</span>
                          </div>
                        ))}
                      </>
                    )}

                    {key === "event" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Available Events</span>
                          <span className="font-medium">{debugInfo.event.availableEvents}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Active Event</span>
                          <span className="font-medium">
                            {debugInfo.event.activeEvent?.name ?? "None"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last Sync Cursor</span>
                          <span className="font-medium">{debugInfo.event.lastEventSync ?? "N/A"}</span>
                        </div>
                      </>
                    )}

                    {key === "card" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total Cards</span>
                          <span className="font-medium">{debugInfo.card.totalCards}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Locked Cards</span>
                          <span className="font-medium">{debugInfo.card.lockedCards}</span>
                        </div>
                        {Object.entries(debugInfo.card.byStatus).map(([status, count]) => (
                          <div key={status} className="flex justify-between pl-2 border-l-2 border-slate-200">
                            <span className="text-slate-600 capitalize">{status}</span>
                            <span className="text-slate-700">{count}</span>
                          </div>
                        ))}
                      </>
                    )}

                    {key === "transaction" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Pending</span>
                          <span className="font-medium text-yellow-600">{debugInfo.transaction.pendingCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Syncing</span>
                          <span className="font-medium text-blue-600">{debugInfo.transaction.syncingCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Synced</span>
                          <span className="font-medium text-green-600">{debugInfo.transaction.syncedCount}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Error</span>
                          <span className="font-medium text-red-600">{debugInfo.transaction.errorCount}</span>
                        </div>
                      </>
                    )}

                    {key === "performance" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Avg Login Time</span>
                          <span className="font-medium">{debugInfo.performance.avgLoginTime.toFixed(0)}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Avg Transaction Time</span>
                          <span className="font-medium">{debugInfo.performance.avgTransactionTime.toFixed(0)}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last Query Time</span>
                          <span className="font-medium">{debugInfo.performance.lastQueryTime}ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Last API Time</span>
                          <span className="font-medium">{debugInfo.performance.lastApiTime}ms</span>
                        </div>
                      </>
                    )}

                    {key === "system" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">App Version</span>
                          <span className="font-medium">{debugInfo.system.appVersion}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Platform</span>
                          <span className="font-medium">{debugInfo.system.platform}</span>
                        </div>
                        {debugInfo.system.memory && (
                          <div className="flex justify-between">
                            <span className="text-slate-500">Memory</span>
                            <span className="font-medium">
                              {formatBytes(debugInfo.system.memory.used)} / {formatBytes(debugInfo.system.memory.total)}
                            </span>
                          </div>
                        )}
                        <div className="text-slate-500 break-all">{debugInfo.system.browser}</div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 text-center">
          Press Ctrl+Shift+D to toggle
        </div>
      </div>
    </div>
  );
}

export function DebugPanel() {
  const [open, setOpen] = useState(false);

  // Hotkey: Ctrl+Shift+D
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!open) return null;
  return <DebugPanelContent onClose={() => setOpen(false)} />;
}
