import React from "react";
import { useSyncStateStore } from "../store/sync-state.js";
import { CheckCircle, XCircle, Info, AlertTriangle, X } from "lucide-react";

const TOAST_ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TOAST_COLORS = {
  success: "bg-success",
  error: "bg-destructive",
  info: "bg-primary",
  warning: "bg-yellow-500",
};

export function ToastContainer() {
  const toasts = useSyncStateStore((s) => s.toasts);
  const removeToast = useSyncStateStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-xl mx-auto">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.type];
        return (
          <div
            key={toast.id}
            className={`flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg text-white font-medium text-sm pointer-events-auto ${TOAST_COLORS[toast.type]}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{toast.text}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-white hover:bg-opacity-20 transition shrink-0"
              aria-label="Tutup"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}