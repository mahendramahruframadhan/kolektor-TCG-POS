import React from "react";

type SyncState = "online" | "syncing" | "offline";

const COLORS: Record<SyncState, string> = {
  online:  "hsl(152,60%,40%)",
  syncing: "hsl(38,92%,50%)",
  offline: "hsl(0,72%,51%)",
};

const LABELS: Record<SyncState, string> = {
  online:  "Tersinkron",
  syncing: "Menyinkron…",
  offline: "Offline",
};

export function SyncDot({ state = "online" }: { state?: SyncState }) {
  const color = COLORS[state];
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      <span
        className="text-[10px] font-extrabold tracking-widest uppercase"
        style={{ color }}
      >
        {LABELS[state]}
      </span>
    </div>
  );
}
