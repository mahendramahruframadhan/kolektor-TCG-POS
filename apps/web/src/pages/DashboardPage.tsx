import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { api } from "../lib/api.js";

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
        .reduce((s, t) => s + t.totalIdr, 0);

      return { gross, net: gross - voids, count: todayTxs.filter((t) => t.kind === "sale").length };
    },
    enabled: !!eventId,
  });
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  const { data: events } = useQuery({
    queryKey: ["events"],
    queryFn: () => idb.events.toArray(),
  });

  const activeEvent = events?.find((e) => e.status === "active");
  const { data: stats } = useDashboardStats(activeEvent?.id);

  async function handleLogout() {
    await api.auth.logout().catch(() => null);
    useAuthStore.getState().setUser(null);
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">KolektaPOS</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-80">{user?.displayName}</span>
          <button
            onClick={handleLogout}
            className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded"
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 space-y-4">
        {/* Active event card */}
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            Event Aktif
          </p>
          {activeEvent ? (
            <p className="font-semibold text-gray-800">{activeEvent.name}</p>
          ) : (
            <p className="text-gray-400 italic">Tidak ada event aktif</p>
          )}
        </div>

        {/* Today's totals (masked) */}
        <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            Hari Ini
          </p>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Total Penjualan</span>
            <MaskedAmount amount={stats?.gross} className="text-lg font-bold text-gray-800" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Net (setelah void)</span>
            <MaskedAmount amount={stats?.net} className="text-base font-semibold text-green-700" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Jumlah Transaksi</span>
            <span className="text-base font-semibold text-gray-700">
              {stats?.count ?? 0}
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/pos"
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 text-center font-semibold transition"
          >
            🛒 Mulai Kasir
          </Link>
          <Link
            to="/inventory"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-4 text-center font-semibold transition"
          >
            📦 Inventaris
          </Link>
          <Link
            to="/intake"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-4 text-center font-semibold transition"
          >
            ➕ Intake Kartu
          </Link>
          <Link
            to="/reports"
            className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl p-4 text-center font-semibold transition"
          >
            📊 Laporan
          </Link>
        </div>
      </main>
    </div>
  );
}
