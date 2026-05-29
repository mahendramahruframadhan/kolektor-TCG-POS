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
}).passthrough();

const SyncEventPayloadSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  status: z.enum(["draft", "active", "closed"]),
  version: z.number().int(),
}).passthrough();

const SyncUserPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: z.enum(["admin", "cashier"]),
  version: z.number().int(),
}).passthrough();

const SyncTransactionPayloadSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["sale", "void", "refund"]),
  totalIdr: z.number().int(),
  eventId: z.string().uuid(),
}).passthrough();

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
    const response = await withRetry(
      () => api.sync.flushPendingTx(pending),
      { label: "flushPendingTransactions" }
    );

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

// ── Retry helpers (PRD §7) ──────────────────────────────────────────────

const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { maxAttempts = MAX_RETRY_ATTEMPTS, baseDelayMs = RETRY_BASE_DELAY_MS, label = "operation" } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`[sync] ${label} failed (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        const waitMs = baseDelayMs * Math.pow(2, attempt - 1);
        await delay(waitMs);
      }
    }
  }
  throw lastError;
}

/**
 * Background sync — runs every 60s + opportunistically after cashier actions.
 * PRD §11: Background every 60s when online + opportunistic on every cashier action.
 */
let syncInterval: ReturnType<typeof setInterval> | null = null;
let lastSyncErrorToastAt = 0;
const SYNC_ERROR_TOAST_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function addSyncErrorToast(message: string) {
  const now = Date.now();
  if (now - lastSyncErrorToastAt < SYNC_ERROR_TOAST_COOLDOWN_MS) return;
  lastSyncErrorToastAt = now;
  useSyncStateStore.getState().addToast(message, "error");
}

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
      await withRetry(() => deltaSyncPull(), { label: "deltaSyncPull" });
      useSyncStateStore.getState().markSuccess();
      // Toast success di-disable agar tidak mengganggu UI kasir
      console.info("[sync] Sinkronisasi berhasil (background)");
    } catch (err) {
      console.warn("[sync] Background sync failed:", err);
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
      addSyncErrorToast("Sinkronisasi gagal — akan dicoba ulang");
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
    .then(() => withRetry(() => deltaSyncPull(), { label: "opportunisticSync" }))
    .then(() => {
      useSyncStateStore.getState().markSuccess();
      // Toast success di-disable agar tidak mengganggu UI kasir
      console.info("[sync] Sinkronisasi berhasil (opportunistic)");
    })
    .catch((err) => {
      useSyncStateStore.getState().setState(
        "error",
        err instanceof Error ? err.message : "Sinkronisasi gagal"
      );
      addSyncErrorToast("Sinkronisasi gagal — akan dicoba ulang");
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
    await withRetry(() => deltaSyncPull(), { label: "resetAndSync" });
    useSyncStateStore.getState().markSuccess();
    // Toast success di-disable agar tidak mengganggu UI kasir
    console.info("[sync] Data berhasil disinkronkan (resetAndSync)");
  } catch (err) {
    useSyncStateStore.getState().setState(
      "error",
      err instanceof Error ? err.message : "Sinkronisasi gagal"
    );
    useSyncStateStore.getState().addToast("Sinkronisasi gagal — akan dicoba ulang", "error");
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
