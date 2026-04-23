import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import type { IdbEvent, IdbTransaction, IdbTransactionItem, IdbPaymentChannel } from "../lib/db.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function toIsoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
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

interface DailyReport {
  date: string;
  eventName: string;
  gross: number;
  voidRefundAmount: number;
  net: number;
  transactionCount: number;
  channelBreakdown: ChannelBreakdown[];
  topItems: TopItem[];
}

interface OwnerPayout {
  ownerId: string;
  ownerName: string;
  totalPayoutIdr: number;
  itemsSold: number;
}

interface SettlementReport {
  eventId: string;
  eventName: string;
  settledAt: number | null;
  settledByUserId: string | null;
  grandTotalSalesIdr: number;
  grandTotalVoidsIdr: number;
  netIdr: number;
  breakdown: OwnerPayout[];
}

interface MonthlyReport {
  year: number;
  month: number;
  grossIdr: number;
  voidRefundIdr: number;
  netIdr: number;
  transactionCount: number;
  dailyBreakdown: { date: string; grossIdr: number; netIdr: number; count: number }[];
}

interface InventoryReport {
  eventId: string;
  totalCards: number;
  availableCount: number;
  heldCount: number;
  soldCount: number;
  availableValueIdr: number;
  heldValueIdr: number;
  soldValueIdr: number;
  totalListedValueIdr: number;
}

// ── CSV builders ───────────────────────────────────────────────────────────

function buildDailyCsv(report: DailyReport): string {
  const lines: string[] = [];
  lines.push(`"Laporan Harian / Daily Report"`);
  lines.push(`"Tanggal / Date","${report.date}"`);
  lines.push(`"Event","${report.eventName}"`);
  lines.push(``);
  lines.push(`"Penjualan Kotor","${report.gross}"`);
  lines.push(`"Void/Refund","${report.voidRefundAmount}"`);
  lines.push(`"Penjualan Bersih","${report.net}"`);
  lines.push(`"Jumlah Transaksi","${report.transactionCount}"`);
  lines.push(``);
  lines.push(`"Channel","Jumlah","Total (IDR)"`);
  for (const b of report.channelBreakdown) {
    lines.push(`"${b.channelName}","${b.count}","${b.gross}"`);
  }
  lines.push(``);
  lines.push(`"Top 5 Sales"`);
  lines.push(`"Kartu","Harga Jual (IDR)","ID Transaksi"`);
  for (const item of report.topItems) {
    lines.push(`"${item.cardTitle}","${item.soldPriceIdr}","${item.transactionId}"`);
  }
  return lines.join("\n");
}

function buildSettlementCsv(report: SettlementReport): string {
  const lines: string[] = [];
  lines.push(`"Settlement Report"`);
  lines.push(`"Event","${report.eventName}"`);
  lines.push(`"Status","${report.settledAt ? "SETTLED" : "PENDING"}"`);
  if (report.settledAt) {
    lines.push(`"Settled At","${new Date(report.settledAt * 1000).toISOString()}"`);
  }
  lines.push(``);
  lines.push(`"Gross Sales IDR","${report.grandTotalSalesIdr}"`);
  lines.push(`"Total Voids/Refunds IDR","${report.grandTotalVoidsIdr}"`);
  lines.push(`"Net IDR","${report.netIdr}"`);
  lines.push(``);
  lines.push(`"Owner","Items Sold","Payout IDR"`);
  for (const row of report.breakdown) {
    lines.push(`"${row.ownerName}","${row.itemsSold}","${row.totalPayoutIdr}"`);
  }
  return lines.join("\n");
}

function buildMonthlyCsv(report: MonthlyReport): string {
  const monthStr = `${report.year}-${String(report.month).padStart(2, "0")}`;
  const lines: string[] = [];
  lines.push(`"Laporan Bulanan / Monthly Report"`);
  lines.push(`"Bulan / Month","${monthStr}"`);
  lines.push(``);
  lines.push(`"Gross IDR","${report.grossIdr}"`);
  lines.push(`"Void/Refund IDR","${report.voidRefundIdr}"`);
  lines.push(`"Net IDR","${report.netIdr}"`);
  lines.push(`"Total Transaksi","${report.transactionCount}"`);
  lines.push(``);
  lines.push(`"Tanggal","Gross IDR","Net IDR","Transaksi"`);
  for (const day of report.dailyBreakdown) {
    lines.push(`"${day.date}","${day.grossIdr}","${day.netIdr}","${day.count}"`);
  }
  return lines.join("\n");
}

