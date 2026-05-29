import React, { useId, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { idb } from "../lib/db.js";
import { useAuthStore } from "../store/auth.js";
import { MobileAppBar } from "../components/MobileAppBar.js";

interface Event {
  id: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  status: string;
  version: number;
  createdAt: number;
}

const inputCls = "w-full h-11 border border-border rounded-xl px-3 text-sm font-medium text-fg bg-surface focus:outline-none focus:ring-2 focus:ring-primary transition";
const labelCls = "block text-[10px] font-extrabold tracking-widest uppercase text-muted-fg mb-1";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-fg",
    active: "bg-success bg-opacity-15 text-success",
    closed: "bg-destructive bg-opacity-15 text-destructive",
  };
  const label: Record<string, string> = { draft: "Draft", active: "Aktif", closed: "Ditutup" };
  return (
    <span className={`text-[10px] font-extrabold tracking-widest uppercase px-2 py-0.5 rounded-full ${map[status] ?? map.draft}`}>
      {label[status] ?? status}
    </span>
  );
}

export function EventsAdminPage() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const nameId = useId();
  const venueId = useId();
  const startId = useId();
  const endId = useId();
  const statusId = useId();

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(1);
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState<"draft" | "active" | "closed">("draft");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.events.list();
      setEvents(list);
      // Also sync to IDB for offline access
      for (const ev of list) {
        await idb.events.put(ev as unknown as import("../lib/db.js").IdbEvent);
      }
    } catch (err: unknown) {
      const apiErr = err as any;
      const isNetworkError = !apiErr.status || apiErr.name === 'NetworkError' || apiErr.name === 'TypeError' || apiErr.message?.includes('Network');
      
      if (isNetworkError) {
        // Fallback: load from IndexedDB when offline
        console.debug('[events-admin] network error, falling back to IDB');
        try {
          const idbList = await idb.events.toArray();
          setEvents(idbList as unknown as Event[]);
        } catch (idbErr) {
          console.error('[events-admin] IDB fallback failed', idbErr);
          setError("Anda sedang offline dan data tidak tersedia. Coba lagi saat koneksi pulih.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Gagal memuat event.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  function resetForm() {
    setName(""); setVenue(""); setStartDate(""); setEndDate(""); setStatus("draft");
    setFormError(null); setEditId(null); setEditVersion(1); setIsEditing(false);
  }

  function startCreate() { resetForm(); setIsEditing(true); }

  function startEdit(ev: Event) {
    setName(ev.name); setVenue(ev.venue); setStartDate(ev.startDate);
    setEndDate(ev.endDate); setStatus(ev.status as "draft" | "active" | "closed");
    setEditId(ev.id); setEditVersion(ev.version); setIsEditing(true); setFormError(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) { setFormError("Nama event wajib diisi."); return; }
    if (!startDate) { setFormError("Tanggal mulai wajib diisi."); return; }
    if (!endDate) { setFormError("Tanggal selesai wajib diisi."); return; }
    if (new Date(startDate) > new Date(endDate)) {
      setFormError("Tanggal selesai tidak boleh sebelum tanggal mulai."); return;
    }

    setSaving(true);
    try {
      if (editId) {
        const updated = await api.events.update(editId, { name: name.trim(), venue: venue.trim(), startDate, endDate, status, version: editVersion });
        await idb.events.put(updated as unknown as import("../lib/db.js").IdbEvent);
      } else {
        const created = await api.events.create({ name: name.trim(), venue: venue.trim(), startDate, endDate, status });
        await idb.events.put(created as unknown as import("../lib/db.js").IdbEvent);
      }
      resetForm();
      await loadEvents();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface bg-dotted-overlay flex flex-col">
      <MobileAppBar
        title="Kelola Event"
        back
        onBack={() => navigate("/config")}
        right={
          !isEditing ? (
            <button
              onClick={startCreate}
              className="text-xs font-bold text-accent border border-accent border-opacity-40 rounded-lg px-3 py-1 hover:bg-accent hover:bg-opacity-10 transition"
            >
              + Tambah
            </button>
          ) : undefined
        }
      />

      <div className="flex-1 overflow-y-auto max-w-xl mx-auto w-full p-4 space-y-4">
        {isEditing ? (
          <div className="bg-card rounded-2xl border border-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-fg">{editId ? "Edit Event" : "Tambah Event"}</h2>
              <button onClick={resetForm} className="text-xs font-bold text-muted-fg hover:text-fg">Batal</button>
            </div>

            {formError && (
              <div className="bg-destructive bg-opacity-10 border border-destructive border-opacity-30 text-destructive rounded-xl px-3 py-2 text-sm font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label htmlFor={nameId} className={labelCls}>Nama Event <span className="text-destructive">*</span></label>
                <input id={nameId} type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className={inputCls} placeholder="Contoh: Pop Con 2026" />
              </div>
              <div>
                <label htmlFor={venueId} className={labelCls}>Venue</label>
                <input id={venueId} type="text" value={venue} onChange={(e) => setVenue(e.target.value)}
                  className={inputCls} placeholder="Jakarta Convention Center" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={startId} className={labelCls}>Tanggal Mulai <span className="text-destructive">*</span></label>
                  <input id={startId} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label htmlFor={endId} className={labelCls}>Tanggal Selesai <span className="text-destructive">*</span></label>
                  <input id={endId} type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor={statusId} className={labelCls}>Status</label>
                <select id={statusId} value={status} onChange={(e) => setStatus(e.target.value as "draft" | "active" | "closed")} className={inputCls}>
                  <option value="draft">Draft</option>
                  <option value="active">Aktif</option>
                  <option value="closed">Ditutup</option>
                </select>
                {status === "active" && (
                  <p className="text-xs text-warning mt-1 font-medium">Hanya boleh ada satu event aktif dalam satu waktu.</p>
                )}
              </div>
              <button type="submit" disabled={saving}
                className="w-full h-12 bg-primary text-primary-fg font-bold rounded-2xl hover:opacity-90 transition disabled:opacity-50">
                {saving ? "Menyimpan…" : editId ? "Simpan Perubahan" : "Tambah Event"}
              </button>
            </form>
          </div>
        ) : (
          <>
            {loading ? (
              <p className="text-sm text-muted-fg py-4 text-center">Memuat…</p>
            ) : error ? (
              <p className="text-sm text-destructive py-4 text-center">{error}</p>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-fg italic py-4 text-center">Belum ada event.</p>
            ) : (
              <div className="bg-card rounded-2xl border border-border divide-y divide-border overflow-hidden">
                {events.map((ev) => (
                  <div key={ev.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-fg truncate">{ev.name}</p>
                      {ev.venue && <p className="text-xs text-muted-fg truncate">{ev.venue}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={ev.status} />
                        <span className="text-[10px] text-muted-fg">{ev.startDate} — {ev.endDate}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => startEdit(ev)}
                      className="text-xs font-bold text-accent shrink-0 hover:opacity-70"
                    >
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
