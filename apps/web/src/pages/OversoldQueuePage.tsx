import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { MaskedAmount } from "../components/MaskedAmount.js";

/**
 * Admin: Oversold queue (PRD §R5, §16.3).
 * Lists cards flagged as oversold; allows admin to void one of the two sales.
 */
export function OversoldQueuePage() {
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-red-700 text-white px-4 py-3">
        <h1 className="font-bold text-lg">Antrian Oversold</h1>
        <p className="text-xs opacity-75">Kartu yang terjual di dua perangkat sekaligus</p>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {isLoading && (
          <p className="text-gray-400 text-center py-8">Memuat…</p>
        )}

        {!isLoading && (!oversoldCards || oversoldCards.length === 0) && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-5xl mb-3">✅</p>
            <p className="text-gray-600">Tidak ada kartu oversold saat ini.</p>
          </div>
        )}

        {oversoldCards && oversoldCards.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-red-600 font-semibold">
              {oversoldCards.length} kartu oversold ditemukan
            </p>

            {oversoldCards.map((card) => (
              <div key={card.id} className="bg-white rounded-xl shadow-sm p-4 border-l-4 border-red-400">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-gray-800">{card.title}</p>
                    <p className="text-xs text-gray-400 font-mono">{card.shortId}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {card.setName} {card.setNumber ? `#${card.setNumber}` : ""} · {card.condition}
                    </p>
                  </div>
                  <span className="inline-block text-xs font-bold px-2 py-1 rounded-full bg-red-100 text-red-700">
                    OVERSOLD
                  </span>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600">Harga</span>
                  <MaskedAmount
                    amount={card.listedPriceIdr ?? card.priceIdr}
                    className="font-semibold text-gray-700"
                  />
                </div>

                {voidingId === card.id ? (
                  <div className="space-y-2 bg-red-50 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-700">
                      Void salah satu transaksi — masukkan alasan:
                    </p>
                    <textarea
                      value={voidReason}
                      onChange={(e) => setVoidReason(e.target.value)}
                      className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                      rows={2}
                      placeholder="Alasan void…"
                    />
                    {error && (
                      <p className="text-xs text-red-600">{error}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setVoidingId(null); setVoidReason(""); setError(null); }}
                        className="flex-1 border border-gray-300 text-gray-600 text-sm py-1.5 rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => handleVoid(card.id, voidReason)}
                        disabled={!voidReason.trim()}
                        className="flex-1 bg-red-600 text-white text-sm py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Konfirmasi Void
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setVoidingId(card.id)}
                    className="w-full border border-red-400 text-red-600 text-sm font-semibold py-2 rounded-xl hover:bg-red-50 transition"
                  >
                    Void Transaksi
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
