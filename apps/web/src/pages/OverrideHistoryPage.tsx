import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { api } from "../lib/api.js";
import { fmt } from "../lib/format.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface OverrideEntry {
  itemId: string;
  transactionId: string;
  cardId: string;
  soldPriceIdr: number;
  overrideBelowBottom: boolean;
  overrideReason: string | null;
  itemCreatedAt: number;
  txKind: string;
  cashierName: string;
}

export function OverrideHistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<OverrideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadEntries();
  }, []);

  async function loadEntries() {
    setLoading(true);
    try {
      const rows = await api.overrides.list() as OverrideEntry[];
      setEntries(rows);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat data override.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar title="Riwayat Override" back onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-warning flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-warning-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">Riwayat Override Admin</p>
            <p className="text-xs text-muted-fg">Transaksi dengan persetujuan di bawah harga minimum</p>
          </div>
        </div>

        {error && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-fg text-center py-8 italic">Belum ada override.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.itemId} className="bg-card rounded-2xl border border-border px-4 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-warning bg-opacity-15 text-warning">
                    Override
                  </span>
                  <span className="text-[10px] text-muted-fg">{fmt(entry.itemCreatedAt)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-fg">Kasir</span>
                  <span className="text-xs font-bold text-fg">{entry.cashierName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-fg">Harga Jual</span>
                  <MaskedAmount amount={entry.soldPriceIdr} className="text-sm font-extrabold text-fg" />
                </div>
                {entry.overrideReason && (
                  <div className="text-xs text-muted-fg bg-surface rounded-lg p-2 border border-border">
                    Alasan: {entry.overrideReason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
