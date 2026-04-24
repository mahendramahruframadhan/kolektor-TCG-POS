import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type { IdbEvent, IdbTransactionItem, IdbCard } from "../lib/db.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function toIsoDate(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function fmtRp(amount: number): string {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function fmtMonth(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", { year: "numeric", month: "long" });
}

function shiftDay(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  if (m > 12) { y += 1; m = 1; }
  if (m < 1) { y -= 1; m = 12; }
  return { year: y, month: m };
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

// ── Report registry ────────────────────────────────────────────────────────

const REPORT_META = [
  {
    code: "R01",
    id: "daily" as const,
    name: "Laporan Harian",
    description: "Ringkasan penjualan per hari berdasarkan event: gross, void/refund, net, top 5 kartu, dan rincian metode pembayaran.",
  },
  {
    code: "R02",
    id: "monthly" as const,
    name: "Laporan Bulanan",
    description: "Agregat penjualan dalam satu bulan: gross, net, rincian per hari, dan rincian metode pembayaran.",
  },
  {
    code: "R03",
    id: "settlement" as const,
    name: "Settlement Event",
    description: "Perhitungan payout per pemilik kartu berdasarkan event. Dapat dikunci permanen oleh admin setelah event selesai.",
  },
  {
    code: "R04",
    id: "inventory" as const,
    name: "Nilai Inventori",
    description: "Nilai stok kartu aktif: tersedia, ditahan, dan terjual berdasarkan harga tayang.",
  },
] as const;

type ReportId = typeof REPORT_META[number]["id"];

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
  channelBreakdown: ChannelBreakdown[];
}

interface MonthlyReport {
  year: number;
  month: number;
  grossIdr: number;
  voidRefundIdr: number;
  netIdr: number;
  transactionCount: number;
  dailyBreakdown: { date: string; grossIdr: number; netIdr: number; count: number }[];
  channelBreakdown: ChannelBreakdown[];
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
  for (const b of report.channelBreakdown) lines.push(`"${b.channelName}","${b.count}","${b.gross}"`);
  lines.push(``);
  lines.push(`"Top 5 Sales"`);
  lines.push(`"Kartu","Harga Jual (IDR)","ID Transaksi"`);
  for (const item of report.topItems) lines.push(`"${item.cardTitle}","${item.soldPriceIdr}","${item.transactionId}"`);
  return lines.join("\n");
}

function buildSettlementCsv(report: SettlementReport): string {
  const lines: string[] = [];
  lines.push(`"Settlement Report"`);
  lines.push(`"Event","${report.eventName}"`);
  lines.push(`"Status","${report.settledAt ? "SETTLED" : "PENDING"}"`);
  if (report.settledAt) lines.push(`"Settled At","${new Date(report.settledAt * 1000).toISOString()}"`);
  lines.push(``);
  lines.push(`"Gross Sales IDR","${report.grandTotalSalesIdr}"`);
  lines.push(`"Total Voids/Refunds IDR","${report.grandTotalVoidsIdr}"`);
  lines.push(`"Net IDR","${report.netIdr}"`);
  lines.push(``);
  lines.push(`"Owner","Items Sold","Payout IDR"`);
  for (const row of report.breakdown) lines.push(`"${row.ownerName}","${row.itemsSold}","${row.totalPayoutIdr}"`);
  if (report.channelBreakdown.length > 0) {
    lines.push(``);
    lines.push(`"Channel","Jumlah","Total (IDR)"`);
    for (const b of report.channelBreakdown) lines.push(`"${b.channelName}","${b.count}","${b.gross}"`);
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
  for (const day of report.dailyBreakdown) lines.push(`"${day.date}","${day.grossIdr}","${day.netIdr}","${day.count}"`);
  if (report.channelBreakdown.length > 0) {
    lines.push(``);
    lines.push(`"Channel","Jumlah","Total (IDR)"`);
    for (const b of report.channelBreakdown) lines.push(`"${b.channelName}","${b.count}","${b.gross}"`);
  }
  return lines.join("\n");
}

// ── Shared sub-components ──────────────────────────────────────────────────

function ReportRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-fg">{label}</span>
      {value}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-3 py-2.5">
      <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">{label}</p>
      <p className="text-base font-extrabold text-fg mt-0.5">{value}</p>
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 space-y-2">
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
      {children}
    </p>
  );
}

function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs font-bold text-accent border border-accent border-opacity-40 rounded-lg px-3 py-1 hover:bg-accent hover:bg-opacity-10 transition"
    >
      Ekspor CSV
    </button>
  );
}

function NavButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-9 h-9 flex items-center justify-center rounded-xl border border-border bg-surface hover:bg-muted transition shrink-0"
    >
      {children}
    </button>
  );
}

function selectCls() {
  return "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary";
}

function ChannelBreakdownCard({ breakdown }: { breakdown: ChannelBreakdown[] }) {
  if (breakdown.length === 0) return null;
  return (
    <SectionCard>
      <SectionLabel>Rincian per Metode Pembayaran</SectionLabel>
      {breakdown.map((b) => (
        <div key={b.channelId} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
          <div>
            <p className="text-sm font-bold text-fg">{b.channelName}</p>
            <p className="text-xs text-muted-fg">{b.count} transaksi</p>
          </div>
          <span className="text-sm font-bold text-fg">{fmtRp(b.gross)}</span>
        </div>
      ))}
    </SectionCard>
  );
}

// ── Master list ────────────────────────────────────────────────────────────

function ReportListPage({ onSelect }: { onSelect: (id: ReportId) => void }) {
  return (
    <div className="space-y-3">
      {REPORT_META.map((r) => (
        <button
          key={r.id}
          onClick={() => onSelect(r.id)}
          className="w-full text-left bg-card rounded-2xl border border-border p-4 hover:border-primary hover:bg-primary hover:bg-opacity-5 transition group"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">{r.code}</p>
              <p className="text-base font-bold text-fg group-hover:text-primary transition">{r.name}</p>
              <p className="text-sm text-muted-fg mt-1 leading-snug">{r.description}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-fg group-hover:text-primary transition shrink-0 mt-1" />
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Detail: Daily ──────────────────────────────────────────────────────────

function DailyDetail({ events }: { events: IdbEvent[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
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
      const voidRefundAmount = voidRefundTxs.reduce((s, t) => s + Math.abs(t.totalIdr), 0);

      const channels = await idb.paymentChannels.toArray();
      const channelMap: Record<string, string> = {};
      for (const ch of channels) channelMap[ch.id] = ch.name;

      const breakdownMap: Record<string, { channelName: string; count: number; gross: number }> = {};
      for (const tx of saleTxs) {
        const chId = tx.paymentChannelId ?? "unknown";
        const chName = channelMap[chId] ?? chId;
        if (!breakdownMap[chId]) breakdownMap[chId] = { channelName: chName, count: 0, gross: 0 };
        breakdownMap[chId]!.count += 1;
        breakdownMap[chId]!.gross += tx.totalIdr;
      }
      const channelBreakdown: ChannelBreakdown[] = Object.entries(breakdownMap).map(([channelId, v]) => ({ channelId, ...v }));

      const saleTxIds = saleTxs.map((t) => t.id);
      let txItems: IdbTransactionItem[] = [];
      if (saleTxIds.length > 0) txItems = await idb.transactionItems.where("transactionId").anyOf(saleTxIds).toArray();
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
        gross, voidRefundAmount, net: gross - voidRefundAmount,
        transactionCount: saleTxs.length,
        channelBreakdown, topItems,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, selectedDate, events]);

  useEffect(() => { if (selectedEventId) computeReport(); }, [selectedEventId, selectedDate, computeReport]);

  return (
    <div className="space-y-3">
      <SectionCard>
        <SectionLabel>Filter</SectionLabel>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={selectCls()}>
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}{ev.status === "active" ? " (aktif)" : ""}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <NavButton onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </NavButton>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={selectCls()}
          />
          <NavButton onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </NavButton>
        </div>
      </SectionCard>

      {loading && <p className="text-sm text-muted-fg text-center py-6">Menghitung…</p>}
      {!loading && report && (
        <>
          <SectionCard>
            <div className="flex items-center justify-between">
              <SectionLabel>Ringkasan</SectionLabel>
              <CsvButton onClick={() => downloadCsv(buildDailyCsv(report), `laporan-harian-${selectedDate}.csv`)} />
            </div>
            <p className="text-xs text-muted-fg">{report.date} — {report.eventName}</p>
            <ReportRow label="Penjualan Kotor" value={<span className="font-bold text-fg">{fmtRp(report.gross)}</span>} />
            <ReportRow label="Void / Refund" value={<span className="font-bold text-destructive">{fmtRp(report.voidRefundAmount)}</span>} />
            <ReportRow label="Penjualan Bersih" value={<span className="font-extrabold text-success text-lg">{fmtRp(report.net)}</span>} />
            <ReportRow label="Jumlah Transaksi" value={<span className="font-bold text-fg">{report.transactionCount}</span>} />
          </SectionCard>

          {report.topItems.length > 0 && (
            <SectionCard>
              <SectionLabel>Top 5 Penjualan</SectionLabel>
              <ol className="space-y-2 mt-1">
                {report.topItems.map((item, idx) => (
                  <li key={`${item.transactionId}-${item.cardId}`} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary bg-opacity-15 text-primary text-xs font-extrabold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-fg truncate">{item.cardTitle}</p>
                      <p className="text-xs text-muted-fg font-mono">#{item.transactionId.slice(0, 8).toUpperCase()}</p>
                    </div>
                    <span className="text-sm font-bold text-fg shrink-0">{fmtRp(item.soldPriceIdr)}</span>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          <ChannelBreakdownCard breakdown={report.channelBreakdown} />

          {report.transactionCount === 0 && (
            <p className="text-sm text-muted-fg text-center italic py-4">Tidak ada transaksi pada tanggal ini.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Detail: Monthly ────────────────────────────────────────────────────────

function MonthlyDetail() {
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

  function nav(delta: number) {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  const monthStr = `${year}-${String(month).padStart(2, "0")}`;

  return (
    <div className="space-y-3">
      <SectionCard>
        <div className="flex items-center gap-2">
          <NavButton onClick={() => nav(-1)}><ChevronLeft className="w-4 h-4" /></NavButton>
          <div className="flex-1 h-11 flex items-center justify-center bg-surface border border-border rounded-xl">
            <span className="text-sm font-bold text-fg">{fmtMonth(year, month)}</span>
          </div>
          <NavButton onClick={() => nav(1)}><ChevronRight className="w-4 h-4" /></NavButton>
        </div>
      </SectionCard>

      {loading && <p className="text-sm text-muted-fg text-center py-6">Memuat…</p>}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      {!loading && report && (
        <>
          <SectionCard>
            <div className="flex items-center justify-between">
              <SectionLabel>Ringkasan Bulanan</SectionLabel>
              <CsvButton onClick={() => downloadCsv(buildMonthlyCsv(report), `laporan-bulanan-${monthStr}.csv`)} />
            </div>
            <ReportRow label="Gross IDR" value={<span className="font-bold text-fg">{fmtRp(report.grossIdr)}</span>} />
            <ReportRow label="Void/Refund IDR" value={<span className="font-bold text-destructive">{fmtRp(report.voidRefundIdr)}</span>} />
            <ReportRow label="Net IDR" value={<span className="font-extrabold text-success text-lg">{fmtRp(report.netIdr)}</span>} />
            <ReportRow label="Total Transaksi" value={<span className="font-bold text-fg">{report.transactionCount}</span>} />
          </SectionCard>

          {report.dailyBreakdown.length > 0 && (
            <SectionCard>
              <SectionLabel>Per Hari</SectionLabel>
              {report.dailyBreakdown.map((day) => (
                <div key={day.date} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-bold text-fg">{day.date}</p>
                    <p className="text-xs text-muted-fg">{day.count} transaksi</p>
                  </div>
                  <span className="text-sm font-bold text-fg">{fmtRp(day.netIdr)}</span>
                </div>
              ))}
            </SectionCard>
          )}

          <ChannelBreakdownCard breakdown={report.channelBreakdown ?? []} />
        </>
      )}
    </div>
  );
}

// ── Detail: Settlement ─────────────────────────────────────────────────────

function SettlementDetail({ events, userRole }: { events: IdbEvent[]; userRole: string }) {
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
    <div className="space-y-3">
      <SectionCard>
        <SectionLabel>Event</SectionLabel>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={selectCls()}>
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
          ))}
        </select>
      </SectionCard>

      {loading && <p className="text-sm text-muted-fg text-center py-6">Memuat…</p>}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      {!loading && report && (
        <>
          <SectionCard>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <SectionLabel>Settlement — {report.eventName}</SectionLabel>
              <div className="flex gap-2">
                <CsvButton onClick={() => downloadCsv(buildSettlementCsv(report), `settlement-${selectedEventId.slice(0, 8)}.csv`)} />
                {userRole === "admin" && !report.settledAt && events.find((e) => e.id === selectedEventId)?.status === "closed" && (
                  <button
                    onClick={handleSettle}
                    disabled={settling}
                    className="text-xs font-bold bg-success text-white rounded-lg px-3 py-1 disabled:opacity-50 hover:opacity-90 transition"
                  >
                    {settling ? "Mengunci…" : "Kunci Settlement"}
                  </button>
                )}
              </div>
            </div>

            {report.settledAt && (
              <div className="bg-success bg-opacity-10 border border-success border-opacity-30 rounded-xl px-3 py-2 text-xs font-bold text-success">
                SETTLED — {new Date(report.settledAt * 1000).toLocaleString("id-ID")}
              </div>
            )}

            <ReportRow label="Gross Sales" value={<span className="font-bold text-fg">{fmtRp(report.grandTotalSalesIdr)}</span>} />
            <ReportRow label="Total Void/Refund" value={<span className="font-bold text-destructive">{fmtRp(report.grandTotalVoidsIdr)}</span>} />
            <ReportRow label="Net" value={<span className="font-extrabold text-success text-lg">{fmtRp(report.netIdr)}</span>} />
          </SectionCard>

          {report.breakdown.length > 0 && (
            <SectionCard>
              <SectionLabel>Payout per Pemilik</SectionLabel>
              {report.breakdown.map((row) => (
                <div key={row.ownerId} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-bold text-fg">{row.ownerName}</p>
                    <p className="text-xs text-muted-fg">{row.itemsSold} kartu terjual</p>
                  </div>
                  <span className="text-sm font-extrabold text-fg">{fmtRp(row.totalPayoutIdr)}</span>
                </div>
              ))}
            </SectionCard>
          )}

          <ChannelBreakdownCard breakdown={report.channelBreakdown ?? []} />
        </>
      )}
    </div>
  );
}

// ── Detail: Inventory ──────────────────────────────────────────────────────

function InventoryDetail({ events }: { events: IdbEvent[] }) {
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
      const eventCards = await idb.cards
        .filter((c) => !c.eventId || c.eventId === selectedEventId)
        .toArray();

      const available = eventCards.filter((c) => c.status === "available");
      const held = eventCards.filter((c) => c.status === "held");
      const sold = eventCards.filter((c) => c.status === "sold");

      const sumPrice = (list: IdbCard[]) =>
        list.reduce((s, c) => s + (c.listedPriceIdr ?? c.priceIdr ?? 0), 0);

      setReport({
        eventId: selectedEventId,
        totalCards: eventCards.length,
        availableCount: available.length,
        heldCount: held.length,
        soldCount: sold.length,
        availableValueIdr: sumPrice(available),
        heldValueIdr: sumPrice(held),
        soldValueIdr: sumPrice(sold),
        totalListedValueIdr: sumPrice(eventCards),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat inventori.");
    } finally {
      setLoading(false);
    }
  }, [selectedEventId]);

  useEffect(() => { if (selectedEventId) load(); }, [selectedEventId, load]);

  return (
    <div className="space-y-3">
      <SectionCard>
        <SectionLabel>Event</SectionLabel>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={selectCls()}>
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name} ({ev.status})</option>
          ))}
        </select>
      </SectionCard>

      {loading && <p className="text-sm text-muted-fg text-center py-6">Memuat…</p>}
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      {!loading && report && (
        <SectionCard>
          <SectionLabel>Nilai Inventori</SectionLabel>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Stat label="Total Kartu" value={String(report.totalCards)} />
            <Stat label="Tersedia" value={String(report.availableCount)} />
            <Stat label="Ditahan" value={String(report.heldCount)} />
            <Stat label="Terjual" value={String(report.soldCount)} />
          </div>
          <div className="pt-2 space-y-1 border-t border-border mt-2">
            <ReportRow label="Nilai Tersedia" value={<span className="font-bold text-success">{fmtRp(report.availableValueIdr)}</span>} />
            <ReportRow label="Nilai Ditahan" value={<span className="font-bold text-warning">{fmtRp(report.heldValueIdr)}</span>} />
            <ReportRow label="Total Nilai Listed" value={<span className="font-extrabold text-fg text-lg">{fmtRp(report.totalListedValueIdr)}</span>} />
          </div>
        </SectionCard>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export function ReportsPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [activeReport, setActiveReport] = useState<ReportId | null>(null);
  const [events, setEvents] = useState<IdbEvent[]>([]);

  useEffect(() => {
    idb.events.toArray().then(setEvents);
  }, []);

  const activeMeta = REPORT_META.find((r) => r.id === activeReport);

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title={activeMeta ? activeMeta.name : "Laporan"}
        back
        onBack={activeReport ? () => setActiveReport(null) : () => navigate("/dashboard")}
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4">
        {!activeReport && (
          <ReportListPage onSelect={setActiveReport} />
        )}
        {activeReport === "daily" && <DailyDetail events={events} />}
        {activeReport === "monthly" && <MonthlyDetail />}
        {activeReport === "settlement" && <SettlementDetail events={events} userRole={user?.role ?? ""} />}
        {activeReport === "inventory" && <InventoryDetail events={events} />}
      </div>
    </div>
  );
}
