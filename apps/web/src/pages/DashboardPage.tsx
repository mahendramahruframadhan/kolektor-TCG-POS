import React, { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  ShoppingCart, Package, Plus, BarChart2,
  type LucideIcon,
} from "lucide-react";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
import { resetAndSync } from "../lib/background-sync.js";

function useDashboardStats(eventId: string | undefined) {
  return useQuery({
    queryKey: ["dashboard-stats", eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const txs = await idb.transactions
        .where("eventId")
        .equals(eventId)
        .toArray();

      const today = new Date().toLocaleDateString("id-ID");
      const todayTxs = txs.filter((tx) => {
        const d = new Date((tx.createdAt ?? 0) * 1000).toLocaleDateString("id-ID");
        return d === today;
      });

      const gross = todayTxs
        .filter((t) => t.kind === "sale")
        .reduce((s, t) => s + t.totalIdr, 0);
      const voids = todayTxs
        .filter((t) => t.kind === "void" || t.kind === "refund")
        .reduce((s, t) => s + Math.abs(t.totalIdr), 0);

      return { gross, net: gross - voids, count: todayTxs.filter((t) => t.kind === "sale").length };
    },
    enabled: !!eventId,
  });
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    resetAndSync().catch((err) => {
      console.warn("[sync] Initial pull failed (offline?):", err);
    });
  }, []);

  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => idb.events.toArray(),
  });

  const activeEvent = events?.find((e) => e.status === "active");
  const { data: stats } = useDashboardStats(activeEvent?.id);

  const quickActions: { to: string; Icon: LucideIcon; label: string; primary: boolean }[] = [
    { to: "/pos",       Icon: ShoppingCart, label: "Mulai Kasir", primary: true },
    { to: "/inventory", Icon: Package,      label: "Inventaris",  primary: false },
    { to: "/stock-receive", Icon: Plus,     label: "Stock Receive", primary: false },
    { to: "/reports",   Icon: BarChart2,    label: "Laporan",     primary: false },
  ];

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="KolektaPOS"
        logo={
          <img
            src="/favicon.png"
            alt="KolektaPOS"
            className="h-7 w-auto rounded-lg object-cover"
          />
        }
      />

      <main id="main-content" className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {/* User greeting */}
        <div className="flex items-center gap-3 pt-1">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary-fg">
              {user?.displayName?.[0]?.toUpperCase() ?? "?"}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-fg">{user?.displayName}</p>
            <p className="text-[10px] font-bold tracking-widest uppercase text-muted-fg">
              {user?.role === "admin" ? "Admin" : "Kasir"}
            </p>
          </div>
        </div>

        {/* Active event */}
        <div className="bg-card rounded-2xl border border-border p-4">
          <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">
            Event Aktif
          </p>
          {activeEvent ? (
            <p className="font-bold text-fg">{activeEvent.name}</p>
          ) : (
            <p className="text-muted-fg italic text-sm">Tidak ada event aktif</p>
          )}
        </div>

        {/* Today's stats */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg">
              Hari Ini
            </p>
            <p className="text-xs font-semibold text-muted-fg">
              {new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <StatRow
            label="Total Penjualan"
            value={<MaskedAmount amount={stats?.gross} className="text-lg font-extrabold text-fg" />}
          />
          <StatRow
            label="Net (setelah void)"
            value={<MaskedAmount amount={stats?.net} className="text-base font-bold text-success" />}
          />
          <StatRow
            label="Jumlah Transaksi"
            value={
              <span className="text-base font-bold text-fg">{stats?.count ?? 0}</span>
            }
          />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className={`flex flex-col items-center gap-2 p-4 rounded-2xl font-bold text-sm text-center transition active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                a.primary
                  ? "bg-primary text-primary-fg hover:opacity-90"
                  : "bg-card border border-border text-fg hover:bg-muted"
              }`}
            >
              <a.Icon className="w-6 h-6" aria-hidden="true" />
              {a.label}
            </Link>
          ))}
        </div>

      </main>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center border-b border-border pb-2.5 last:border-0 last:pb-0">
      <span className="text-sm text-muted-fg">{label}</span>
      {value}
    </div>
  );
}
