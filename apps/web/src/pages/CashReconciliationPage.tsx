import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { idb } from "../lib/db.js";
import { api } from "../lib/api.js";
import { useAuthStore } from "../store/auth.js";
import { MaskedAmount } from "../components/MaskedAmount.js";
import { MobileAppBar } from "../components/MobileAppBar.js";
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

const inputCls = "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition";
const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

export function CashReconciliationPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [events, setEvents] = useState<IdbEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reconciliations, setReconciliations] = useState<ApiReconciliation[]>([]);
  const [loading, setLoading] = useState(false);

  const [expectedCash, setExpectedCash] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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

      const idbRec: IdbCashReconciliation = {
        id: rec.id, eventId: rec.eventId, date: rec.date,
        expectedCashIdr: rec.expectedCashIdr, countedCashIdr: rec.countedCashIdr,
        varianceIdr: rec.varianceIdr, notes: rec.notes,
        closedByUserId: rec.closedByUserId, closedAt: rec.closedAt,
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

  const variance =
    expectedCash && countedCash && !isNaN(parseInt(expectedCash)) && !isNaN(parseInt(countedCash))
      ? parseInt(countedCash) - parseInt(expectedCash)
      : null;

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar title="Rekonsiliasi Kas" back onBack={() => navigate("/admin")} />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-3">
        {/* Filters */}
        <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
          <p className={`${labelCls}`}>Filter</p>
          <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} className={inputCls}>
            <option value="">-- Pilih Event --</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.name}{ev.status === "active" ? " (aktif)" : ""}</option>
            ))}
          </select>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={inputCls} />
        </div>

        {/* New reconciliation form */}
        {user?.role === "admin" && (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-3">
            <p className={labelCls}>Input Rekonsiliasi Baru</p>

            {expectedFromIdb !== null && (
              <p className="text-xs font-medium text-primary">
                Ekspektasi kas dari sistem: <span className="font-extrabold">Rp {expectedFromIdb.toLocaleString("id-ID")}</span>
              </p>
            )}

            <div>
              <label className={labelCls}>Ekspektasi Kas (IDR)</label>
              <input type="number" value={expectedCash}
                onChange={(e) => setExpectedCash(e.target.value)}
                placeholder="0" min={0} step={1000} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Kas Terhitung (IDR)</label>
              <input type="number" value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0" min={0} step={1000} className={inputCls} />
            </div>

            {variance !== null && (
              <div className={`text-sm font-bold px-3 py-2 rounded-xl ${
                variance === 0
                  ? "bg-success bg-opacity-10 text-success border border-success border-opacity-20"
                  : "bg-destructive bg-opacity-10 text-destructive border border-destructive border-opacity-20"
              }`}>
                Selisih: Rp {variance > 0 ? "+" : ""}{variance.toLocaleString("id-ID")}
              </div>
            )}

            <div>
              <label className={labelCls}>Catatan</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} placeholder="Keterangan tambahan…"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none" />
            </div>

            {error && (
              <p className="text-xs text-destructive font-medium">{error}</p>
            )}
            {saved && (
              <p className="text-xs text-success font-bold">Rekonsiliasi berhasil disimpan.</p>
            )}

            <button
              onClick={handleSave}
              disabled={saving || !selectedEventId || !countedCash}
              className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl text-sm disabled:opacity-50 hover:opacity-90 transition"
            >
              {saving ? "Menyimpan…" : "Simpan Rekonsiliasi"}
            </button>
          </div>
        )}

        {/* History */}
        {loading ? (
          <p className="text-sm text-muted-fg text-center py-4">Memuat…</p>
        ) : reconciliations.length > 0 ? (
          <div className="space-y-3">
            <p className={`${labelCls} px-1`}>Riwayat</p>
            {reconciliations.map((rec) => (
              <div key={rec.id} className="bg-card rounded-2xl border border-border p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-bold text-fg">{rec.date}</p>
                  <span className={`text-[11px] font-extrabold tracking-widest uppercase px-2.5 py-0.5 rounded-full ${
                    rec.varianceIdr === 0
                      ? "bg-success bg-opacity-15 text-success"
                      : "bg-destructive bg-opacity-15 text-destructive"
                  }`}>
                    {rec.varianceIdr === 0
                      ? "BALANCE"
                      : `SELISIH ${rec.varianceIdr > 0 ? "+" : ""}${rec.varianceIdr.toLocaleString("id-ID")}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Ekspektasi</p>
                    <MaskedAmount amount={rec.expectedCashIdr} className="font-bold text-fg text-sm" />
                  </div>
                  <div className="bg-surface rounded-xl p-3">
                    <p className="text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1">Terhitung</p>
                    <MaskedAmount amount={rec.countedCashIdr} className="font-bold text-fg text-sm" />
                  </div>
                </div>
                {rec.notes && <p className="text-xs text-muted-fg italic">{rec.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          !loading && selectedEventId && (
            <p className="text-sm text-muted-fg text-center italic py-4">
              Belum ada rekonsiliasi untuk tanggal ini.
            </p>
          )
        )}
      </div>
    </div>
  );
}
