import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet } from "lucide-react";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type { IdbEvent, IdbTransaction, IdbTransactionItem, IdbCard } from "../lib/db.js";

// ── Types ─────────────────────────────────────────────────────────────────

interface PayoutRow {
  item: IdbTransactionItem;
  tx: IdbTransaction;
  card: IdbCard | undefined;
}

interface Summary {
  gross: number;
  voidsRefunds: number;
  net: number;
  soldCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString("id-ID", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function computeSummary(rows: PayoutRow[]): Summary {
  let gross = 0;
  let voidsRefunds = 0;
  let soldCount = 0;
  for (const { item, tx } of rows) {
    if (tx.kind === "sale") {
      gross += item.soldPriceIdr;
      soldCount++;
    } else {
      voidsRefunds += item.soldPriceIdr;
    }
  }
  return { gross, voidsRefunds, net: gross - voidsRefunds, soldCount };
}

// ── Sub-components ────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: Summary }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
      <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
        Ringkasan
      </p>
      <SRow label="Gross Penjualan">
        <MaskedAmount amount={summary.gross} className="font-extrabold text-lg text-fg" />
      </SRow>
      <SRow label="Void / Refund">
        <MaskedAmount amount={summary.voidsRefunds} className="font-bold text-base text-destructive" />
      </SRow>
      <SRow label="Net">
        <MaskedAmount amount={summary.net} className="font-extrabold text-lg text-success" />
      </SRow>
      <SRow
        label="Kartu Terjual"
        value={<span className="font-bold text-fg">{summary.soldCount}</span>}
      />
    </div>
  );
}

function SRow({
  label,
  children,
  value,
}: {
  label: string;
  children?: React.ReactNode;
  value?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center border-b border-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-fg">{label}</span>
      {children ?? value}
    </div>
  );
}

function TxKindBadge({ kind }: { kind: IdbTransaction["kind"] }) {
  if (kind === "sale") {
    return (
      <span className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-success bg-opacity-15 text-success">
        Jual
      </span>
    );
  }
  return (
    <span className="text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full bg-destructive bg-opacity-15 text-destructive">
      {kind === "void" ? "Void" : "Refund"}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function MyPayoutPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<IdbEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("all");
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Load events for the filter dropdown
  useEffect(() => {
    idb.events.toArray().then((evs) => {
      const sorted = [...evs].sort((a, b) => {
        const order = { active: 0, draft: 1, closed: 2 };
        return (order[a.status] ?? 3) - (order[b.status] ?? 3);
      });
      setEvents(sorted);
    });
  }, []);

  const loadRows = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // All transaction items where this user is the owner
      const items = await idb.transactionItems
        .where("ownerUserIdSnapshot")
        .equals(user.id)
        .toArray();

      if (!items.length) { setRows([]); return; }

      // Batch-fetch transactions and cards
      const txIds = [...new Set(items.map((i) => i.transactionId))];
      const cardIds = [...new Set(items.map((i) => i.cardId))];

      const [txList, cardList] = await Promise.all([
        idb.transactions.bulkGet(txIds),
        idb.cards.bulkGet(cardIds),
      ]);

      const txById: Record<string, IdbTransaction> = {};
      for (const tx of txList) if (tx) txById[tx.id] = tx;

      const cardById: Record<string, IdbCard> = {};
      for (const c of cardList) if (c) cardById[c.id] = c;

      let built: PayoutRow[] = items
        .filter((item) => !!txById[item.transactionId])
        .map((item) => ({
          item,
          tx: txById[item.transactionId]!,
          card: cardById[item.cardId],
        }));

      // Apply event filter
      if (selectedEventId !== "all") {
        built = built.filter((r) => r.tx.eventId === selectedEventId);
      }

      // Sort newest first
      built.sort((a, b) => b.tx.createdAt - a.tx.createdAt);
      setRows(built);
    } finally {
      setLoading(false);
    }
  }, [user, selectedEventId]);

  useEffect(() => { loadRows(); }, [loadRows]);

  const summary = computeSummary(rows);

  const eventName = (id: string) =>
    events.find((e) => e.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <MobileAppBar
        title="Payout Saya"
        back
        onBack={() => navigate(-1)}
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Wallet className="w-5 h-5 text-primary-fg" />
          </div>
          <div>
            <p className="text-sm font-bold text-fg">{user?.displayName}</p>
            <p className="text-xs text-muted-fg">Penjualan kartu milikmu</p>
          </div>
        </div>

        {/* Event filter */}
        <div className="bg-card rounded-2xl border border-border p-3">
          <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1.5">
            Filter Event
          </label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full h-10 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">Semua Event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name} {ev.status === "active" ? "· Aktif" : ev.status === "closed" ? "· Selesai" : "· Draft"}
              </option>
            ))}
          </select>
        </div>

        {/* Summary */}
        {!loading && <SummaryCard summary={summary} />}

        {/* Card list */}
        <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg px-1">
          Rincian ({rows.length} item)
        </p>

        {loading ? (
          <p className="text-sm text-muted-fg text-center py-8">Memuat…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-fg text-center py-8 italic">
            Belum ada penjualan untuk ditampilkan.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ item, tx, card }) => (
              <li
                key={item.id}
                className="bg-card rounded-2xl border border-border px-4 py-3 space-y-2"
              >
                {/* Card title + status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-fg truncate">
                      {card?.title ?? "—"}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-[10px] font-extrabold bg-primary bg-opacity-10 text-primary px-1.5 py-0.5 rounded">
                        {card?.shortId ?? "—"}
                      </span>
                      <span className="text-[10px] text-muted-fg">
                        {eventName(tx.eventId)}
                      </span>
                    </div>
                  </div>
                  <TxKindBadge kind={tx.kind} />
                </div>

                {/* Price row */}
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-fg">{fmt(tx.createdAt)}</span>
                  <div className="text-right">
                    <MaskedAmount
                      amount={item.soldPriceIdr}
                      className={`font-extrabold text-base ${tx.kind === "sale" ? "text-fg" : "text-destructive"}`}
                    />
                    {item.lineDiscountIdr > 0 && (
                      <p className="text-[10px] text-muted-fg">
                        Diskon Rp {item.lineDiscountIdr.toLocaleString("id-ID")}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