// ── Sub-page: Daily ────────────────────────────────────────────────────────

function DailyTab({ events }: { events: IdbEvent[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (events.length > 0) {
      const active = events.find((e) => e.status === "active");
      setSelectedEventId(active?.id ?? events[0]!.id);
    }
  }, [events]);

  const computeReport = useCallback(async () => {
    if (!selectedEventId || !selectedDate) return;
    setLoading(true);
    try {
      const event = events.find((e) => e.id === selectedEventId);
      const allTxs = await idb.transactions.where("eventId").equals(selectedEventId).toArray();
      const dayTxs = allTxs.filter((tx) => toIsoDate(tx.createdAt) === selectedDate);

      const saleTxs = dayTxs.filter((t) => t.kind === "sale");
      const voidRefundTxs = dayTxs.filter((t) => t.kind === "void" || t.kind === "refund");

      const gross = saleTxs.reduce((s, t) => s + t.totalIdr, 0);
      const voidRefundAmount = voidRefundTxs.reduce((s, t) => s + t.totalIdr, 0);
      const net = gross - voidRefundAmount;

      const channels = await idb.paymentChannels.toArray();
      const channelMap: Record<string, IdbPaymentChannel> = {};
      for (const ch of channels) channelMap[ch.id] = ch;

      const breakdownMap: Record<string, { channelName: string; count: number; gross: number }> = {};
      for (const tx of saleTxs) {
        const chId = tx.paymentChannelId ?? "unknown";
        const chName = channelMap[chId]?.name ?? chId;
        if (!breakdownMap[chId]) breakdownMap[chId] = { channelName: chName, count: 0, gross: 0 };
        breakdownMap[chId]!.count += 1;
        breakdownMap[chId]!.gross += tx.totalIdr;
      }
      const channelBreakdown: ChannelBreakdown[] = Object.entries(breakdownMap).map(
        ([channelId, v]) => ({ channelId, ...v })
      );

      const saleTxIds = saleTxs.map((t) => t.id);
      let txItems: IdbTransactionItem[] = [];
      if (saleTxIds.length > 0) {
        txItems = await idb.transactionItems.where("transactionId").anyOf(saleTxIds).toArray();
      }
      const sorted = [...txItems].sort((a, b) => b.soldPriceIdr - a.soldPriceIdr).slice(0, 5);
      const cardIds = sorted.map((i) => i.cardId);
      const cardList = await idb.cards.bulkGet(cardIds);
      const cardTitleMap: Record<string, string> = {};
      for (const c of cardList) if (c) cardTitleMap[c.id] = c.title;

      const topItems: TopItem[] = sorted.map((item) => ({
        cardId: item.cardId,
        cardTitle: cardTitleMap[item.cardId] ?? item.cardId,
        soldPriceIdr: item.soldPriceIdr,
        transactionId: item.transactionId,
      }));

      setReport({
        date: new Date(selectedDate).toLocaleDateString("id-ID", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
        eventName: event?.name ?? selectedEventId,
        gross, voidRefundAmount, net,
        transactionCount: saleTxs.length,
        channelBreakdown, topItems,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, selectedDate, events]);

  useEffect(() => { if (selectedEventId) computeReport(); }, [selectedEventId, selectedDate, computeReport]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Filter</p>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}{ev.status === "active" ? " (aktif)" : ""}</option>
          ))}
        </select>
        <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Menghitung…</p>}
      {!loading && report && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Ringkasan</p>
              <button onClick={() => downloadCsv(buildDailyCsv(report), `laporan-harian-${selectedDate}.csv`)}
                className="text-xs text-blue-600 border border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
                Ekspor CSV
              </button>
            </div>
            <p className="text-sm text-gray-500">{report.date} — {report.eventName}</p>
            <ReportRow label="Penjualan Kotor" value={<MaskedAmount amount={report.gross} className="font-bold text-gray-800" />} />
            <ReportRow label="Void / Refund" value={<MaskedAmount amount={report.voidRefundAmount} className="font-semibold text-red-600" />} />
            <ReportRow label="Penjualan Bersih" value={<MaskedAmount amount={report.net} className="font-bold text-green-700 text-lg" />} />
            <ReportRow label="Jumlah Transaksi" value={<span className="font-semibold">{report.transactionCount}</span>} />
          </div>

          {report.channelBreakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Rincian Pembayaran</p>
              {report.channelBreakdown.map((b) => (
                <div key={b.channelId} className="flex justify-between items-center py-1">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{b.channelName}</p>
                    <p className="text-xs text-gray-400">{b.count} transaksi</p>
                  </div>
                  <MaskedAmount amount={b.gross} className="text-sm font-semibold text-gray-800" />
                </div>
              ))}
            </div>
          )}

          {report.topItems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Top 5 Penjualan</p>
              <ol className="space-y-2">
                {report.topItems.map((item, idx) => (
                  <li key={`${item.transactionId}-${item.cardId}`} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.cardTitle}</p>
                      <p className="text-xs text-gray-400 font-mono">#{item.transactionId.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <MaskedAmount amount={item.soldPriceIdr} className="text-sm font-semibold text-gray-700 shrink-0" />
                  </li>
                ))}
              </ol>
            </div>
          )}

          {report.transactionCount === 0 && (
            <p className="text-sm text-gray-400 text-center italic py-4">Tidak ada transaksi pada tanggal ini.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-page: Monthly ──────────────────────────────────────────────────────

function MonthlyTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.monthly(year, month) as MonthlyReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat laporan.");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4 flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-500 font-medium">Tahun</label>
          <input type="number" value={year} min={2020} max={2099}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500 font-medium">Bulan</label>
          <input type="number" value={month} min={1} max={12}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Memuat…</p>}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      {!loading && report && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Ringkasan Bulanan</p>
              <button onClick={() => downloadCsv(buildMonthlyCsv(report), `laporan-bulanan-${monthStr}.csv`)}
                className="text-xs text-blue-600 border border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
                Ekspor CSV
              </button>
            </div>
            <ReportRow label="Gross IDR" value={<MaskedAmount amount={report.grossIdr} className="font-bold text-gray-800" />} />
            <ReportRow label="Void/Refund IDR" value={<MaskedAmount amount={report.voidRefundIdr} className="font-semibold text-red-600" />} />
            <ReportRow label="Net IDR" value={<MaskedAmount amount={report.netIdr} className="font-bold text-green-700 text-lg" />} />
            <ReportRow label="Total Transaksi" value={<span className="font-semibold">{report.transactionCount}</span>} />
          </div>

          {report.dailyBreakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Per Hari</p>
              {report.dailyBreakdown.map((day) => (
                <div key={day.date} className="flex justify-between items-center py-1 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{day.date}</p>
                    <p className="text-xs text-gray-400">{day.count} transaksi</p>
                  </div>
                  <MaskedAmount amount={day.netIdr} className="text-sm font-semibold text-gray-800" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-page: Settlement ───────────────────────────────────────────────────

function SettlementTab({ events, userRole }: { events: IdbEvent[]; userRole: string }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [report, setReport] = useState<SettlementReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (events.length > 0) {
      const closed = events.find((e) => e.status === "closed");
      const first = closed ?? events[0];
      if (first) setSelectedEventId(first.id);
    }
  }, [events]);

  const load = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.settlement(selectedEventId) as SettlementReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat settlement.");
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => { if (selectedEventId) load(); }, [selectedEventId, load]);

  async function handleSettle() {
    if (!selectedEventId || !report) return;
    setSettling(true);
    setError(null);
    try {
      await api.reports.settleEvent(selectedEventId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunci settlement.");
    } finally {
      setSettling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <label className="text-xs text-gray-500 font-medium block mb-1">Event</label>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Memuat…</p>}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      {!loading && report && (
        <>
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Settlement — {report.eventName}</p>
              <div className="flex gap-2">
                <button onClick={() => downloadCsv(buildSettlementCsv(report), `settlement-${selectedEventId.slice(0, 8)}.csv`)}
                  className="text-xs text-blue-600 border border-blue-300 rounded-lg px-3 py-1 hover:bg-blue-50 transition">
                  CSV
                </button>
                {userRole === "admin" && !report.settledAt && events.find((e) => e.id === selectedEventId)?.status === "closed" && (
                  <button onClick={handleSettle} disabled={settling}
                    className="text-xs bg-green-600 text-white rounded-lg px-3 py-1 disabled:opacity-50">
                    {settling ? "Mengunci…" : "Kunci Settlement"}
                  </button>
                )}
              </div>
            </div>

            {report.settledAt && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                SETTLED — {new Date(report.settledAt * 1000).toLocaleString("id-ID")}
              </div>
            )}

            <ReportRow label="Gross Sales" value={<MaskedAmount amount={report.grandTotalSalesIdr} className="font-bold text-gray-800" />} />
            <ReportRow label="Total Void/Refund" value={<MaskedAmount amount={report.grandTotalVoidsIdr} className="font-semibold text-red-600" />} />
            <ReportRow label="Net" value={<MaskedAmount amount={report.netIdr} className="font-bold text-green-700 text-lg" />} />
          </div>

          {report.breakdown.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-4 space-y-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Payout per Pemilik</p>
              {report.breakdown.map((row) => (
                <div key={row.ownerId} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{row.ownerName}</p>
                    <p className="text-xs text-gray-400">{row.itemsSold} kartu terjual</p>
                  </div>
                  <MaskedAmount amount={row.totalPayoutIdr} className="text-sm font-bold text-gray-800" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-page: Inventory Value ──────────────────────────────────────────────

function InventoryTab({ events }: { events: IdbEvent[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [report, setReport] = useState<InventoryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (events.length > 0) {
      const active = events.find((e) => e.status === "active");
      setSelectedEventId(active?.id ?? events[0]!.id);
    }
  }, [events]);

  const load = useCallback(async () => {
    if (!selectedEventId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.reports.inventoryValue(selectedEventId) as InventoryReport;
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat inventori.");
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => { if (selectedEventId) load(); }, [selectedEventId, load]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl shadow-sm p-4">
        <label className="text-xs text-gray-500 font-medium block mb-1">Event</label>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-gray-400 text-center py-8">Memuat…</p>}
      {error && <p className="text-sm text-red-600 text-center">{error}</p>}
      {!loading && report && (
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Nilai Inventori</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Total Kartu" value={String(report.totalCards)} />
            <Stat label="Tersedia" value={String(report.availableCount)} />
            <Stat label="Ditahan" value={String(report.heldCount)} />
            <Stat label="Terjual" value={String(report.soldCount)} />
          </div>
          <div className="pt-2 space-y-2 border-t border-gray-100">
            <ReportRow label="Nilai Tersedia" value={<MaskedAmount amount={report.availableValueIdr} className="font-bold text-green-700" />} />
            <ReportRow label="Nilai Ditahan" value={<MaskedAmount amount={report.heldValueIdr} className="font-semibold text-yellow-700" />} />
            <ReportRow label="Total Nilai Listed" value={<MaskedAmount amount={report.totalListedValueIdr} className="font-bold text-gray-800 text-lg" />} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

type Tab = "daily" | "monthly" | "settlement" | "inventory";

export function ReportsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("daily");
  const [events, setEvents] = useState<IdbEvent[]>([]);

  useEffect(() => {
    idb.events.toArray().then(setEvents);
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "daily", label: "Harian" },
    { id: "monthly", label: "Bulanan" },
    { id: "settlement", label: "Settlement" },
    { id: "inventory", label: "Inventori" },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => navigate("/dashboard")} className="text-sm font-medium opacity-80 hover:opacity-100">
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Laporan / Reports</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 flex shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 text-sm font-medium py-3 transition ${
              tab === t.id
                ? "text-blue-700 border-b-2 border-blue-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4">
        {tab === "daily" && <DailyTab events={events} />}
        {tab === "monthly" && <MonthlyTab />}
        {tab === "settlement" && <SettlementTab events={events} userRole={user?.role ?? ""} />}
        {tab === "inventory" && <InventoryTab events={events} />}
      </div>
    </div>
  );
}

// ── Shared components ──────────────────────────────────────────────────────

function ReportRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      {value}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-base font-bold text-gray-800">{value}</p>
    </div>
  );
}
