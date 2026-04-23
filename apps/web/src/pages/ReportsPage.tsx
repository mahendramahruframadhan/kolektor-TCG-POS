import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import type { IdbEvent, IdbTransaction, IdbTransactionItem, IdbPaymentChannel } from "../lib/db.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDateLocal(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function toIsoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function formatIdr(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

// ── Types ──────────────────────────────────────────────────────────────────

interface ChannelBreakdown {
  channelId: string;
  channelName: string;
  count: number;
  gross: number;
}

interface TopItem {
  cardId: string;
  cardTitle: string;
  soldPriceIdr: number;
  transactionId: string;
}

interface ReportData {
  date: string;
  eventName: string;
  gross: number;
  voidRefundAmount: number;
  net: number;
  transactionCount: number;
  channelBreakdown: ChannelBreakdown[];
  topItems: TopItem[];
}

// ── CSV export ─────────────────────────────────────────────────────────────

function buildCsv(report: ReportData): string {
  const lines: string[] = [];
  lines.push(`"Laporan Harian / Daily Report"`);
  lines.push(`"Tanggal / Date","${report.date}"`);
  lines.push(`"Event","${report.eventName}"`);
  lines.push(``);
  lines.push(`"Ringkasan / Summary"`);
  lines.push(`"Penjualan Kotor / Gross Sales","${report.gross}"`);
  lines.push(`"Void/Refund","${report.voidRefundAmount}"`);
  lines.push(`"Penjualan Bersih / Net Sales","${report.net}"`);
  lines.push(`"Jumlah Transaksi / Transaction Count","${report.transactionCount}"`);
  lines.push(``);
  lines.push(`"Rincian Pembayaran / Payment Breakdown"`);
  lines.push(`"Channel","Jumlah Transaksi","Total (IDR)"`);
  for (const b of report.channelBreakdown) {
    lines.push(`"${b.channelName}","${b.count}","${b.gross}"`);
  }
  lines.push(``);
  lines.push(`"Top 5 Penjualan / Top 5 Sales"`);
  lines.push(`"Kartu / Card","Harga Jual / Sold Price (IDR)","ID Transaksi"`);
  for (const item of report.topItems) {
    lines.push(`"${item.cardTitle}","${item.soldPriceIdr}","${item.transactionId}"`);
  }
  return lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ReportsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<IdbEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  // Load events from IDB
  useEffect(() => {
    idb.events.toArray().then((list) => {
      setEvents(list);
      const active = list.find((e) => e.status === "active");
      if (active) setSelectedEventId(active.id);
      else if (list.length > 0) setSelectedEventId(list[0]!.id);
    });
  }, []);

  const computeReport = useCallback(async () => {
    if (!selectedEventId || !selectedDate) return;

    setLoading(true);
    try {
      const event = events.find((e) => e.id === selectedEventId);

      // Get all transactions for this event
      const allTxs = await idb.transactions
        .where("eventId")
        .equals(selectedEventId)
        .toArray();

      // Filter by selected date (using createdAt unix timestamp)
      const dayTxs = allTxs.filter((tx) => {
        const d = toIsoDate(tx.createdAt);
        return d === selectedDate;
      });

      const saleTxs = dayTxs.filter((t) => t.kind === "sale");
      const voidRefundTxs = dayTxs.filter(
        (t) => t.kind === "void" || t.kind === "refund"
      );

      const gross = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      const voidRefundAmount = voidRefundTxs.reduce((s, t) => s + t.totalIdr, 0);
      const net = gross - voidRefundAmount;

      // Payment channel breakdown (sales only)
      const channels = await idb.paymentChannels.toArray();
      const channelMap: Record<string, IdbPaymentChannel> = {};
      for (const ch of channels) channelMap[ch.id] = ch;

      const breakdownMap: Record<
        string,
        { channelName: string; count: number; gross: number }
      > = {};
      for (const tx of saleTxs) {
        const chId = tx.paymentChannelId ?? "unknown";
        const chName = channelMap[chId]?.name ?? chId;
        if (!breakdownMap[chId]) {
          breakdownMap[chId] = { channelName: chName, count: 0, gross: 0 };
        }
        breakdownMap[chId]!.count += 1;
        breakdownMap[chId]!.gross += tx.totalIdr;
      }
      const channelBreakdown: ChannelBreakdown[] = Object.entries(
        breakdownMap
      ).map(([channelId, v]) => ({ channelId, ...v }));

      // Top 5 sales by value
      const saleTxIds = saleTxs.map((t) => t.id);
      let txItems: IdbTransactionItem[] = [];
      if (saleTxIds.length > 0) {
        txItems = await idb.transactionItems
          .where("transactionId")
          .anyOf(saleTxIds)
          .toArray();
      }

      // Sort by soldPriceIdr desc, take top 5
      const sorted = [...txItems].sort(
        (a, b) => b.soldPriceIdr - a.soldPriceIdr
      );
      const top5 = sorted.slice(0, 5);

      const cardIds = top5.map((i) => i.cardId);
      const cards = await idb.cards.bulkGet(cardIds);
      const cardTitleMap: Record<string, string> = {};
      for (const c of cards) {
        if (c) cardTitleMap[c.id] = c.title;
      }

      const topItems: TopItem[] = top5.map((item) => ({
        cardId: item.cardId,
        cardTitle: cardTitleMap[item.cardId] ?? item.cardId,
        soldPriceIdr: item.soldPriceIdr,
        transactionId: item.transactionId,
      }));

      setReport({
        date: new Date(selectedDate).toLocaleDateString("id-ID", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        }),
        eventName: event?.name ?? selectedEventId,
        gross,
        voidRefundAmount,
        net,
        transactionCount: saleTxs.length,
        channelBreakdown,
        topItems,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, selectedDate, events]);

  useEffect(() => {
    if (selectedEventId) computeReport();
  }, [selectedEventId, selectedDate, computeReport]);

  function handleExportCsv() {
    if (!report) return;
    const csv = buildCsv(report);
    const filename = `laporan-${selectedDate}-${selectedEventId.slice(0, 8)}.csv`;
    downloadCsv(csv, filename);
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button
          onClick={() => navigate("/dashboard")}
          className="text-sm font-medium opacity-80 hover:opacity-100"
        >
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Laporan / Reports</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
            Filter / Filters
          </p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Event
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Pilih Event --</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {ev.status === "active" ? " (aktif)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Tanggal / Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Report */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8">Menghitung…</p>
        ) : report ? (
          <>
            {/* Summary */}
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Ringkasan / Summary
                </p>
                <button
                  onClick={handleExportCsv}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium border border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50 transition"
                >
                  Ekspor CSV
                </button>
              </div>
              <p className="text-sm text-gray-600">
                {report.date} — {report.eventName}
              </p>
              <div className="divide-y divide-gray-100">
                <ReportRow
                  label="Penjualan Kotor / Gross Sales"
                  value={<MaskedAmount amount={report.gross} className="font-bold text-gray-800" />}
                />
                <ReportRow
                  label="Void / Refund"
                  value={
                    <MaskedAmount
                      amount={report.voidRefundAmount}
                      className="font-semibold text-red-600"
                    />
                  }
                />
                <ReportRow
                  label="Penjualan Bersih / Net Sales"
                  value={
                    <MaskedAmount
                      amount={report.net}
                      className="font-bold text-green-700 text-lg"
                    />
                  }
                />
                <ReportRow
                  label="Jumlah Transaksi / Transaction Count"
                  value={
                    <span className="font-semibold text-gray-800">
                      {report.transactionCount}
                    </span>
                  }
                />
              </div>
            </div>

            {/* Channel breakdown */}
            {report.channelBreakdown.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Rincian Pembayaran / Payment Breakdown
                </p>
                <div className="divide-y divide-gray-100">
                  {report.channelBreakdown.map((b) => (
                    <div
                      key={b.channelId}
                      className="flex justify-between items-center py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          {b.channelName}
                        </p>
                        <p className="text-xs text-gray-400">
                          {b.count} transaksi
                        </p>
                      </div>
                      <MaskedAmount
                        amount={b.gross}
                        className="text-sm font-semibold text-gray-800"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top 5 */}
            {report.topItems.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                  Top 5 Penjualan / Top 5 Sales
                </p>
                <ol className="space-y-2">
                  {report.topItems.map((item, idx) => (
                    <li
                      key={`${item.transactionId}-${item.cardId}`}
                      className="flex items-center gap-3"
                    >
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {item.cardTitle}
                        </p>
                        <p className="text-xs text-gray-400 font-mono">
                          #{item.transactionId.slice(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <MaskedAmount
                        amount={item.soldPriceIdr}
                        className="text-sm font-semibold text-gray-700 shrink-0"
                      />
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {report.transactionCount === 0 && (
              <p className="text-sm text-gray-400 text-center italic py-4">
                Tidak ada transaksi pada tanggal ini.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8 italic">
            Pilih event untuk melihat laporan.
          </p>
        )}
      </div>
    </div>
  );
}

function ReportRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center py-2">
      <span className="text-sm text-gray-600">{label}</span>
      {value}
    </div>
  );
}
