import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import type { IdbEvent, IdbCashReconciliation } from "../lib/db.js";

interface ApiReconciliation {
  id: string;
  eventId: string;
  date: string;
  expectedCashIdr: number;
  countedCashIdr: number;
  varianceIdr: number;
  notes: string;
  closedByUserId?: string;
  closedAt?: number;
}

export function CashReconciliationPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<IdbEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reconciliations, setReconciliations] = useState<ApiReconciliation[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [expectedCash, setExpectedCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Compute expected cash from IDB transactions (cash channel only)
  const [expectedFromIdb, setExpectedFromIdb] = useState<number | null>(null);

  useEffect(() => {
    idb.events.toArray().then((list) => {
      setEvents(list);
      const active = list.find((e) => e.status === "active");
      if (active) setSelectedEventId(active.id);
      else if (list.length > 0) setSelectedEventId(list[0]!.id);
    });
  }, []);

  useEffect(() => {
    if (!selectedEventId || !selectedDate) return;
    setLoading(true);

    Promise.all([
      api.cashReconciliations.list(selectedEventId, selectedDate) as Promise<ApiReconciliation[]>,
      computeExpectedCash(selectedEventId, selectedDate),
    ])
      .then(([recs, expected]) => {
        setReconciliations(recs);
        setExpectedFromIdb(expected);
        setExpectedCash(String(expected));
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [selectedEventId, selectedDate]);

  async function computeExpectedCash(eventId: string, date: string): Promise<number> {
    const channels = await idb.paymentChannels.toArray();
    const cashChannel = channels.find(
      (c) => c.type === "cash" || c.name.toLowerCase().includes("cash") || c.name.toLowerCase().includes("tunai")
    );
    if (!cashChannel) return 0;

    const allTxs = await idb.transactions.where("eventId").equals(eventId).toArray();
    const dayTxs = allTxs.filter((tx) => {
      const d = new Date((tx.paidAt ?? tx.createdAt) * 1000).toISOString().slice(0, 10);
      return d === date;
    });

    const cashTxs = dayTxs.filter((t) => t.paymentChannelId === cashChannel.id);
    return cashTxs.reduce((s, t) => s + t.totalIdr, 0);
  }

  async function handleSave() {
    if (!selectedEventId || !selectedDate) return;
    const expected = parseInt(expectedCash, 10);
    const counted = parseInt(countedCash, 10);
    if (isNaN(expected) || isNaN(counted)) {
      setError("Masukkan jumlah uang yang valid.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const rec = await api.cashReconciliations.create({
        eventId: selectedEventId,
        date: selectedDate,
        expectedCashIdr: expected,
        countedCashIdr: counted,
        notes,
      }) as ApiReconciliation;

      // Also persist to IDB for offline access
      const idbRec: IdbCashReconciliation = {
        id: rec.id,
        eventId: rec.eventId,
        date: rec.date,
        expectedCashIdr: rec.expectedCashIdr,
        countedCashIdr: rec.countedCashIdr,
        varianceIdr: rec.varianceIdr,
        notes: rec.notes,
        closedByUserId: rec.closedByUserId,
        closedAt: rec.closedAt,
      };
      await idb.cashReconciliations.put(idbRec);

      setReconciliations((prev) => [rec, ...prev]);
      setCountedCash("");
      setNotes("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan rekonsiliasi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => navigate("/dashboard")} className="text-sm font-medium opacity-80 hover:opacity-100">
          ← Dasbor
        </button>
        <h1 className="font-bold text-base">Rekonsiliasi Kas</h1>
        <span className="text-sm opacity-70">{user?.displayName}</span>
      </header>

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {/* Filters */}
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

        {/* New reconciliation form (admin only) */}
        {user?.role === "admin" && (
          <div className="bg-white rounded-xl shadow-sm p-4 space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Input Rekonsiliasi Baru</p>

            {expectedFromIdb !== null && (
              <p className="text-xs text-blue-600">
                Ekspektasi kas dari sistem: <span className="font-semibold">Rp {expectedFromIdb.toLocaleString("id-ID")}</span>
              </p>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Ekspektasi Kas (IDR)</label>
              <input type="number" value={expectedCash} onChange={(e) => setExpectedCash(e.target.value)}
                placeholder="0" min={0} step={1000}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Kas Terhitung (IDR)</label>
              <input type="number" value={countedCash} onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0" min={0} step={1000}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            {expectedCash && countedCash && !isNaN(parseInt(expectedCash)) && !isNaN(parseInt(countedCash)) && (
              <div className={`text-sm font-semibold px-3 py-2 rounded-lg ${
                parseInt(countedCash) - parseInt(expectedCash) === 0
                  ? "bg-green-50 text-green-700"
                  : "bg-red-50 text-red-700"
              }`}>
                Selisih: Rp {(parseInt(countedCash) - parseInt(expectedCash)).toLocaleString("id-ID")}
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Catatan</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} placeholder="Keterangan tambahan…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}
            {saved && <p className="text-xs text-green-600">Rekonsiliasi berhasil disimpan.</p>}

            <button onClick={handleSave} disabled={saving || !selectedEventId || !countedCash}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm disabled:opacity-50 transition">
              {saving ? "Menyimpan…" : "Simpan Rekonsiliasi"}
            </button>
          </div>
        )}

        {/* History */}
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Memuat…</p>
        ) : reconciliations.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium px-1">Riwayat</p>
            {reconciliations.map((rec) => (
              <div key={rec.id} className="bg-white rounded-xl shadow-sm p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-semibold text-gray-800">{rec.date}</p>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                    rec.varianceIdr === 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}>
                    {rec.varianceIdr === 0 ? "BALANCE" : `SELISIH ${rec.varianceIdr > 0 ? "+" : ""}${rec.varianceIdr.toLocaleString("id-ID")}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-400">Ekspektasi</p>
                    <MaskedAmount amount={rec.expectedCashIdr} className="font-semibold text-gray-700" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Terhitung</p>
                    <MaskedAmount amount={rec.countedCashIdr} className="font-semibold text-gray-700" />
                  </div>
                </div>
                {rec.notes && <p className="text-xs text-gray-500 italic">{rec.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          !loading && selectedEventId && (
            <p className="text-sm text-gray-400 text-center italic py-4">
              Belum ada rekonsiliasi untuk tanggal ini.
            </p>
          )
        )}
      </div>
    </div>
  );
}
