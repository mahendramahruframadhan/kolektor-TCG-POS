import { RefreshCw } from "lucide-react";

interface SyncButtonProps {
  onClick: () => void;
  syncing?: boolean;
  disabled?: boolean;
}

export function SyncButton({ onClick, syncing = false, disabled = false }: SyncButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || syncing}
      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-fg font-bold rounded-xl hover:opacity-90 transition disabled:opacity-50"
    >
      {syncing ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4" />
          <span>Sync Data</span>
        </>
      )}
    </button>
  );
}