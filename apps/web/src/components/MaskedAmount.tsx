import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { useMasked } from "../hooks/useMasked.js";
import { useMaskedScope } from "../hooks/useMaskedScope.js";

interface Props {
  amount: number | undefined | null;
  className?: string;
  autoHideMs?: number;
}

function formatIdr(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

/**
 * Renders a masked monetary amount. By default each instance has its own
 * reveal/hide state. Wrap in `<MaskedScopeProvider>` to share one reveal
 * state across every amount in the scope (F10, §9.1).
 */
export function MaskedAmount({ amount, className = "", autoHideMs }: Props) {
  const scope = useMaskedScope();
  const local = useMasked(autoHideMs);
  const { revealed, toggle } = scope ?? local;
  const isScoped = scope !== null;

  return (
    <span
      className={`inline-flex items-center gap-1 select-none ${
        isScoped ? "" : "cursor-pointer"
      } ${className}`}
      onClick={isScoped ? undefined : toggle}
      role={isScoped ? undefined : "button"}
      aria-label={
        isScoped
          ? undefined
          : revealed
          ? "Sembunyikan nominal"
          : "Tampilkan nominal"
      }
    >
      <span className="font-mono">
        {amount == null
          ? "—"
          : revealed
          ? formatIdr(amount)
          : "Rp ••••••"}
      </span>
      {!isScoped && <EyeIcon revealed={revealed} />}
    </span>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return revealed
    ? <Eye className="w-4 h-4 text-muted-fg" aria-hidden="true" />
    : <EyeOff className="w-4 h-4 text-muted-fg" aria-hidden="true" />;
}
