import React from "react";
import { useMasked } from "../hooks/useMasked.js";

interface Props {
  amount: number | undefined | null;
  className?: string;
  autoHideMs?: number;
}

function formatIdr(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Renders a masked monetary amount with eye-icon toggle (PRD §9.1, F10).
 * Tap eye → reveals. Auto-hides after autoHideMs (default 5s).
 */
export function MaskedAmount({ amount, className = "", autoHideMs }: Props) {
  const { revealed, toggle } = useMasked(autoHideMs);

  return (
    <span
      className={`inline-flex items-center gap-1 cursor-pointer select-none ${className}`}
      onClick={toggle}
      role="button"
      aria-label={revealed ? "Sembunyikan nominal" : "Tampilkan nominal"}
    >
      <span className="font-mono">
        {amount == null
          ? "—"
          : revealed
          ? formatIdr(amount)
          : "Rp ••••••"}
      </span>
      <EyeIcon revealed={revealed} />
    </span>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return revealed ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
