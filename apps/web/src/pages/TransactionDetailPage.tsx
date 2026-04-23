import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Receipt } from "lucide-react";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import { fmt } from "../lib/format.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type { IdbTransaction, IdbTransactionItem, IdbCard, IdbUser } from "../lib/db.js";

interface TxDetail {
  transaction: IdbTransaction;
  items: (IdbTransactionItem & { card?: IdbCard; ownerName?: string })[];
}

function kindLabel(kind: IdbTransaction["kind"]) {
  switch (kind) {
    case "sale": return { text: "Penjualan", cls: "bg-success bg-opacity-15 text-success" };
    case "void": return { text: "Void", cls: "bg-destructive bg-opacity-15 text-destructive" };
    case "refund": return { text: "Refund", cls: "bg-destructive bg-opacity-15 text-destructive" };
  }
}

export function TransactionDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<TxDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadDetail(id);
  }, [id]);

  async function loadDetail(txId: string) {
    setLoading(true);
    try {
      // Try API first, fallback to IDB
      let tx: IdbTransaction | undefined;
      let items: IdbTransactionItem[] = [];

      try {
        const apiTx = await api.transactions.get(txId) as IdbTransaction & { items: IdbTransactionItem[] };
        tx = apiTx;
        items = apiTx.items ?? [];
      } catch {
        tx = await idb.transactions.get(txId) ?? undefined;
        if (tx) {
          items = await idb.transactionItems.where("transactionId").equals(txId).toArray();
        }
      }

      if (!tx) {
        setError("Transaksi tidak ditemukan.");
        setLoading(false);
        return;
      }

      const cardIds = [...new Set(items.map((i) => i.cardId))];
      const ownerIds = [...new Set(items.map((i) => i.ownerUserIdSnapshot))];
      const [cards, users] = await Promise.all([
        idb.cards.bulkGet(cardIds),
        idb.users.bulkGet(ownerIds),
      ]);

      const cardMap: Record<string, IdbCard> = {};
      for (const c of cards) if (c) cardMap[c.id] = c;

      const userMap: Record<string, string> = {};
      for (const u of users) if (u) userMap[u.id] = u.displayName;

      const enriched = items.map((item) => ({
        ...item,
        card: cardMap[item.cardId],
        ownerName: userMap[item.ownerUserIdSnapshot],
      }));

      setDetail({ transaction: tx, items: enriched });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memuat transaksi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar
        title="Detail Transaksi"
        back
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {error && (
          <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : detail ? (
          <>
            <div className="flex items-center gap-3 pt-1">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                <Receipt className="w-5 h-5 text-primary-fg" />
              </div>
              <div>
                <p className="text-sm font-bold text-fg">#{detail.transaction.id.slice(0, 8).toUpperCase()}</p>
                <p className="text-xs text-muted-fg">{fmt(detail.transaction.createdAt)}</p>
              </div>
              <span className={`ml-auto text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full ${kindLabel(detail.transaction.kind).cls}`}>
                {kindLabel(detail.transaction.kind).text}
              </span>
            </div>

            <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
              <Row label="Subtotal" value={<MaskedAmount amount={detail.transaction.subtotalIdr} className="font-bold text-fg" />} />
              {detail.transaction.discountIdr > 0 && (
                <Row label="Diskon" value={<span className="font-bold text-destructive">- Rp {detail.transaction.discountIdr.toLocaleString("id-ID")}</span>} />
              )}
              <Row label="Total" value={<MaskedAmount amount={detail.transaction.totalIdr} className="font-extrabold text-lg text-primary" />} />
              {detail.transaction.notes && (
                <div className="pt-2 border-t border-border">
                  <span className="text-xs text-muted-fg">Catatan: {detail.transaction.notes}</span>
                </div>
              )}
            </div>

            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
              Item ({detail.items.length})
            </p>

            <ul className="space-y-2">
              {detail.items.map((item) => (
                <li key={item.id} className="bg-card rounded-2xl border border-border px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-fg truncate">{item.card?.title ?? "—"}</p>
                      <p className="text-xs text-muted-fg font-mono">{item.card?.shortId ?? "—"}</p>
                    </div>
                    <MaskedAmount amount={item.soldPriceIdr} className="text-sm font-extrabold text-fg shrink-0" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-fg">
                    <span>Pemilik: {item.ownerName ?? item.ownerUserIdSnapshot.slice(0, 8)}</span>
                    {item.lineDiscountIdr > 0 && (
                      <span>Diskon Rp {item.lineDiscountIdr.toLocaleString("id-ID")}</span>
                    )}
                  </div>
                  {item.overrideBelowBottom && (
                    <div className="text-[10px] text-warning font-bold">Admin override: di bawah harga minimum</div>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-muted-fg">{label}</span>
      {value}
    </div>
  );
}
