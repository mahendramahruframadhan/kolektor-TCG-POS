import React from "react";
import { Check, RefreshCw, WifiOff, type LucideIcon } from "lucide-react";

type SyncState = "online" | "syncing" | "offline";

const COLORS: Record<SyncState, string> = {
  online:  "hsl(152,60%,29%)",
  syncing: "hsl(38,92%,33%)",
  offline: "hsl(0,72%,51%)",
};

const LABELS: Record<SyncState, string> = {
  online:  "Tersinkron",
  syncing: "Menyinkron…",
  offline: "Offline",
};

// Shape distinction so state is readable without colour (SC 1.4.1 Use of Color).
const ICONS: Record<SyncState, LucideIcon> = {
  online:  Check,
  syncing: RefreshCw,
  offline: WifiOff,
};

export function SyncDot({ state = "online" }: { state?: SyncState }) {
  const color = COLORS[state];
  const Icon = ICONS[state];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Status sinkronisasi: ${LABELS[state]}`}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <Icon className="w-3 h-3" style={{ color }} aria-hidden="true" />
      <span
        className="text-[11px] font-extrabold tracking-widest uppercase"
        style={{ color }}
      >
        {LABELS[state]}
      </span>
    </div>
  );
}
