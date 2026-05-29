import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Filter } from "lucide-react";
import { idb } from "../lib/db.js";
import { fmt } from "../lib/format.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import type {
  IdbTransaction, IdbTransactionItem,
  IdbEvent, IdbUser, IdbPaymentChannel,
} from "../lib/db.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface Lookups {
  events: IdbEvent[];
  users: IdbUser[];
  channels: IdbPaymentChannel[];
}

interface EnrichedTx {
  tx: IdbTransaction;
  cashierName: string;
  channelName: string;
  itemCount: number;
  ownerNames: string;
}

interface Filters {
  dateFrom: string;
  dateTo: string;
  eventId: string;
  kind: "" | "sale" | "void" | "refund";
  ownerId: string;
  paymentChannelId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayStartSec(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T00:00:00+07:00").getTime() / 1000);
}

function dayEndSec(dateStr: string): number {
  return Math.floor(new Date(dateStr + "T23:59:59+07:00").getTime() / 1000);
}

function defaultFilters(): Filters {
  const today = todayIso();
  return { dateFrom: today, dateTo: today, eventId: "", kind: "", ownerId: "", paymentChannelId: "" };
}

function activeFilterCount(f: Filters): number {
  const d = defaultFilters();
  return (
    (f.dateFrom !== d.dateFrom ? 1 : 0) +
    (f.dateTo !== d.dateTo ? 1 : 0) +
    (f.eventId ? 1 : 0) +
    (f.kind ? 1 : 0) +
    (f.ownerId ? 1 : 0) +
    (f.paymentChannelId ? 1 : 0)
  );
}

const PAGE_SIZE = 50;

// ── TxRow ──────────────────────────────────────────────────────────────────

function kindLabel(kind: string): string {
  if (kind === "void") return "Void";
  if (kind === "refund") return "Refund";
  return "Penjualan";
}

function kindBadgeClass(kind: string): string {
  if (kind === "void") return "bg-destructive/10 text-destructive";
  if (kind === "refund") return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

interface TxRowProps {
  tx: IdbTransaction;
  cashierName: string;
  channelName: string;
  itemCount: number;
  ownerNames: string;
}

function TxRow({ tx, cashierName, channelName, itemCount, ownerNames }: TxRowProps) {
  const dateStr = fmt(tx.createdAt);
  return (
    <li className="bg-card border border-border rounded-2xl p-3 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-fg font-mono">{tx.id.slice(0, 8)}…</span>
        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${kindBadgeClass(tx.kind)}`}>
          {kindLabel(tx.kind)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-fg">Rp {(tx.totalIdr ?? 0).toLocaleString("id-ID")}</span>
        <span className="text-xs text-muted-fg">{channelName}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-fg">
        <span>{itemCount} item · {ownerNames}</span>
        <span>{cashierName}</span>
      </div>
      <div className="text-[11px] text-muted-fg">{dateStr}</div>
    </li>
  );
}

export function TransactionListPage() {
  const navigate = useNavigate();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [allResults, setAllResults] = useState<EnrichedTx[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load lookup tables once
  useEffect(() => {
    Promise.all([
      idb.events.toArray(),
      idb.users.toArray(),
      idb.paymentChannels.toArray(),
    ]).then(([events, users, channels]) => setLookups({ events, users, channels }));
  }, []);

  const runQuery = useCallback(async (f: Filters, lk: Lookups) => {
    setLoading(true);
    try {
      const fromSec = dayStartSec(f.dateFrom);
      const toSec = dayEndSec(f.dateTo);

      // ── Fetch raw transactions ──────────────────────────────────────────
      let rawTxs: (IdbTransaction | undefined)[];

      if (f.ownerId) {
        // Path A: owner filter — go through transactionItems index
        const items = await idb.transactionItems
          .where("ownerUserIdSnapshot").equals(f.ownerId)
          .toArray();
        const txIds = [...new Set(items.map((i) => i.transactionId))];
        rawTxs = await idb.transactions.bulkGet(txIds);
      } else if (f.eventId) {
        // Path B: event filter — use eventId index
        rawTxs = await idb.transactions.where("eventId").equals(f.eventId).toArray();
      } else {
        // Path C: full scan
        rawTxs = await idb.transactions.toArray();
      }

      // ── JS filter ──────────────────────────────────────────────────────
      const filtered = (rawTxs.filter(Boolean) as IdbTransaction[]).filter((tx) => {
        if (tx.createdAt < fromSec || tx.createdAt > toSec) return false;
        if (f.eventId && tx.eventId !== f.eventId) return false;
        if (f.kind && tx.kind !== f.kind) return false;
        if (f.paymentChannelId && tx.paymentChannelId !== f.paymentChannelId) return false;
        return true;
      });

      // ── Sort descending by createdAt ───────────────────────────────────
      filtered.sort((a, b) => b.createdAt - a.createdAt);

      // ── Enrich ────────────────────────────────────────────────────────
      const userMap = Object.fromEntries(lk.users.map((u) => [u.id, u.displayName]));
      const channelMap = Object.fromEntries(lk.channels.map((c) => [c.id, c.name]));

      // Fetch all items for filtered transactions in one query per tx
      const enriched: EnrichedTx[] = await Promise.all(
        filtered.map(async (tx) => {
          const items: IdbTransactionItem[] = await idb.transactionItems
            .where("transactionId").equals(tx.id)
            .toArray();
          const ownerIds = [...new Set(items.map((i) => i.ownerUserIdSnapshot))];
          const ownerNames = ownerIds.map((id) => userMap[id] ?? id.slice(0, 6)).join(", ");
          return {
            tx,
            cashierName: userMap[tx.cashierUserId] ?? tx.cashierUserId.slice(0, 6),
            channelName: tx.paymentChannelId ? (channelMap[tx.paymentChannelId] ?? "—") : "—",
            itemCount: items.length,
            ownerNames,
          };
        })
      );

      setAllResults(enriched);
      setVisibleCount(PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced re-query on filter or lookup change
  useEffect(() => {
    if (!lookups) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runQuery(filters, lookups), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters, lookups, runQuery]);

  const visible = allResults.slice(0, visibleCount);
  const hasMore = visibleCount < allResults.length;
  const activeCount = activeFilterCount(filters);

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Riwayat Transaksi" back onBack={() => navigate(-1)} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-3 space-y-3">

        {/* ── Filter toggle ── */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card text-sm font-semibold text-fg hover:bg-muted transition"
          >
            <Filter className="w-4 h-4 text-muted-fg" />
            Filter
            {activeCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-fg text-[10px] font-extrabold">
                {activeCount}
              </span>
            )}
          </button>
          <span className="text-xs text-muted-fg">
            {loading ? "Memuat…" : `${allResults.length} transaksi`}
          </span>
        </div>

        {/* ── Filter panel ── */}
        {filtersOpen && lookups && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Dari</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Sampai</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                  className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Event</label>
              <select
                value={filters.eventId}
                onChange={(e) => setFilters((f) => ({ ...f, eventId: e.target.value }))}
                className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Semua Event</option>
                {lookups.events.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Jenis</label>
              <select
                value={filters.kind}
                onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as Filters["kind"] }))}
                className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Semua</option>
                <option value="sale">Penjualan</option>
                <option value="void">Void</option>
                <option value="refund">Refund</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Pemilik</label>
              <select
                value={filters.ownerId}
                onChange={(e) => setFilters((f) => ({ ...f, ownerId: e.target.value }))}
                className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Semua Pemilik</option>
                {lookups.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Rekening</label>
              <select
                value={filters.paymentChannelId}
                onChange={(e) => setFilters((f) => ({ ...f, paymentChannelId: e.target.value }))}
                className="w-full h-9 border border-border rounded-xl px-2 text-sm bg-surface text-fg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Semua Rekening</option>
                {lookups.channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setFilters(defaultFilters())}
              className="text-xs text-muted-fg hover:text-destructive transition"
            >
              Reset filter
            </button>
          </div>
        )}

        {/* ── Transaction list ── */}
        {visible.length === 0 && !loading && (
          <p className="text-sm text-muted-fg text-center italic py-8">Tidak ada transaksi.</p>
        )}

        <ul className="space-y-2">
          {visible.map(({ tx, cashierName, channelName, itemCount, ownerNames }) => (
            <TxRow
              key={tx.id}
              tx={tx}
              cashierName={cashierName}
              channelName={channelName}
              itemCount={itemCount}
              ownerNames={ownerNames}
            />
          ))}
        </ul>

        {hasMore && (
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="w-full py-3 rounded-2xl border border-border text-sm font-semibold text-muted-fg hover:bg-muted transition"
          >
            Muat lebih banyak ({allResults.length - visibleCount} tersisa)
          </button>
        )}
      </div>
    </div>
  );
}
