import React from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

export type ToastVariant = "success" | "error";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss?: () => void;
}

/**
 * Fixed-position toast pinned to the bottom of the viewport. Pair with a
 * parent `useState<string | null>` and a `setTimeout` for auto-dismiss.
 */
export function Toast({ message, variant = "success", onDismiss }: ToastProps) {
  const isSuccess = variant === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;
  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex items-center gap-2.5 max-w-sm w-full bg-card border rounded-2xl shadow-lg px-4 py-3 ${
          isSuccess ? "border-success" : "border-destructive"
        }`}
      >
        <Icon
          className={`w-5 h-5 shrink-0 ${isSuccess ? "text-success" : "text-destructive"}`}
        />
        <p className="text-sm font-semibold text-fg flex-1 min-w-0">{message}</p>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-6 h-6 rounded-full flex items-center justify-center text-muted-fg hover:bg-muted transition shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
