import React, { useState, useRef, useEffect } from "react";
import { Wifi, Plane } from "lucide-react";
import { useSyncStateStore } from "../store/sync-state.js";
import { opportunisticSync } from "../lib/background-sync.js";

export function NetworkModeToggle() {
  const networkMode = useSyncStateStore((s) => s.networkMode);
  const setNetworkMode = useSyncStateStore((s) => s.setNetworkMode);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const isForceOffline = networkMode === "force-offline";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        data-testid="network-mode-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isForceOffline ? "Mode jaringan: Offline" : "Mode jaringan: Auto"}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold tracking-widest uppercase border transition ${
          isForceOffline
            ? "bg-warning/10 border-warning/40 text-warning"
            : "bg-muted border-border text-muted-fg"
        }`}
      >
        {isForceOffline ? (
          <Plane className="w-3 h-3" aria-hidden="true" />
        ) : (
          <Wifi className="w-3 h-3" aria-hidden="true" />
        )}
        {isForceOffline ? "Offline" : "Auto"}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Pilih mode jaringan"
          className="absolute right-0 top-full mt-1 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[148px] z-50"
        >
          <button
            role="option"
            aria-selected={networkMode === "auto"}
            onClick={() => {
              setNetworkMode("auto");
              setOpen(false);
              // Trigger an immediate sync when restoring online mode so pending
              // transactions flush without waiting for the 60s background interval.
              opportunisticSync();
            }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition flex items-center gap-2"
          >
            <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{networkMode === "auto" ? "✓ " : ""}Auto</span>
          </button>
          <button
            role="option"
            aria-selected={networkMode === "force-offline"}
            onClick={() => { setNetworkMode("force-offline"); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted transition flex items-center gap-2"
          >
            <Plane className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{networkMode === "force-offline" ? "✓ " : ""}Mode Offline</span>
          </button>
        </div>
      )}
    </div>
  );
}
