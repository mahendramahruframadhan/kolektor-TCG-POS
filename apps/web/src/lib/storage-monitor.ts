import { idb } from "./db.js";

export interface StorageQuota {
  used: number;
  total: number;
  remaining: number;
  percentage: number;
}

export interface LocalStorageSummary {
  totalSize: number;
  itemCount: number;
  items: Array<{
    key: string;
    size: number;
    lastUpdated?: number;
  }>;
}

export interface TableSize {
  name: string;
  count: number;
  estimatedSize: number;
}

export interface StorageHealth {
  indexedDB: StorageQuota;
  localStorage: LocalStorageSummary;
  tableSizes: TableSize[];
  isHealthy: boolean;
  warnings: string[];
  errors: string[];
}

export type CanCreateResult =
  | { canCreate: true; warning?: string }
  | { canCreate: false; reason: string; action: string };

/**
 * Get IndexedDB quota estimate using navigator.storage API.
 */
export async function getIndexedDBQuota(): Promise<StorageQuota> {
  try {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage ?? 0;
      const total = estimate.quota ?? 0;
      const remaining = total > 0 ? total - used : 0;
      const percentage = total > 0 ? Math.round((used / total) * 100) : 0;
      return { used, total, remaining, percentage };
    }
  } catch {
    // Ignore
  }
  return { used: 0, total: 0, remaining: 0, percentage: 0 };
}

/**
 * Get localStorage summary.
 */
export function getLocalStorageSummary(): LocalStorageSummary {
  const items: Array<{ key: string; size: number; lastUpdated?: number }> = [];
  let totalSize = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      const size = value.length * 2; // UTF-16 approximation
      totalSize += size;
      items.push({ key, size });
    }
  } catch {
    // localStorage may be inaccessible
  }
  return { totalSize, itemCount: items.length, items };
}

/**
 * Get table sizes from IndexedDB.
 */
export async function getIndexedDBTableSizes(): Promise<TableSize[]> {
  const tables: TableSize[] = [];
  try {
    const tableNames = [
      "users",
      "events",
      "paymentChannels",
      "settings",
      "cards",
      "carts",
      "cartItems",
      "transactions",
      "transactionItems",
      "pendingPhotos",
      "pendingTransactions",
      "cashReconciliations",
    ];
    for (const name of tableNames) {
      // @ts-ignore dynamic access
      const table = idb[name];
      if (!table) continue;
      const count = await table.count();
      // Rough estimate: 500 bytes per row average
      const estimatedSize = count * 500;
      tables.push({ name, count, estimatedSize });
    }
  } catch {
    // Ignore
  }
  return tables;
}

/**
 * Comprehensive storage health check.
 */
export async function getStorageHealth(): Promise<StorageHealth> {
  const [indexedDB, localStorage, tableSizes] = await Promise.all([
    getIndexedDBQuota(),
    Promise.resolve(getLocalStorageSummary()),
    getIndexedDBTableSizes(),
  ]);

  const warnings: string[] = [];
  const errors: string[] = [];

  if (indexedDB.percentage >= 95) {
    errors.push(`Storage penuh: ${indexedDB.percentage}% digunakan`);
  } else if (indexedDB.percentage >= 90) {
    warnings.push(`Storage hampir penuh: ${indexedDB.percentage}% digunakan`);
  } else if (indexedDB.percentage >= 80) {
    warnings.push(`Storage terisi: ${indexedDB.percentage}% digunakan`);
  }

  const isHealthy = errors.length === 0;

  return {
    indexedDB,
    localStorage,
    tableSizes,
    isHealthy,
    warnings,
    errors,
  };
}

/**
 * Pre-flight check before creating a transaction.
 */
export async function canCreateTransaction(): Promise<CanCreateResult> {
  const health = await getStorageHealth();
  if (!health.isHealthy) {
    return {
      canCreate: false,
      reason: health.errors.join("; "),
      action: "Hapus data lama atau sinkronkan transaksi pending untuk mengosongkan storage.",
    };
  }
  if (health.warnings.length > 0) {
    return {
      canCreate: true,
      warning: health.warnings.join("; "),
    };
  }
  return { canCreate: true };
}

// ── Automated cleanup policies (PRD §5.6) ───────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function cleanupOldPendingTransactions(maxAgeDays = 30): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * MS_PER_DAY;
  let deleted = 0;
  try {
    const oldTxs = await idb.pendingTransactions
      .where("syncStatus")
      .equals("synced")
      .filter((tx) => (tx.syncedAt ?? 0) < cutoff)
      .toArray();
    for (const tx of oldTxs) {
      await idb.pendingTransactions.delete(tx.clientId);
      deleted++;
    }
  } catch {
    // Ignore
  }
  return deleted;
}

export async function cleanupFailedTransactions(maxAgeDays = 7): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * MS_PER_DAY;
  let deleted = 0;
  try {
    const failedTxs = await idb.pendingTransactions
      .where("syncStatus")
      .equals("error")
      .filter((tx) => tx.createdAt < cutoff)
      .toArray();
    for (const tx of failedTxs) {
      await idb.pendingTransactions.delete(tx.clientId);
      deleted++;
    }
  } catch {
    // Ignore
  }
  return deleted;
}

export async function cleanupAbandonedCarts(maxAgeDays = 1): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * MS_PER_DAY;
  let deleted = 0;
  try {
    const oldCarts = await idb.carts
      .where("status")
      .equals("abandoned")
      .filter((c) => (c.lastActivityAt ?? 0) < cutoff)
      .toArray();
    for (const cart of oldCarts) {
      await idb.carts.delete(cart.id);
      deleted++;
    }
  } catch {
    // Ignore
  }
  return deleted;
}

export async function cleanupOldEvents(maxCount = 50): Promise<number> {
  let deleted = 0;
  try {
    const allEvents = await idb.events.toArray();
    if (allEvents.length <= maxCount) return 0;
    // Sort by version (proxy for recency) ascending
    const sorted = allEvents.sort((a, b) => (a.version ?? 0) - (b.version ?? 0));
    const toDelete = sorted.slice(0, allEvents.length - maxCount);
    for (const ev of toDelete) {
      // Never delete active events or events with pending transactions
      if (ev.status === "active") continue;
      const pendingCount = await idb.pendingTransactions
        .where("eventId")
        .equals(ev.id)
        .count();
      if (pendingCount > 0) continue;
      await idb.events.delete(ev.id);
      deleted++;
    }
  } catch {
    // Ignore
  }
  return deleted;
}

/**
 * Run all automated cleanup policies.
 */
export async function runAutomatedCleanup(): Promise<{
  oldPendingTx: number;
  failedTx: number;
  abandonedCarts: number;
  oldEvents: number;
}> {
  const [oldPendingTx, failedTx, abandonedCarts, oldEvents] = await Promise.all([
    cleanupOldPendingTransactions(30),
    cleanupFailedTransactions(7),
    cleanupAbandonedCarts(1),
    cleanupOldEvents(50),
  ]);
  return { oldPendingTx, failedTx, abandonedCarts, oldEvents };
}

/**
 * Check if storage is nearly full.
 */
export async function isStorageNearlyFull(thresholdPercent = 90): Promise<boolean> {
  const quota = await getIndexedDBQuota();
  return quota.percentage >= thresholdPercent;
}
