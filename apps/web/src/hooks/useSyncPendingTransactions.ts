import { useState, useEffect } from "react";
import { liveQuery } from "dexie";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import type { IdbPendingTransaction } from "../lib/db.js";

interface SyncDataResult {
  synced: number;
  failed: number;
  message: string;
}

export function useSyncPendingTransactions() {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const sub = liveQuery(() =>
      idb.pendingTransactions.where("syncStatus").equals("pending").count()
    ).subscribe({
      next: (count) => setPendingCount(count),
      error: (err) => console.error("Error watching pending count:", err),
    });

    return () => sub.unsubscribe();
  }, []);

  async function syncPending(): Promise<SyncDataResult> {
    setSyncing(true);
    setMessage(null);

    try {
      const pending = await idb.pendingTransactions
        .where("syncStatus")
        .equals("pending")
        .toArray();

      if (pending.length === 0) {
        const result = { synced: 0, failed: 0, message: "Tidak ada transaksi untuk di-sync" };
        setMessage({ type: "success", text: result.message });
        setSyncing(false);
        return result;
      }

      await idb.pendingTransactions.bulkPut(
        pending.map((t) => ({ ...t, syncStatus: "syncing" as const }))
      );

      const response = await api.sync.flushPendingTx(pending);
      let synced = 0;
      let failed = 0;

      const resolvedClientIds = new Set<string>();
      for (const result of response.results) {
        const tx = pending.find((p) => p.clientId === result.clientId);
        if (!tx) continue;
        resolvedClientIds.add(result.clientId);

        if (result.status === "accepted") {
          tx.syncStatus = "synced";
          tx.syncedAt = Math.floor(Date.now() / 1000);
          synced++;
        } else {
          tx.syncStatus = "error";
          tx.syncError = result.reason;
          failed++;
        }
      }

      // Any transaction not in server response was left as "syncing" — reset to "error"
      // so it re-enters the queue next sync rather than stuck permanently.
      for (const tx of pending) {
        if (!resolvedClientIds.has(tx.clientId) && tx.syncStatus === "syncing") {
          tx.syncStatus = "error";
          tx.syncError = "No response from server";
          failed++;
        }
      }

      await idb.pendingTransactions.bulkPut(pending as IdbPendingTransaction[]);

      let finalMessage: string;
      if (failed > 0) {
        finalMessage = `Sync selesai: ${synced} berhasil, ${failed} gagal`;
      } else {
        finalMessage = `Sync berhasil: ${synced} transaksi`;
      }

      setMessage({ type: failed > 0 ? "error" : "success", text: finalMessage });

      const result = { synced, failed, message: finalMessage };
      setTimeout(() => setMessage(null), 5000);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Sync gagal";
      setMessage({ type: "error", text: errorMessage });
      setTimeout(() => setMessage(null), 5000);

      const pending = await idb.pendingTransactions
        .where("syncStatus")
        .equals("syncing")
        .toArray();
      await idb.pendingTransactions.bulkPut(
        pending.map((t) => ({ ...t, syncStatus: "pending" as const }))
      );

      return { synced: 0, failed: 0, message: errorMessage };
    } finally {
      setSyncing(false);
    }
  }

  return {
    syncing,
    message,
    pendingCount,
    syncPending,
  };
}