import React from "react";
import { Eye, EyeOff } from "lucide-react";
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
  return revealed
    ? <Eye className="w-4 h-4 text-muted-fg" />
    : <EyeOff className="w-4 h-4 text-muted-fg" />;
}
