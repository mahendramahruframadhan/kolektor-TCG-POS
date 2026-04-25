import React from "react";
import { Check, RefreshCw, WifiOff, AlertCircle, type LucideIcon } from "lucide-react";
import { useSyncStateStore, type SyncState } from "../store/sync-state.js";

const COLORS: Record<SyncState, string> = {
  online:  "hsl(152,60%,29%)",
  syncing: "hsl(38,92%,33%)",
  offline: "hsl(0,72%,51%)",
  error:   "hsl(0,72%,51%)",
};

const LABELS: Record<SyncState, string> = {
  online:  "Tersinkron",
  syncing: "Menyinkron…",
  offline: "Offline",
  error:   "Gagal sync",
};

// Shape distinction so state is readable without colour (SC 1.4.1 Use of Color).
const ICONS: Record<SyncState, LucideIcon> = {
  online:  Check,
  syncing: RefreshCw,
  offline: WifiOff,
  error:   AlertCircle,
};

interface Props {
  /** Optional override. Defaults to the global sync-state store. */
  state?: SyncState;
}

export function SyncDot({ state }: Props) {
  const storeState = useSyncStateStore((s) => s.state);
  const storeError = useSyncStateStore((s) => s.lastError);
  const pendingCount = useSyncStateStore((s) => s.pendingTransactionCount);
  const effective = state ?? storeState;
  const color = COLORS[effective];
  const Icon = ICONS[effective];
  const label = LABELS[effective];
  const titleText = effective === "error" && storeError
    ? `${label}: ${storeError}`
    : label;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Status sinkronisasi: ${titleText}`}
      title={titleText}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <Icon
        className={effective === "syncing" ? "w-3 h-3 animate-spin" : "w-3 h-3"}
        style={{ color }}
        aria-hidden="true"
      />
      <span
        className="text-[11px] font-extrabold tracking-widest uppercase"
        style={{ color }}
      >
        {label}
      </span>
      {pendingCount > 0 && (
        <span
          className="text-[11px] font-extrabold"
          style={{ color }}
          aria-label={`${pendingCount} transaksi menunggu sinkronisasi`}
        >
          ({pendingCount})
        </span>
      )}
    </div>
  );
}
