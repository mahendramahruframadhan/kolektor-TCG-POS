import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

export function OversoldQueuePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: oversoldCards, isLoading } = useQuery({
    queryKey: ["oversold-cards"],
    queryFn: () => idb.cards.filter((c) => c.oversold).toArray(),
    refetchInterval: 30000,
  });

  async function handleVoid(cardId: string, reason: string) {
    setError(null);
    try {
      const items = await idb.transactionItems.where("cardId").equals(cardId).toArray();
      if (items.length === 0) {
        setError("Tidak ada transaksi ditemukan untuk kartu ini.");
        return;
      }
      const txIds = items.map((i) => i.transactionId);
      const txs = await idb.transactions.bulkGet(txIds);
      const presentTxs = txs.filter((t): t is NonNullable<typeof t> => !!t);
      const sales = presentTxs.filter((t) => t.kind === "sale");
      if (sales.length === 0) {
        setError("Tidak ada transaksi 'sale' yang bisa di-void.");
        return;
      }
      const voidedParentIds = new Set(
        presentTxs
          .filter((t) => t.kind === "void" && !!t.parentTransactionId)
          .map((t) => t.parentTransactionId as string)
      );
      const openSales = sales.filter((s) => !voidedParentIds.has(s.id));
      if (openSales.length === 0) {
        setError("Semua transaksi untuk kartu ini sudah di-void.");
        return;
      }
      const target = openSales.reduce((a, b) => ((a.createdAt ?? 0) >= (b.createdAt ?? 0) ? a : b));
      await api.transactions.void(target.id, { reason, clientId: crypto.randomUUID() });
      await queryClient.invalidateQueries({ queryKey: ["oversold-cards"] });
      setVoidingId(null);
      setVoidReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan transaksi.");
    }
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Antrian Oversold"
        back
        onBack={() => navigate("/admin")}
      />

      <main className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-3">
        {isLoading && (
          <p className="text-muted-fg text-center py-8 text-sm">Memuat…</p>
        )}

        {!isLoading && (!oversoldCards || oversoldCards.length === 0) && (
          <div className="bg-card rounded-2xl border border-border p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-success bg-opacity-15 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-success" />
            </div>
            <p className="text-fg font-bold">Tidak ada kartu oversold saat ini.</p>
          </div>
        )}

        {oversoldCards && oversoldCards.length > 0 && (
          <>
            <p className="text-xs font-extrabold tracking-widest uppercase text-destructive px-1">
              {oversoldCards.length} kartu oversold ditemukan
            </p>

            {oversoldCards.map((card) => (
              <div key={card.id} className="bg-card rounded-2xl border-l-4 border-destructive border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-fg">{card.title}</p>
                    <p className="text-xs text-muted-fg font-mono">{card.shortId}</p>
                    <p className="text-xs text-muted-fg mt-0.5">
                      {card.setName}{card.setNumber ? ` #${card.setNumber}` : ""} · {card.condition}
                    </p>
                  </div>
                  <span className="text-[11px] font-extrabold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-destructive bg-opacity-15 text-destructive shrink-0">
                    OVERSOLD
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-fg">Harga</span>
                  <MaskedAmount amount={card.listedPriceIdr ?? card.priceIdr} className="font-bold text-fg" />
                </div>

                {voidingId === card.id ? (
                  <div className="space-y-2 bg-destructive bg-opacity-5 rounded-xl border border-destructive border-opacity-20 p-3">
                    <p className="text-sm font-bold text-destructive">
                      Void salah satu transaksi — masukkan alasan:
                    </p>
                    <textarea
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2 text-sm focus:outline-none resize-none"
                      rows={2}
                      placeholder="Alasan void…"
                    />
                    {error && <p className="text-xs text-destructive font-medium">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setVoidingId(null); setVoidReason(""); setError(null); }}
                        className="flex-1 h-10 border border-border text-fg text-sm font-bold rounded-xl hover:bg-muted transition"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => handleVoid(card.id, voidReason)}
                        disabled={!voidReason.trim()}
                        className="flex-1 h-10 bg-destructive text-white text-sm font-bold rounded-xl disabled:opacity-50 hover:opacity-90 transition"
                      >
                        Konfirmasi Void
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setVoidingId(card.id)}
                    className="w-full h-11 border border-destructive border-opacity-50 text-destructive text-sm font-bold rounded-2xl hover:bg-destructive hover:bg-opacity-5 transition"
                  >
                    Void Transaksi
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
