import React, { useId, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { Eye, EyeOff } from "lucide-react";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { MaskedScopeProvider, useMaskedScope } from "../hooks/useMaskedScope.js";
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

function selectCls() {
  return "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary";
}

// ── Sub-page: Daily ────────────────────────────────────────────────────────

function DailyTab({ events }: { events: IdbEvent[] }) {
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
    <div className="space-y-3">
      <SectionCard>
        <SectionLabel>Filter</SectionLabel>
        <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={selectCls()}>
          <option value="">-- Pilih Event --</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.name}{ev.status === "active" ? " (aktif)" : ""}</option>
          ))}
        </select>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className={selectCls()}
        />
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
            <ReportRow label="Penjualan Kotor" value={<MaskedAmount amount={report.gross} className="font-bold text-fg" />} />
            <ReportRow label="Void / Refund" value={<MaskedAmount amount={report.voidRefundAmount} className="font-bold text-destructive" />} />
            <ReportRow label="Penjualan Bersih" value={<MaskedAmount amount={report.net} className="font-extrabold text-success text-lg" />} />
            <ReportRow label="Jumlah Transaksi" value={<span className="font-bold text-fg">{report.transactionCount}</span>} />
          </SectionCard>

          {report.channelBreakdown.length > 0 && (
            <SectionCard>
              <SectionLabel>Rincian Pembayaran</SectionLabel>
              {report.channelBreakdown.map((b) => (
                <div key={b.channelId} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-bold text-fg">{b.channelName}</p>
                    <p className="text-xs text-muted-fg">{b.count} transaksi</p>
                  </div>
                  <MaskedAmount amount={b.gross} className="text-sm font-bold text-fg" />
                </div>
              ))}
            </SectionCard>
          )}

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
                    <MaskedAmount amount={item.soldPriceIdr} className="text-sm font-bold text-fg shrink-0" />
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}

          {report.transactionCount === 0 && (
            <p className="text-sm text-muted-fg text-center italic py-4">Tidak ada transaksi pada tanggal ini.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-page: Monthly ──────────────────────────────────────────────────────

function MonthlyTab() {
  const now = new Date();
  const yearId = useId();
  const monthId = useId();
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
    <div className="space-y-3">
      <SectionCard>
        <div className="flex gap-3">
          <div className="flex-1">
            <label htmlFor={yearId} className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg block mb-1">Tahun</label>
            <input id={yearId} type="number" value={year} min={2020} max={2099}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className={selectCls()} />
          </div>
          <div className="flex-1">
            <label htmlFor={monthId} className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg block mb-1">Bulan</label>
            <input id={monthId} type="number" value={month} min={1} max={12}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className={selectCls()} />
          </div>
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
            <ReportRow label="Gross IDR" value={<MaskedAmount amount={report.grossIdr} className="font-bold text-fg" />} />
            <ReportRow label="Void/Refund IDR" value={<MaskedAmount amount={report.voidRefundIdr} className="font-bold text-destructive" />} />
            <ReportRow label="Net IDR" value={<MaskedAmount amount={report.netIdr} className="font-extrabold text-success text-lg" />} />
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
                  <MaskedAmount amount={day.netIdr} className="text-sm font-bold text-fg" />
                </div>
              ))}
            </SectionCard>
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

            <ReportRow label="Gross Sales" value={<MaskedAmount amount={report.grandTotalSalesIdr} className="font-bold text-fg" />} />
            <ReportRow label="Total Void/Refund" value={<MaskedAmount amount={report.grandTotalVoidsIdr} className="font-bold text-destructive" />} />
            <ReportRow label="Net" value={<MaskedAmount amount={report.netIdr} className="font-extrabold text-success text-lg" />} />
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
                  <MaskedAmount amount={row.totalPayoutIdr} className="text-sm font-extrabold text-fg" />
                </div>
              ))}
            </SectionCard>
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
            <ReportRow label="Nilai Tersedia" value={<MaskedAmount amount={report.availableValueIdr} className="font-bold text-success" />} />
            <ReportRow label="Nilai Ditahan" value={<MaskedAmount amount={report.heldValueIdr} className="font-bold text-warning" />} />
            <ReportRow label="Total Nilai Listed" value={<MaskedAmount amount={report.totalListedValueIdr} className="font-extrabold text-fg text-lg" />} />
          </div>
        </SectionCard>
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
    <MaskedScopeProvider>
      <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
        <MobileAppBar
          title="Laporan"
          back
          onBack={() => navigate("/dashboard")}
          right={<ReportsMaskToggle />}
        />

        {/* Tab bar */}
        <div className="bg-card border-b border-border flex shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 text-xs font-extrabold py-3 tracking-wide transition border-b-2 ${
                tab === t.id
                  ? "text-primary border-primary"
                  : "text-muted-fg border-transparent hover:text-fg"
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
    </MaskedScopeProvider>
  );
}

function ReportsMaskToggle() {
  const scope = useMaskedScope();
  if (!scope) return null;
  const { revealed, toggle } = scope;
  return (
    <button
      onClick={toggle}
      className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition"
      aria-label={revealed ? "Sembunyikan semua nominal" : "Tampilkan semua nominal"}
      title={revealed ? "Sembunyikan nominal" : "Tampilkan nominal"}
    >
      {revealed ? <Eye className="w-5 h-5 text-fg" /> : <EyeOff className="w-5 h-5 text-fg" />}
    </button>
  );
}
