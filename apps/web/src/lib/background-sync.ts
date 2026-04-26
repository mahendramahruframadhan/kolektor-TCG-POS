import { z } from "zod";
import { idb } from "./db.js";
import { api } from "./api.js";
import { useSyncStateStore } from "../store/sync-state.js";
import type { SyncEntityChange } from "@kolektapos/sync";
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

// ── Minimal sync payload validators ───────────────────────────────────────
// @kolektapos/types only exports input/create schemas (no id, version, etc.).
// These inline schemas validate the minimum structure needed for safe IDB writes.

const SyncCardPayloadSchema = z.object({
  id: z.string().uuid(),
  shortId: z.string(),
  ownerUserId: z.string().uuid(),
  title: z.string().min(1),
  status: z.enum(["available", "held", "sold", "returned"]),
  version: z.number().int(),
});

const SyncEventPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  status: z.enum(["draft", "active", "closed"]),
  version: z.number().int(),
});

const SyncUserPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(["admin", "cashier"]),
  version: z.number().int(),
});

const SyncTransactionPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["sale", "void", "refund"]),
  totalIdr: z.number().int(),
  eventId: z.string().uuid(),
});

const SYNC_CURSOR_KEY = "kolekta-sync-cursor";

function getSyncCursor(): number {
  return parseInt(localStorage.getItem(SYNC_CURSOR_KEY) ?? "0", 10);
}

function setSyncCursor(cursor: number) {
  localStorage.setItem(SYNC_CURSOR_KEY, String(cursor));
}

// ── Merge entity changes into IDB ─────────────────────────────────────────

async function applyChanges(changes: SyncEntityChange[]): Promise<number> {
  let failCount = 0;
  for (const change of changes) {
    try {
      switch (change.entityType) {
        case "card": {
          const parsed = SyncCardPayloadSchema.safeParse(change.payload);
          if (!parsed.success) {
            failCount++;
            console.warn(`[sync] Invalid card payload:`, parsed.error.flatten());
            break;
          }
          await idb.cards.put(parsed.data as unknown as IdbCard);
          break;
        }
        case "event": {
          const parsed = SyncEventPayloadSchema.safeParse(change.payload);
          if (!parsed.success) {
            failCount++;
            console.warn(`[sync] Invalid event payload:`, parsed.error.flatten());
            break;
          }
          await idb.events.put(parsed.data as unknown as IdbEvent);
          break;
        }
        case "user": {
          const parsed = SyncUserPayloadSchema.safeParse(change.payload);
          if (!parsed.success) {
            failCount++;
            console.warn(`[sync] Invalid user payload:`, parsed.error.flatten());
            break;
          }
          await idb.users.put(parsed.data as unknown as IdbUser);
          break;
        }
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
        case "transaction": {
          const parsed = SyncTransactionPayloadSchema.safeParse(change.payload);
          if (!parsed.success) {
            failCount++;
            console.warn(`[sync] Invalid transaction payload:`, parsed.error.flatten());
            break;
          }
          await idb.transactions.put(parsed.data as unknown as IdbTransaction);
          break;
        }
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

  const response = await api.sync.pull(cursor, deviceId);

  const failCount = await applyChanges(response.changes);

  // Handle cart expiry notices (§16.3 cart_expired scenario)
  const cartChanges = response.changes
    .filter((c) => c.entityType === "cart" && c.payload["status"] === "abandoned");

  for (const change of cartChanges) {
    const cartId = change.payload["id"] as string;
    const localCart = await idb.carts.get(cartId);
    if (localCart?.status === "draft") {
      console.info(`[sync] Cart ${cartId} abandoned by server (TTL/admin)`);
    }
  }

  const cardChanges = response.changes
    .filter((c) => c.entityType === "card" && Boolean(c.payload["oversold"]));

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

/**
 * Full reset + re-pull: clears the sync cursor then runs an initial pull.
 * Use this instead of the legacy fetchAndSync() after login.
 */
export async function resetAndSync(): Promise<void> {
  // Clear cursor so deltaSyncPull triggers a cursor=0 (full initial pull)
  localStorage.removeItem("kolekta-sync-cursor");
  useSyncStateStore.getState().setState("syncing");
  try {
    await deltaSyncPull();
    useSyncStateStore.getState().markSuccess();
  } catch (err) {
    useSyncStateStore.getState().setState(
      "error",
      err instanceof Error ? err.message : "Sinkronisasi gagal"
    );
    throw err;
  }
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
