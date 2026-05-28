import { useState, useEffect, useCallback, useRef } from "react";
import { useAuthStore, useOfflineAuthStore } from "../store/auth.js";
import { useSyncStateStore } from "../store/sync-state.js";
import { idb } from "../lib/db.js";
import {
  getIndexedDBQuota,
  getLocalStorageSummary,
  getIndexedDBTableSizes,
} from "../lib/storage-monitor.js";
import { getLocalStorageSize } from "../lib/debug-utils.js";

export interface DebugInfo {
  authentication: {
    onlineUser: { id: string; email: string; displayName: string; role: string } | null;
    isOfflineSession: boolean;
    offlineExpiresAt: number | null;
    offlineSessionRemainingHours: number | null;
    pendingAuth: { email: string; timestamp: number; remainingMinutes: number } | null;
    offlineCredentials: Array<{
      email: string;
      role: string;
      cachedAt: number;
      hoursRemaining: number;
    }>;
  };
  network: {
    browserOnline: boolean;
    syncState: string;
    networkMode: string;
    effectiveOnline: boolean;
    serverHealth: { online: boolean; latency: number | null; timestamp: number; error?: string } | null;
    lastSyncAt: number | null;
    lastError: string | null;
  };
  storage: {
    localStorage: {
      totalSize: number;
      itemCount: number;
      items: Array<{ key: string; size: number }>;
    };
    indexedDB: {
      used: number;
      total: number;
      remaining: number;
      percentage: number;
    };
    tableSizes: Array<{ name: string; count: number; estimatedSize: number }>;
  };
  event: {
    availableEvents: number;
    activeEvent: { id: string; name: string; status: string } | null;
    lastEventSync: number | null;
  };
  card: {
    totalCards: number;
    byStatus: Record<string, number>;
    lockedCards: number;
  };
  transaction: {
    pendingCount: number;
    syncingCount: number;
    syncedCount: number;
    errorCount: number;
  };
  performance: {
    avgLoginTime: number;
    avgTransactionTime: number;
    lastQueryTime: number;
    lastApiTime: number;
  };
  system: {
    appVersion: string;
    browser: string;
    platform: string;
    memory: { used: number; total: number } | null;
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const maskedLocal = local.length > 2
    ? `${local.slice(0, 2)}***${local.slice(-1)}`
    : "***";
  return `${maskedLocal}@${domain}`;
}

export function useDebugInfo() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  const buildDebugInfo = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);

    try {
      const authStore = useAuthStore.getState();
      const offlineStore = useOfflineAuthStore.getState();
      const syncStore = useSyncStateStore.getState();

      const user = authStore.user;
      const isOfflineSession = offlineStore.isOfflineSession;
      const offlineExpiresAt = offlineStore.offlineExpiresAt;
      const remainingHours = offlineStore.getOfflineSessionRemainingHours();
      const pendingAuth = offlineStore.getPendingAuth();

      const now = Date.now();
      const offlineCredentials = offlineStore.offlineCredentials.map((c) => ({
        email: maskEmail(c.email),
        role: c.role,
        cachedAt: c.cachedAt,
        hoursRemaining: Math.ceil((c.cachedAt + 7 * 24 * 60 * 60 * 1000 - now) / (60 * 60 * 1000)),
      }));

      const [idbQuota, localStorageSummary, tableSizes] = await Promise.all([
        getIndexedDBQuota(),
        Promise.resolve(getLocalStorageSummary()),
        getIndexedDBTableSizes(),
      ]);

      const events = await idb.events.toArray();
      const activeEvent = events.find((e) => e.status === "active") ?? null;
      const lastEventSync = localStorage.getItem("kolekta-sync-cursor")
        ? parseInt(localStorage.getItem("kolekta-sync-cursor") ?? "0", 10)
        : null;

      const cards = await idb.cards.toArray();
      const byStatus: Record<string, number> = {};
      let lockedCards = 0;
      for (const card of cards) {
        byStatus[card.status] = (byStatus[card.status] ?? 0) + 1;
        if (card.lockedByCartId) lockedCards++;
      }

      const pendingTxs = await idb.pendingTransactions.toArray();
      const pendingCount = pendingTxs.filter((t) => t.syncStatus === "pending").length;
      const syncingCount = pendingTxs.filter((t) => t.syncStatus === "syncing").length;
      const syncedCount = pendingTxs.filter((t) => t.syncStatus === "synced").length;
      const errorCount = pendingTxs.filter((t) => t.syncStatus === "error").length;

      // Performance metrics from localStorage
      const loginTimes: number[] = JSON.parse(localStorage.getItem("kolekta-perf-login") ?? "[]");
      const transactionTimes: number[] = JSON.parse(localStorage.getItem("kolekta-perf-transaction") ?? "[]");
      const avgLoginTime = loginTimes.length > 0
        ? loginTimes.reduce((a, b) => a + b, 0) / loginTimes.length
        : 0;
      const avgTransactionTime = transactionTimes.length > 0
        ? transactionTimes.reduce((a, b) => a + b, 0) / transactionTimes.length
        : 0;
      const lastQueryTime = parseInt(localStorage.getItem("kolekta-perf-last-query") ?? "0", 10) || 0;
      const lastApiTime = parseInt(localStorage.getItem("kolekta-perf-last-api") ?? "0", 10) || 0;

      // Memory info
      let memory: { used: number; total: number } | null = null;
      try {
        // @ts-ignore
        if (performance?.memory) {
          // @ts-ignore
          const m = performance.memory;
          memory = {
            used: m.usedJSHeapSize ?? 0,
            total: m.totalJSHeapSize ?? 0,
          };
        }
      } catch {
        // Ignore
      }

      const info: DebugInfo = {
        authentication: {
          onlineUser: user ? { id: user.id, email: maskEmail(user.email), displayName: user.displayName, role: user.role } : null,
          isOfflineSession,
          offlineExpiresAt,
          offlineSessionRemainingHours: remainingHours,
          pendingAuth: pendingAuth
            ? {
                email: maskEmail(pendingAuth.email),
                timestamp: pendingAuth.timestamp,
                remainingMinutes: Math.max(0, Math.ceil((pendingAuth.timestamp + 30 * 60 * 1000 - now) / 60000)),
              }
            : null,
          offlineCredentials,
        },
        network: {
          browserOnline: navigator.onLine,
          syncState: syncStore.state,
          networkMode: syncStore.networkMode,
          effectiveOnline: syncStore.effectiveIsOnline,
          serverHealth: syncStore.serverHealth,
          lastSyncAt: syncStore.lastSyncAt,
          lastError: syncStore.lastError,
        },
        storage: {
          localStorage: {
            totalSize: localStorageSummary.totalSize,
            itemCount: localStorageSummary.itemCount,
            items: localStorageSummary.items,
          },
          indexedDB: idbQuota,
          tableSizes,
        },
        event: {
          availableEvents: events.length,
          activeEvent: activeEvent
            ? { id: activeEvent.id, name: activeEvent.name, status: activeEvent.status }
            : null,
          lastEventSync,
        },
        card: {
          totalCards: cards.length,
          byStatus,
          lockedCards,
        },
        transaction: {
          pendingCount,
          syncingCount,
          syncedCount,
          errorCount,
        },
        performance: {
          avgLoginTime,
          avgTransactionTime,
          lastQueryTime,
          lastApiTime,
        },
        system: {
          appVersion: "0.1.0", // Should match package.json
          browser: navigator.userAgent,
          platform: navigator.platform,
          memory,
        },
      };

      if (mountedRef.current) {
        setDebugInfo(info);
      }
    } catch (err) {
      console.error("[debug-info] build error", err);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    buildDebugInfo();
    // Auto-refresh every 30 seconds
    const interval = setInterval(buildDebugInfo, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [buildDebugInfo]);

  return { debugInfo, isLoading, refresh: buildDebugInfo };
}
