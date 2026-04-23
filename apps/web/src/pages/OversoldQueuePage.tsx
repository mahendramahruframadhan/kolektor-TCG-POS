import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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

  async function handleVoid(transactionId: string, reason: string) {
    setError(null);
    try {
      await api.transactions.void(transactionId, { reason, clientId: crypto.randomUUID() });
      await queryClient.invalidateQueries({ queryKey: ["oversold-cards"] });
      setVoidingId(null);
      setVoidReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membatalkan transaksi.");
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
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
              <svg width="32" height="32" fill="none" stroke="hsl(152,60%,40%)" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M20 6L9 17l-5-5" />
              </svg>
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
