import { idb } from "./db.js";
import { api } from "./api.js";
import { useSyncStateStore } from "../store/sync-state.js";
import type {
  IdbCard,
  IdbEvent,
  IdbUser,
  IdbPaymentChannel,
  IdbCart,
  IdbTransaction,
  IdbTransactionItem,
  IdbCashReconciliation,
} from "./db.js";

const SYNC_CURSOR_KEY = "kolekta-sync-cursor";

function getSyncCursor(): number {
  return parseInt(localStorage.getItem(SYNC_CURSOR_KEY) ?? "0", 10);
}

function setSyncCursor(cursor: number) {
  localStorage.setItem(SYNC_CURSOR_KEY, String(cursor));
}

// ── Merge entity changes into IDB ─────────────────────────────────────────

async function applyChanges(changes: unknown[]): Promise<number> {
  let failCount = 0;
  for (const change of changes as Array<{
    entityType: string;
    operation: string;
    payload: Record<string, unknown>;
    serverReceivedAt: number;
  }>) {
    try {
      switch (change.entityType) {
        case "card":
          await idb.cards.put(change.payload as unknown as IdbCard);
          break;
        case "event":
          await idb.events.put(change.payload as unknown as IdbEvent);
          break;
        case "user":
          await idb.users.put(change.payload as unknown as IdbUser);
          break;
        case "payment_channel":
          await idb.paymentChannels.put(change.payload as unknown as IdbPaymentChannel);
          break;
        case "setting": {
          const row = change.payload as unknown as { key: string; valueJson: string };
          await idb.settings.put({ key: row.key, value: JSON.parse(row.valueJson) });
          break;
        }
        case "cart":
          await idb.carts.put(change.payload as unknown as IdbCart);
          break;
        case "transaction":
          await idb.transactions.put(change.payload as unknown as IdbTransaction);
          break;
        case "transaction_item":
          await idb.transactionItems.put(change.payload as unknown as IdbTransactionItem);
          break;
        case "cash_reconciliation":
          await idb.cashReconciliations.put(change.payload as unknown as IdbCashReconciliation);
          break;
      }
    } catch (err) {
      failCount++;
      console.warn(`[sync] Failed to apply change for ${change.entityType}:`, err);
    }
  }
  return failCount;
}

/**
 * Delta sync pull — fetches changes since last cursor and merges into IDB.
 * Uses server_received_at for ordering (§16.4).
 */
export async function deltaSyncPull(): Promise<void> {
  const cursor = getSyncCursor();
  const deviceId = getOrCreateDeviceId();

  const response = await api.sync.pull(cursor, deviceId) as {
    changes: unknown[];
    newCursor: number;
    hasMore: boolean;
  };

  const failCount = await applyChanges(response.changes);

  // Handle cart expiry notices (§16.3 cart_expired scenario)
  const cartChanges = (response.changes as Array<{ entityType: string; payload: { status: string; id: string } }>)
    .filter((c) => c.entityType === "cart" && c.payload.status === "abandoned");

  for (const change of cartChanges) {
    const localCart = await idb.carts.get(change.payload.id);
    if (localCart?.status === "draft") {
      console.info(`[sync] Cart ${change.payload.id} abandoned by server (TTL/admin)`);
    }
  }

  // Handle oversold flags
  const cardChanges = (response.changes as Array<{ entityType: string; payload: IdbCard }>)
    .filter((c) => c.entityType === "card" && c.payload.oversold);

  if (cardChanges.length > 0) {
    console.warn(`[sync] ${cardChanges.length} oversold card(s) flagged by server`);
  }

  if (response.newCursor > cursor) {
    if (failCount === 0) {
      setSyncCursor(response.newCursor);
    } else {
      console.warn(`[sync] Skipping cursor advance: ${failCount} change(s) failed to apply`);
    }
  }

  // If more changes available, recurse
  if (response.hasMore) {
    await deltaSyncPull();
  }
}

export async function flushPendingTransactions(): Promise<void> {
  const pending = await idb.pendingTransactions
    .where("syncStatus")
    .equals("pending")
    .toArray();

  if (pending.length === 0) return;

  await Promise.all(
    pending.map((tx) =>
      idb.pendingTransactions.update(tx.clientId, { syncStatus: "syncing" })
    )
  );

  try {
    const response = await api.sync.flushPendingTx(pending);

    for (const result of response.results) {
      if (result.status === "accepted") {
        await idb.pendingTransactions.update(result.clientId, {
          syncStatus: "synced",
          syncedAt: Date.now(),
        });
      } else {
        await idb.pendingTransactions.update(result.clientId, {
          syncStatus: "error",
          syncError: result.reason,
        });
      }
    }
  } catch (err) {
    // Network failure — reset syncing → pending so they can retry
    await Promise.all(
      pending.map((tx) =>
        idb.pendingTransactions.update(tx.clientId, { syncStatus: "pending" })
      )
    );
    throw err;
  }

  const stillPending = await idb.pendingTransactions
    .where("syncStatus")
    .equals("pending")
    .count();
  useSyncStateStore.getState().setPendingTransactionCount(stillPending);
}

/**
 * Background sync — runs every 60s + opportunistically after cashier actions.
 * PRD §11: Background every 60s when online + opportunistic on every cashier action.
 */
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startBackgroundSync() {
  if (syncInterval) return;
  syncInterval = setInterval(async () => {
    const { effectiveIsOnline } = useSyncStateStore.getState();
    if (!effectiveIsOnline) {
      useSyncStateStore.getState().setState("offline");
      return;
    }
    useSyncStateStore.getState().setState("syncing");
    try {
      await flushPendingTransactions();
      await deltaSyncPull();
      useSyncStateStore.getState().markSuccess();
    } catch (err) {
      console.warn("[sync] Background sync failed:", err);
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
    }
  }, 60 * 1000);
}

export function stopBackgroundSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

/** Trigger an opportunistic sync immediately (call after cashier actions). */
export function opportunisticSync() {
  const { effectiveIsOnline } = useSyncStateStore.getState();
  if (!effectiveIsOnline) {
    useSyncStateStore.getState().setState("offline");
    return;
  }
  useSyncStateStore.getState().setState("syncing");
  flushPendingTransactions()
    .then(() => deltaSyncPull())
    .then(() => useSyncStateStore.getState().markSuccess())
    .catch((err) => {
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
    });
}

/** Persistent device UUID for sync cursors. */
function getOrCreateDeviceId(): string {
  const key = "kolekta-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}
